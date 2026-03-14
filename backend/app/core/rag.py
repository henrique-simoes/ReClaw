"""RAG pipeline — retrieve relevant context and augment LLM prompts."""

from dataclasses import dataclass
from pathlib import Path

import lancedb
import pyarrow as pa

from app.config import settings
from app.core.embeddings import EmbeddedChunk, TextChunk, embed_chunks, embed_text


@dataclass
class RetrievalResult:
    """A single retrieval result from the vector store."""

    text: str
    source: str
    page: int | None
    score: float


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

    async def add_chunks(self, embedded_chunks: list[EmbeddedChunk]) -> int:
        """Add embedded chunks to the vector store.

        Returns:
            Number of chunks added.
        """
        if not embedded_chunks:
            return 0

        records = []
        for ec in embedded_chunks:
            records.append({
                "vector": ec.vector,
                "text": ec.chunk.text,
                "source": ec.chunk.source,
                "page": ec.chunk.page or 0,
                "position": ec.chunk.position,
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
    ) -> list[RetrievalResult]:
        """Search for similar chunks.

        Args:
            query_vector: Query embedding vector.
            top_k: Number of results to return.
            score_threshold: Minimum similarity score.

        Returns:
            List of retrieval results sorted by relevance.
        """
        k = top_k or settings.rag_top_k
        threshold = score_threshold or settings.rag_score_threshold

        if not self._ensure_table():
            return []

        table = self.db.open_table(self.table_name)

        results = (
            table.search(query_vector)
            .limit(k)
            .to_pandas()
        )

        retrieval_results = []
        for _, row in results.iterrows():
            score = 1 - row.get("_distance", 1.0)  # LanceDB returns distance, convert to similarity
            if score >= threshold:
                retrieval_results.append(
                    RetrievalResult(
                        text=row["text"],
                        source=row["source"],
                        page=int(row["page"]) if row["page"] else None,
                        score=score,
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

    async def count(self) -> int:
        """Count total chunks in the store."""
        if not self._ensure_table():
            return 0
        table = self.db.open_table(self.table_name)
        return table.count_rows()


async def ingest_chunks(project_id: str, chunks: list[TextChunk]) -> int:
    """Embed and store text chunks for a project.

    Args:
        project_id: Project identifier.
        chunks: Text chunks to embed and store.

    Returns:
        Number of chunks ingested.
    """
    if not chunks:
        return 0

    embedded = await embed_chunks(chunks)
    store = VectorStore(project_id)
    return await store.add_chunks(embedded)


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
    store = VectorStore(project_id)
    results = await store.search(query_vector, top_k=top_k)

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
