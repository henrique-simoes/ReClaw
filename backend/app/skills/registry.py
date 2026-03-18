"""Skill registry — load, register, and retrieve skills."""

import logging
from typing import Type

from app.skills.base import BaseSkill, SkillPhase

logger = logging.getLogger(__name__)


class SkillRegistry:
    """Central registry for all UXR skills."""

    def __init__(self) -> None:
        self._skills: dict[str, BaseSkill] = {}

    def register(self, skill_class: Type[BaseSkill]) -> None:
        """Register a skill class."""
        instance = skill_class()
        self._skills[instance.name] = instance
        logger.info(f"Registered skill: {instance.name} ({instance.phase.value})")

    def get(self, name: str) -> BaseSkill | None:
        """Get a skill by name."""
        return self._skills.get(name)

    def list_all(self) -> list[BaseSkill]:
        """List all registered skills."""
        return list(self._skills.values())

    def list_by_phase(self, phase: SkillPhase) -> list[BaseSkill]:
        """List skills for a specific Double Diamond phase."""
        return [s for s in self._skills.values() if s.phase == phase]

    def list_names(self) -> list[str]:
        """List all skill names."""
        return list(self._skills.keys())

    def to_dict(self) -> dict:
        """Serialize all skills metadata."""
        return {
            "skills": [s.to_dict() for s in self._skills.values()],
            "count": len(self._skills),
            "by_phase": {
                phase.value: len(self.list_by_phase(phase))
                for phase in SkillPhase
            },
        }


# Global registry instance
registry = SkillRegistry()


def load_default_skills() -> None:
    """Load all built-in skills into the registry."""
    # Hand-crafted skills (complex logic)
    from app.skills.discover.user_interviews import UserInterviewsSkill
    from app.skills.discover.contextual_inquiry import ContextualInquirySkill
    from app.skills.discover.diary_studies import DiaryStudiesSkill
    from app.skills.intercoder import KappaIntercoderSkill

    registry.register(UserInterviewsSkill)
    registry.register(ContextualInquirySkill)
    registry.register(DiaryStudiesSkill)
    registry.register(KappaIntercoderSkill)

    # Factory-generated skills (standard pattern)
    from app.skills.all_skills import ALL_FACTORY_SKILLS

    for skill_class in ALL_FACTORY_SKILLS:
        # Skip factory kappa — replaced by hand-written KappaIntercoderSkill
        if skill_class().name == "kappa-thematic-analysis":
            continue
        registry.register(skill_class)

    logger.info(f"Loaded {len(registry.list_all())} skills total.")
    for phase in SkillPhase:
        count = len(registry.list_by_phase(phase))
        logger.info(f"  {phase.value}: {count} skills")
