"""Embedding cache — avoids re-hitting the embedding API for repeated queries."""

from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Optional

import aiosqlite

from app.config import settings

logger = logging.getLogger(__name__)

_DB_PATH: str | None = None


def _get_db_path() -> str:
    global _DB_PATH
    if _DB_PATH is None:
        p = Path(settings.data_dir) / "embedding_cache.db"
        p.parent.mkdir(parents=True, exist_ok=True)
        _DB_PATH = str(p)
    return _DB_PATH


class EmbeddingCache:
    """SQLite-backed cache for embedding vectors keyed by (model, text_hash)."""

    def __init__(self) -> None:
        self._initialized = False

    async def _ensure_db(self) -> aiosqlite.Connection:
        db = await aiosqlite.connect(_get_db_path())
        if not self._initialized:
            await db.execute(
                "CREATE TABLE IF NOT EXISTS cache ("
                "  key TEXT PRIMARY KEY,"
                "  model TEXT NOT NULL,"
                "  vector TEXT NOT NULL,"
                "  created_at REAL NOT NULL"
                ")"
            )
            await db.commit()
            self._initialized = True
        return db

    @staticmethod
    def _cache_key(model_name: str, text: str) -> str:
        return hashlib.sha256(f"{model_name}:{text}".encode()).hexdigest()

    async def get(self, model_name: str, text: str) -> Optional[list[float]]:
        key = self._cache_key(model_name, text)
        db = await self._ensure_db()
        try:
            async with db.execute("SELECT vector FROM cache WHERE key = ?", (key,)) as cur:
                row = await cur.fetchone()
            if row:
                return json.loads(row[0])
            return None
        finally:
            await db.close()

    async def put(self, model_name: str, text: str, vector: list[float]) -> None:
        key = self._cache_key(model_name, text)
        db = await self._ensure_db()
        try:
            await db.execute(
                "INSERT OR REPLACE INTO cache (key, model, vector, created_at) VALUES (?, ?, ?, ?)",
                (key, model_name, json.dumps(vector), time.time()),
            )
            await db.commit()
        finally:
            await db.close()

    async def invalidate_model(self, model_name: str) -> int:
        """Remove all cached embeddings for a specific model."""
        db = await self._ensure_db()
        try:
            cur = await db.execute("DELETE FROM cache WHERE model = ?", (model_name,))
            await db.commit()
            return cur.rowcount
        finally:
            await db.close()

    async def clear(self) -> None:
        db = await self._ensure_db()
        try:
            await db.execute("DELETE FROM cache")
            await db.commit()
        finally:
            await db.close()

    async def stats(self) -> dict:
        db = await self._ensure_db()
        try:
            async with db.execute("SELECT COUNT(*) FROM cache") as cur:
                row = await cur.fetchone()
                total = row[0] if row else 0
            async with db.execute("SELECT model, COUNT(*) FROM cache GROUP BY model") as cur:
                by_model = {r[0]: r[1] async for r in cur}
            return {"total_entries": total, "by_model": by_model}
        finally:
            await db.close()


embedding_cache = EmbeddingCache()
