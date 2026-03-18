"""Persistent Codebook model for qualitative coding.

Stores codebooks and individual codes with definitions, inclusion/exclusion
criteria, and versioning. Supports hierarchical codes (parent/child) and
tracks which project and version each codebook belongs to.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.database import Base


class Codebook(Base):
    """A versioned codebook for qualitative coding.

    Each project can have multiple codebooks (e.g., one per analysis round).
    Codebooks are versioned — when codes are refined after ICR review,
    a new version is created to maintain an audit trail.
    """

    __tablename__ = "codebooks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    description: Mapped[str] = mapped_column(Text, default="")
    approach: Mapped[str] = mapped_column(String(20), default="inductive")  # inductive/deductive/hybrid
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft/in_use/archived
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    project = relationship("Project", back_populates="codebooks")
    codes = relationship("Code", back_populates="codebook", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "project_id": self.project_id,
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "approach": self.approach,
            "status": self.status,
            "code_count": len(self.codes) if self.codes else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Code(Base):
    """An individual code within a codebook.

    Follows Saldana's codebook structure: name, definition,
    inclusion/exclusion criteria, and examples. Supports hierarchical
    codes via parent_code_id for axial coding relationships.
    """

    __tablename__ = "codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    codebook_id: Mapped[str] = mapped_column(ForeignKey("codebooks.id"), nullable=False)
    parent_code_id: Mapped[str | None] = mapped_column(ForeignKey("codes.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    definition: Mapped[str] = mapped_column(Text, default="")
    inclusion_criteria: Mapped[str] = mapped_column(Text, default="")
    exclusion_criteria: Mapped[str] = mapped_column(Text, default="")
    examples: Mapped[str] = mapped_column(Text, default="")  # JSON array of example quotes
    code_type: Mapped[str] = mapped_column(String(30), default="descriptive")  # descriptive/in_vivo/process/emotion/evaluation
    frequency: Mapped[int] = mapped_column(Integer, default=0)
    kappa: Mapped[float | None] = mapped_column(Float, nullable=True)  # per-code ICR score
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    codebook = relationship("Codebook", back_populates="codes")
    children = relationship("Code", back_populates="parent", remote_side="Code.parent_code_id")
    parent = relationship("Code", back_populates="children", remote_side="Code.id")

    def to_dict(self) -> dict:
        import json
        return {
            "id": self.id,
            "codebook_id": self.codebook_id,
            "parent_code_id": self.parent_code_id,
            "name": self.name,
            "definition": self.definition,
            "inclusion_criteria": self.inclusion_criteria,
            "exclusion_criteria": self.exclusion_criteria,
            "examples": json.loads(self.examples) if self.examples else [],
            "code_type": self.code_type,
            "frequency": self.frequency,
            "kappa": self.kappa,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
