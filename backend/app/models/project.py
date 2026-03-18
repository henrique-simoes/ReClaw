"""Project database model."""

import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.database import Base


class ProjectPhase(str, enum.Enum):
    """Double Diamond project phases."""

    DISCOVER = "discover"
    DEFINE = "define"
    DEVELOP = "develop"
    DELIVER = "deliver"


class Project(Base):
    """A UX Research project."""

    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    phase: Mapped[ProjectPhase] = mapped_column(
        Enum(ProjectPhase), default=ProjectPhase.DISCOVER
    )
    company_context: Mapped[str] = mapped_column(Text, default="")
    project_context: Mapped[str] = mapped_column(Text, default="")
    guardrails: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="project", cascade="all, delete-orphan")
    nuggets = relationship("Nugget", back_populates="project", cascade="all, delete-orphan")
    facts = relationship("Fact", back_populates="project", cascade="all, delete-orphan")
    insights = relationship("Insight", back_populates="project", cascade="all, delete-orphan")
    recommendations = relationship(
        "Recommendation", back_populates="project", cascade="all, delete-orphan"
    )
    sessions = relationship("ChatSession", back_populates="project", cascade="all, delete-orphan")
    codebooks = relationship("Codebook", back_populates="project", cascade="all, delete-orphan")
