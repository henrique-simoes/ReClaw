"""DAG nodes for lossless context summarization."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.database import Base


class ContextDAGNode(Base):
    """A single node in the context summarization DAG.

    Leaf nodes (depth=0) summarize a batch of contiguous messages.
    Internal nodes (depth>0) summarize child nodes from the level below.
    """

    __tablename__ = "context_dag_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    depth: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    message_ids: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of original message IDs covered
    child_node_ids: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of direct child node IDs
    token_count: Mapped[int] = mapped_column(Integer, default=0)  # tokens in summary
    original_token_count: Mapped[int] = mapped_column(Integer, default=0)  # tokens in original messages
    message_count: Mapped[int] = mapped_column(Integer, default=0)  # total original messages covered
    time_range_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_range_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
