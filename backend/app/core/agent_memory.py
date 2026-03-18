"""Agent memory manager — private scratchpads and active memory tools."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class MemoryNote:
    text: str
    agent_id: str
    project_id: str
    tags: list[str]
    timestamp: float
    source: str = "agent_note"


class AgentMemoryManager:
    """Manages per-agent private memory and active memory tools."""

    async def write_note(
        self, agent_id: str, project_id: str, note: str, tags: list[str] | None = None
    ) -> None:
        """Agent writes a private note to its memory."""
        from app.core.rag import ingest_chunks
        from app.core.embeddings import TextChunk

        chunk = TextChunk(
            text=note,
            source=f"agent:{agent_id}:note",
            page=None,
            position=0,
            metadata={"agent_id": agent_id, "tags": tags or [], "timestamp": time.time()},
        )
        await ingest_chunks(project_id, [chunk])
        logger.info(f"Agent {agent_id} stored note in project {project_id}")

    async def read_notes(
        self, agent_id: str, project_id: str, query: Optional[str] = None, limit: int = 10
    ) -> list[dict]:
        """Read agent's private notes, optionally filtered by semantic query."""
        from app.core.rag import VectorStore
        from app.core.embeddings import embed_text

        store = VectorStore(project_id)

        if query:
            query_vector = await embed_text(query)
            results = await store.search(query_vector, top_k=limit)
            # Filter to only this agent's notes
            return [
                {"text": r.text, "source": r.source, "score": r.score}
                for r in results
                if f"agent:{agent_id}" in r.source
            ]
        else:
            # Return most recent agent notes from the store
            query_vector = await embed_text(f"notes from agent {agent_id}")
            results = await store.search(query_vector, top_k=limit)
            return [
                {"text": r.text, "source": r.source, "score": r.score}
                for r in results
                if f"agent:{agent_id}" in r.source
            ]

    async def memory_search(
        self, agent_id: str, project_id: str, query: str, top_k: int = 5
    ) -> list[dict]:
        """Agent actively searches the shared project knowledge base."""
        from app.core.rag import retrieve_context

        context = await retrieve_context(project_id, query, top_k=top_k)
        return [
            {"text": r.text, "source": r.source, "score": r.score}
            for r in context.retrieved
        ]

    async def memory_store(
        self, agent_id: str, project_id: str, note: str, tags: list[str] | None = None
    ) -> None:
        """Agent deliberately stores a note in shared project memory with provenance."""
        await self.write_note(agent_id, project_id, note, tags)

    async def get_all_notes(self, project_id: str, agent_id: Optional[str] = None) -> list[dict]:
        """Get all notes, optionally filtered by agent. For the Memory UI."""
        from app.core.rag import VectorStore

        store = VectorStore(project_id)
        try:
            if not store._ensure_table():
                return []
            table = store.db.open_table(store.table_name)
            df = table.to_pandas()

            # Filter for agent notes
            if "source" in df.columns:
                mask = df["source"].str.startswith("agent:")
                if agent_id:
                    mask = mask & df["source"].str.contains(agent_id)
                notes_df = df[mask]

                results = []
                for _, row in notes_df.iterrows():
                    results.append({
                        "text": str(row.get("text", "")),
                        "source": str(row.get("source", "")),
                    })
                return results
        except Exception as e:
            logger.warning(f"Failed to get agent notes: {e}")
        return []


agent_memory = AgentMemoryManager()
