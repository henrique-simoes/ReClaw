"""Local embedding engine using Ollama / LM Studio with caching."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.config import settings
from app.core.embedding_cache import embedding_cache
from app.core.ollama import ollama

logger = logging.getLogger(__name__)


@dataclass
class TextChunk:
    """A chunk of text with metadata for embedding."""

    text: str
    source: str
    page: int | None = None
    position: int = 0
    metadata: dict | None = None
    chunk_type: str = "character"


@dataclass
class EmbeddedChunk:
    """A text chunk with its embedding vector."""

    chunk: TextChunk
    vector: list[float]


def _embed_model_name() -> str:
    """Return the current embedding model name based on the active provider."""
    if settings.llm_provider == "lmstudio":
        return settings.lmstudio_embed_model
    return settings.ollama_embed_model


async def embed_text(text: str) -> list[float]:
    """Embed a single text string, checking the cache first."""
    model = _embed_model_name()

    cached = await embedding_cache.get(model, text)
    if cached is not None:
        return cached

    vector = await ollama.embed(text)
    await embedding_cache.put(model, text, vector)
    return vector


async def embed_chunks(chunks: list[TextChunk], batch_size: int = 32) -> list[EmbeddedChunk]:
    """Embed multiple text chunks in batches with per-chunk caching.

    Args:
        chunks: List of text chunks to embed.
        batch_size: Number of texts to embed per API call.

    Returns:
        List of embedded chunks with vectors.
    """
    model = _embed_model_name()
    results: list[EmbeddedChunk] = [None] * len(chunks)  # type: ignore[list-item]

    # First pass: check cache for each chunk
    uncached_indices: list[int] = []
    for idx, chunk in enumerate(chunks):
        cached = await embedding_cache.get(model, chunk.text)
        if cached is not None:
            results[idx] = EmbeddedChunk(chunk=chunk, vector=cached)
        else:
            uncached_indices.append(idx)

    if uncached_indices:
        logger.debug(
            "Embedding cache: %d hits, %d misses",
            len(chunks) - len(uncached_indices),
            len(uncached_indices),
        )

    # Second pass: batch-embed uncached chunks
    for batch_start in range(0, len(uncached_indices), batch_size):
        batch_indices = uncached_indices[batch_start : batch_start + batch_size]
        batch_chunks = [chunks[i] for i in batch_indices]
        texts = [c.text for c in batch_chunks]

        vectors = await ollama.embed_batch(texts)

        for i, (chunk, vector) in enumerate(zip(batch_chunks, vectors)):
            original_idx = batch_indices[i]
            results[original_idx] = EmbeddedChunk(chunk=chunk, vector=vector)
            await embedding_cache.put(model, chunk.text, vector)

    return results


async def ensure_embed_model() -> None:
    """Ensure the embedding model is available locally."""
    await ollama.ensure_model("nomic-embed-text")
