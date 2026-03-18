"""Base skill class — all UXR skills inherit from this."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class SkillPhase(str, Enum):
    """Double Diamond phase a skill belongs to."""

    DISCOVER = "discover"
    DEFINE = "define"
    DEVELOP = "develop"
    DELIVER = "deliver"


class SkillType(str, Enum):
    """Whether the skill is qualitative, quantitative, or mixed."""

    QUALITATIVE = "qualitative"
    QUANTITATIVE = "quantitative"
    MIXED = "mixed"


@dataclass
class SkillInput:
    """Input data for a skill execution."""

    project_id: str
    task_id: str | None = None
    files: list[str] = field(default_factory=list)
    parameters: dict[str, Any] = field(default_factory=dict)
    user_context: str = ""
    project_context: str = ""
    company_context: str = ""


@dataclass
class SkillOutput:
    """Output from a skill execution."""

    success: bool
    summary: str
    nuggets: list[dict] = field(default_factory=list)
    facts: list[dict] = field(default_factory=list)
    insights: list[dict] = field(default_factory=list)
    recommendations: list[dict] = field(default_factory=list)
    artifacts: dict[str, str] = field(default_factory=dict)  # filename → content
    suggestions: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class BaseSkill(ABC):
    """Abstract base class for all UXR skills.

    Every skill must implement:
    - name, description, phase, skill_type properties
    - plan(): Generate a research plan
    - execute(): Run the skill on input data
    - validate_output(): Check the output for quality
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique skill identifier (e.g., 'user-interviews')."""
        ...

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name (e.g., 'User Interviews')."""
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        """What this skill does."""
        ...

    @property
    @abstractmethod
    def phase(self) -> SkillPhase:
        """Which Double Diamond phase this skill belongs to."""
        ...

    @property
    @abstractmethod
    def skill_type(self) -> SkillType:
        """Whether this is qualitative, quantitative, or mixed."""
        ...

    @property
    def version(self) -> str:
        """Skill version for tracking updates."""
        return "1.0.0"

    @abstractmethod
    async def plan(self, skill_input: SkillInput) -> dict:
        """Generate a research plan for this skill.

        Args:
            skill_input: Input context and parameters.

        Returns:
            A plan dict with steps, estimated time, required inputs, etc.
        """
        ...

    @abstractmethod
    async def execute(self, skill_input: SkillInput) -> SkillOutput:
        """Execute the skill on the given input.

        Args:
            skill_input: Input data, files, and context.

        Returns:
            SkillOutput with findings, artifacts, and suggestions.
        """
        ...

    async def validate_output(self, output: SkillOutput) -> list[str]:
        """Validate the skill output for quality issues.

        Checks: summary presence, evidence extraction, source attribution,
        phrase-level coding rules, and evidence chain integrity.

        Args:
            output: The output to validate.

        Returns:
            List of warning messages (empty if all good).
        """
        warnings = []

        if not output.summary:
            warnings.append("No summary generated.")

        if not output.nuggets and not output.facts:
            warnings.append("No evidence (nuggets or facts) extracted.")

        for nugget in output.nuggets:
            if not nugget.get("source"):
                warnings.append(f"Nugget missing source: '{nugget.get('text', '')[:50]}...'")
            # Phrase-level coding: nugget text should be 3-30 words
            text = nugget.get("text", "")
            word_count = len(text.split())
            if word_count < 3:
                warnings.append(f"Nugget too short ({word_count} words): '{text[:50]}...'")
            if not nugget.get("tags"):
                warnings.append(f"Nugget missing tags/codes: '{text[:50]}...'")

        # Evidence chain: insights should reference facts or have supporting evidence
        if output.insights and not output.facts and not output.nuggets:
            warnings.append("Insights generated without supporting nuggets or facts (broken evidence chain).")

        # Recommendations without insights
        if output.recommendations and not output.insights:
            warnings.append("Recommendations generated without supporting insights (broken evidence chain).")

        return warnings

    def to_dict(self) -> dict:
        """Serialize skill metadata."""
        return {
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "phase": self.phase.value,
            "skill_type": self.skill_type.value,
            "version": self.version,
        }
