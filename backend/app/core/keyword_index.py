"""BM25 keyword index using SQLite FTS5 for hybrid search."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import aiosqlite

from app.config import settings

logger = logging.getLogger(__name__)


class KeywordResult:
    """A single keyword search result."""
    def __init__(self, text: str, source: str, page: int, rank: float):
        self.text = text
        self.source = source
        self.page = page
        self.rank = rank


class KeywordIndex:
    """SQLite FTS5 keyword index for a project."""

    def __init__(self, project_id: str) -> None:
        self.project_id = project_id
        db_dir = Path(settings.data_dir) / "keyword_index"
        db_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = str(db_dir / f"{project_id}.db")

    async def _get_db(self) -> aiosqlite.Connection:
        db = await aiosqlite.connect(self.db_path)
        await db.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts "
            "USING fts5(text, source, page UNINDEXED, content='', tokenize='porter unicode61')"
        )
        await db.commit()
        return db

    async def add_chunks(self, chunks: list) -> int:
        """Add chunks to the keyword index. chunks should have .text, .source, .page attrs."""
        if not chunks:
            return 0
        db = await self._get_db()
        try:
            rows = [(c.text, c.source, c.page or 0) for c in chunks]
            await db.executemany(
                "INSERT INTO chunks_fts (text, source, page) VALUES (?, ?, ?)", rows
            )
            await db.commit()
            return len(rows)
        finally:
            await db.close()

    async def search(self, query: str, top_k: int = 10) -> list[KeywordResult]:
        """Search using BM25 ranking."""
        if not query.strip():
            return []
        # Escape special FTS5 chars
        safe_query = query.replace('"', '""')
        db = await self._get_db()
        try:
            sql = (
                "SELECT text, source, page, rank "
                "FROM chunks_fts "
                "WHERE chunks_fts MATCH ? "
                "ORDER BY rank "
                "LIMIT ?"
            )
            async with db.execute(sql, (f'"{safe_query}"', top_k)) as cur:
                results = []
                async for row in cur:
                    results.append(KeywordResult(
                        text=row[0], source=row[1], page=row[2], rank=row[3]
                    ))
            # If exact phrase match returns nothing, try individual terms
            if not results:
                terms = " OR ".join(f'"{t}"' for t in query.split() if len(t) > 2)
                if terms:
                    async with db.execute(sql, (terms, top_k)) as cur:
                        async for row in cur:
                            results.append(KeywordResult(
                                text=row[0], source=row[1], page=row[2], rank=row[3]
                            ))
            return results
        except Exception as e:
            logger.warning(f"Keyword search failed: {e}")
            return []
        finally:
            await db.close()

    async def delete_by_source(self, source: str) -> None:
        """Delete all entries from a source file."""
        db = await self._get_db()
        try:
            # FTS5 content='' tables need special delete handling
            # We need to rebuild the whole index or use a content table
            # Simpler approach: use a regular table backing the FTS
            await db.execute(
                "INSERT INTO chunks_fts(chunks_fts, text, source, page) "
                "SELECT 'delete', text, source, page FROM chunks_fts WHERE source = ?",
                (source,)
            )
            await db.commit()
        except Exception as e:
            logger.warning(f"Keyword index delete failed for {source}: {e}")
        finally:
            await db.close()

    async def count(self) -> int:
        db = await self._get_db()
        try:
            async with db.execute("SELECT COUNT(*) FROM chunks_fts") as cur:
                row = await cur.fetchone()
                return row[0] if row else 0
        except Exception:
            return 0
        finally:
            await db.close()

    async def rebuild(self) -> None:
        """Rebuild the FTS index."""
        db = await self._get_db()
        try:
            await db.execute("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')")
            await db.commit()
        except Exception as e:
            logger.warning(f"Keyword index rebuild failed: {e}")
        finally:
            await db.close()
