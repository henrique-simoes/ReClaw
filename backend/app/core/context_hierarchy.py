"""Context Hierarchy System — layered system prompts as source of truth.

The context hierarchy ensures agents never hallucinate or go off-track.
Each layer acts as a system prompt, with strict inheritance:

    Level 0: Platform defaults (ReClaw UXR expertise)
    Level 1: Company context (org-wide — culture, product, terminology, guardrails)
    Level 2: Product contexts (per-product — features, users, domain knowledge)
    Level 3: Project contexts (per-project — research questions, goals, timeline, phase)
    Level 4: Task contexts (per-task — specific instructions from Kanban cards)
    Level 5: Agent contexts (per-agent — agent-specific system prompts, personality, constraints)

Users can create multiple contexts at each level. The system composes
them into a final prompt that guides all agent behavior.

This is the single most important quality control mechanism in ReClaw.
"""

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select, Column, String, Text, Integer, DateTime, Boolean, ForeignKey
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.models.database import Base, async_session

logger = logging.getLogger(__name__)


class ContextDocument(Base):
    """A context document at any level of the hierarchy."""

    __tablename__ = "context_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False)  # 0-5
    level_type: Mapped[str] = mapped_column(String(50), nullable=False)  # platform, company, product, project, task, agent
    parent_id: Mapped[str] = mapped_column(String(36), default="")  # Links to parent context (e.g., project → company)
    project_id: Mapped[str] = mapped_column(String(36), default="")  # For project/task level
    content: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0)  # Higher = more important, overrides lower
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


PLATFORM_CONTEXT = """You are ReClaw, an expert UX Research assistant. You help researchers organize, analyze, and synthesize research findings using rigorous methodology.

Core principles:
- ALWAYS cite sources when referencing specific documents or data
- NEVER fabricate evidence — if uncertain, say so
- Follow Atomic Research: Nuggets → Facts → Insights → Recommendations
- Every claim must trace back to evidence
- Flag low-confidence findings explicitly
- Respect the Double Diamond: Discover → Define → Develop → Deliver
- Apply appropriate UXR methods for each research phase
- Maintain researcher ethics: informed consent, privacy, no harm
- Be specific and actionable in recommendations
"""


class ContextHierarchy:
    """Composes the full context hierarchy for any agent/task execution."""

    async def compose_context(
        self,
        db: AsyncSession,
        project_id: str | None = None,
        task_context: str = "",
        agent_context: str = "",
    ) -> str:
        """Compose the full context hierarchy into a single system prompt.

        Args:
            db: Database session
            project_id: Project to load contexts for
            task_context: Task-level context (from Kanban card)
            agent_context: Agent-specific context (from agent config)

        Returns:
            Composed system prompt string with all context layers.
        """
        layers: list[str] = []

        # Level 0: Platform defaults
        layers.append(f"## ReClaw Platform Context\n{PLATFORM_CONTEXT}")

        # Level 1-5: Load from database
        query = select(ContextDocument).where(
            ContextDocument.enabled == True
        ).order_by(ContextDocument.level, ContextDocument.priority.desc())

        if project_id:
            # Get project-specific + global contexts
            query = query.where(
                (ContextDocument.project_id == project_id) |
                (ContextDocument.project_id == "") |
                (ContextDocument.level <= 2)  # Company/product are always included
            )

        result = await db.execute(query)
        docs = result.scalars().all()

        # Group by level
        by_level: dict[int, list[ContextDocument]] = {}
        for doc in docs:
            by_level.setdefault(doc.level, []).append(doc)

        level_names = {1: "Company", 2: "Product", 3: "Project", 4: "Task", 5: "Agent"}

        for level in sorted(by_level.keys()):
            level_docs = by_level[level]
            level_name = level_names.get(level, f"Level {level}")
            for doc in level_docs:
                layers.append(f"## {level_name} Context: {doc.name}\n{doc.content}")

        # Add inline task context (from Kanban card)
        if task_context:
            layers.append(f"## Current Task Context\n{task_context}")

        # Add agent-specific context
        if agent_context:
            layers.append(f"## Agent-Specific Instructions\n{agent_context}")

        return "\n\n---\n\n".join(layers)

    async def create_context(
        self,
        db: AsyncSession,
        name: str,
        level_type: str,
        content: str,
        project_id: str = "",
        parent_id: str = "",
        priority: int = 0,
    ) -> ContextDocument:
        """Create a new context document."""
        level_map = {"platform": 0, "company": 1, "product": 2, "project": 3, "task": 4, "agent": 5}
        level = level_map.get(level_type, 3)

        doc = ContextDocument(
            id=str(uuid.uuid4()),
            name=name,
            level=level,
            level_type=level_type,
            parent_id=parent_id,
            project_id=project_id,
            content=content,
            priority=priority,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        return doc

    async def list_contexts(
        self,
        db: AsyncSession,
        level_type: str | None = None,
        project_id: str | None = None,
    ) -> list[ContextDocument]:
        """List context documents with optional filters."""
        query = select(ContextDocument).order_by(
            ContextDocument.level, ContextDocument.priority.desc()
        )
        if level_type:
            query = query.where(ContextDocument.level_type == level_type)
        if project_id:
            query = query.where(
                (ContextDocument.project_id == project_id) | (ContextDocument.project_id == "")
            )
        result = await db.execute(query)
        return list(result.scalars().all())

    async def update_context(self, db: AsyncSession, doc_id: str, updates: dict) -> ContextDocument | None:
        """Update a context document."""
        result = await db.execute(select(ContextDocument).where(ContextDocument.id == doc_id))
        doc = result.scalar_one_or_none()
        if not doc:
            return None
        for key, value in updates.items():
            if hasattr(doc, key):
                setattr(doc, key, value)
        await db.commit()
        await db.refresh(doc)
        return doc

    async def delete_context(self, db: AsyncSession, doc_id: str) -> bool:
        result = await db.execute(select(ContextDocument).where(ContextDocument.id == doc_id))
        doc = result.scalar_one_or_none()
        if not doc:
            return False
        await db.delete(doc)
        await db.commit()
        return True


# Singleton
context_hierarchy = ContextHierarchy()
