"""RAG pipeline — retrieve relevant context and augment LLM prompts."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path

import lancedb
import pyarrow as pa

from app.config import settings
from app.core.embeddings import EmbeddedChunk, TextChunk, embed_chunks, embed_text
from app.core.keyword_index import KeywordIndex, KeywordResult

logger = logging.getLogger(__name__)


@dataclass
class RetrievalResult:
    """A single retrieval result from the vector store."""

    text: str
    source: str
    page: int | None
    score: float
    agent_id: str = ""
    created_at: float = 0.0
    confidence: float = 1.0


@dataclass
class RAGContext:
    """Augmented context for an LLM prompt."""

    query: str
    retrieved: list[RetrievalResult]
    context_text: str

    @property
    def has_context(self) -> bool:
        return len(self.retrieved) > 0


class VectorStore:
    """LanceDB-backed vector store for a project."""

    def __init__(self, project_id: str) -> None:
        self.project_id = project_id
        db_path = Path(settings.lance_db_path) / project_id
        db_path.mkdir(parents=True, exist_ok=True)
        self.db = lancedb.connect(str(db_path))
        self.table_name = "chunks"

    def _ensure_table(self) -> bool:
        """Check if the chunks table exists."""
        return self.table_name in self.db.table_names()

    def _table_has_column(self, column: str) -> bool:
        """Check whether the existing table has *column*."""
        if not self._ensure_table():
            return False
        try:
            table = self.db.open_table(self.table_name)
            schema = table.schema
            return column in [f.name for f in schema]
        except Exception:
            return False

    async def add_chunks(
        self,
        embedded_chunks: list[EmbeddedChunk],
        *,
        agent_id: str = "",
        confidence: float = 1.0,
    ) -> int:
        """Add embedded chunks to the vector store.

        Returns:
            Number of chunks added.
        """
        if not embedded_chunks:
            return 0

        now = time.time()
        records = []
        for ec in embedded_chunks:
            source = ec.chunk.source
            file_type = Path(source).suffix.lstrip(".") if source else ""
            chunk_type = getattr(ec.chunk, "chunk_type", "character")
            records.append({
                "vector": ec.vector,
                "text": ec.chunk.text,
                "source": source,
                "page": ec.chunk.page or 0,
                "position": ec.chunk.position,
                "agent_id": agent_id,
                "file_type": file_type,
                "chunk_type": chunk_type,
                "created_at": now,
                "confidence": confidence,
            })

        if self._ensure_table():
            table = self.db.open_table(self.table_name)
            table.add(records)
        else:
            self.db.create_table(self.table_name, records)

        return len(records)

    async def search(
        self,
        query_vector: list[float],
        top_k: int | None = None,
        score_threshold: float | None = None,
        *,
        source_filter: str | None = None,
        file_type_filter: str | None = None,
        agent_id: str | None = None,
    ) -> list[RetrievalResult]:
        """Search for similar chunks.

        Args:
            query_vector: Query embedding vector.
            top_k: Number of results to return.
            score_threshold: Minimum similarity score.
            source_filter: Only return results from this source path.
            file_type_filter: Only return results with this file type extension.
            agent_id: Only return results produced by this agent.

        Returns:
            List of retrieval results sorted by relevance.
        """
        k = top_k or settings.rag_top_k
        threshold = score_threshold or settings.rag_score_threshold

        if not self._ensure_table():
            return []

        table = self.db.open_table(self.table_name)

        query_builder = table.search(query_vector).metric("cosine").limit(k)

        # Build optional LanceDB filter from provided params
        filter_clauses: list[str] = []
        if source_filter and self._table_has_column("source"):
            safe = source_filter.replace("'", "''")
            filter_clauses.append(f"source = '{safe}'")
        if file_type_filter and self._table_has_column("file_type"):
            safe = file_type_filter.replace("'", "''")
            filter_clauses.append(f"file_type = '{safe}'")
        if agent_id is not None and self._table_has_column("agent_id"):
            safe = agent_id.replace("'", "''")
            filter_clauses.append(f"agent_id = '{safe}'")

        if filter_clauses:
            try:
                query_builder = query_builder.where(" AND ".join(filter_clauses))
            except Exception:
                # Old table schema may not support filter columns — fall back
                logger.debug("Metadata filter failed; falling back to unfiltered search")

        results = query_builder.to_pandas()

        retrieval_results = []
        for _, row in results.iterrows():
            score = 1 - row.get("_distance", 1.0)  # LanceDB returns distance, convert to similarity
            # Skip rows with null/empty text (corrupted or incomplete chunks)
            text_val = row.get("text")
            import pandas as pd
            if text_val is None or (isinstance(text_val, float) and pd.isna(text_val)) or str(text_val).strip() == "":
                continue
            if score >= threshold:
                retrieval_results.append(
                    RetrievalResult(
                        text=str(row["text"]),
                        source=str(row.get("source", "")),
                        page=int(row["page"]) if row["page"] else None,
                        score=score,
                        agent_id=str(row.get("agent_id", "")) if "agent_id" in row.index else "",
                        created_at=float(row.get("created_at", 0.0)) if "created_at" in row.index else 0.0,
                        confidence=float(row.get("confidence", 1.0)) if "confidence" in row.index else 1.0,
                    )
                )

        return retrieval_results

    async def delete_by_source(self, source: str) -> None:
        """Delete all chunks from a specific source file."""
        if not self._ensure_table():
            return
        # Sanitize input to prevent injection
        safe_source = source.replace("'", "''").replace("\\", "\\\\")
        table = self.db.open_table(self.table_name)
        table.delete(f"source = '{safe_source}'")

        # Also remove from the keyword index
        try:
            kw_index = KeywordIndex(self.project_id)
            await kw_index.delete_by_source(source)
        except Exception as e:
            logger.warning(f"Keyword index delete failed during source delete: {e}")

    async def count(self) -> int:
        """Count total chunks in the store."""
        if not self._ensure_table():
            return 0
        table = self.db.open_table(self.table_name)
        return table.count_rows()


# ---------------------------------------------------------------------------
# Hybrid search helpers
# ---------------------------------------------------------------------------

async def hybrid_search(
    project_id: str,
    query: str,
    query_vector: list[float],
    top_k: int | None = None,
    *,
    source_filter: str | None = None,
    file_type_filter: str | None = None,
    agent_id: str | None = None,
) -> list[RetrievalResult]:
    """Run hybrid search combining vector similarity and BM25 keyword ranking.

    Uses Reciprocal Rank Fusion (RRF) to merge the two result lists.
    """
    k = top_k or settings.rag_top_k
    rrf_k = 60  # RRF constant

    store = VectorStore(project_id)
    kw_index = KeywordIndex(project_id)

    # Run both searches
    vector_results = await store.search(
        query_vector,
        top_k=k * 2,  # fetch more to improve fusion quality
        source_filter=source_filter,
        file_type_filter=file_type_filter,
        agent_id=agent_id,
    )
    keyword_results = await kw_index.search(query, top_k=k * 2)

    vw = settings.rag_hybrid_vector_weight
    kw = settings.rag_hybrid_keyword_weight

    # Build RRF scores keyed by chunk text (for deduplication)
    scores: dict[str, dict] = {}

    for rank, r in enumerate(vector_results, 1):
        key = r.text
        if key not in scores:
            scores[key] = {"result": r, "score": 0.0}
        scores[key]["score"] += vw * (1.0 / (rrf_k + rank))

    for rank, kr in enumerate(keyword_results, 1):
        key = kr.text
        if key not in scores:
            scores[key] = {
                "result": RetrievalResult(
                    text=kr.text,
                    source=kr.source,
                    page=kr.page if kr.page else None,
                    score=0.0,
                ),
                "score": 0.0,
            }
        scores[key]["score"] += kw * (1.0 / (rrf_k + rank))

    # Sort by fused score descending and take top_k
    ranked = sorted(scores.values(), key=lambda x: x["score"], reverse=True)[:k]

    results = []
    for item in ranked:
        r = item["result"]
        r.score = item["score"]
        results.append(r)

    return results


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def ingest_chunks(
    project_id: str,
    chunks: list[TextChunk],
    *,
    agent_id: str = "",
) -> int:
    """Embed and store text chunks for a project.

    Args:
        project_id: Project identifier.
        chunks: Text chunks to embed and store.
        agent_id: Optional agent identifier (for agent-generated content).

    Returns:
        Number of chunks ingested.
    """
    if not chunks:
        return 0

    embedded = await embed_chunks(chunks)
    confidence = 0.8 if agent_id else 1.0
    store = VectorStore(project_id)
    count = await store.add_chunks(embedded, agent_id=agent_id, confidence=confidence)

    # Also index in the keyword store for hybrid search
    try:
        kw_index = KeywordIndex(project_id)
        await kw_index.add_chunks(chunks)
    except Exception as e:
        logger.warning(f"Keyword indexing failed (non-fatal): {e}")

    return count


async def retrieve_context(
    project_id: str,
    query: str,
    top_k: int | None = None,
) -> RAGContext:
    """Retrieve relevant context for a query.

    Args:
        project_id: Project identifier.
        query: The user's query.
        top_k: Number of results.

    Returns:
        RAGContext with retrieved documents and formatted context.
    """
    query_vector = await embed_text(query)
    results = await hybrid_search(project_id, query, query_vector, top_k=top_k)

    # Format context for the LLM
    context_parts = []
    for i, r in enumerate(results, 1):
        source_info = f"[Source: {r.source}"
        if r.page:
            source_info += f", page {r.page}"
        source_info += f", relevance: {r.score:.2f}]"
        context_parts.append(f"--- Document {i} {source_info} ---\n{r.text}")

    context_text = "\n\n".join(context_parts) if context_parts else ""

    return RAGContext(
        query=query,
        retrieved=results,
        context_text=context_text,
    )


def build_augmented_prompt(
    query: str,
    rag_context: RAGContext,
    project_context: str | None = None,
    company_context: str | None = None,
) -> str:
    """Build the full augmented prompt with context layers.

    Args:
        query: The user's question.
        rag_context: Retrieved context from the vector store.
        project_context: Project-level context (research brief, goals, etc.).
        company_context: Company-level context (product, culture, etc.).

    Returns:
        Formatted system prompt with all context layers.
    """
    parts = [
        "You are ReClaw, an expert UX Research assistant. "
        "You help researchers organize, analyze, and synthesize research findings. "
        "Always cite your sources when referencing specific documents. "
        "If you're uncertain, say so — never fabricate evidence."
    ]

    if company_context:
        parts.append(f"\n## Company Context\n{company_context}")

    if project_context:
        parts.append(f"\n## Project Context\n{project_context}")

    if rag_context.has_context:
        parts.append(
            f"\n## Relevant Documents\n"
            f"The following documents were retrieved from the project knowledge base. "
            f"Reference them when relevant to the user's question.\n\n"
            f"{rag_context.context_text}"
        )

    return "\n".join(parts)
