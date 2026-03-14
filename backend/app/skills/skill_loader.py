"""Skill Loader — discovers and loads skills following OpenClaw AgentSkills standard.

Skills are discovered from two sources:
1. SKILL.md files in the skills/ directory tree (OpenClaw standard)
2. JSON definitions in definitions/ (ReClaw extended format with prompts)

The SKILL.md provides metadata (name, description, phase, type) and documentation.
The JSON definition provides the LLM prompts and output schemas for execution.

Discovery follows OpenClaw's progressive disclosure:
1. Metadata (name + description) — always in context (~100 words)
2. SKILL.md body — loaded when skill triggers
3. References/scripts — loaded as needed
"""

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

SKILLS_ROOT = Path(__file__).parent.parent.parent.parent / "skills"
DEFINITIONS_DIR = Path(__file__).parent / "definitions"


@dataclass
class SkillMetadata:
    """Parsed from SKILL.md YAML frontmatter — always in context."""

    name: str
    description: str
    phase: str = "discover"
    skill_type: str = "mixed"
    version: str = "1.0.0"
    emoji: str = "🔍"
    tags: list[str] = field(default_factory=list)
    enabled: bool = True
    path: str = ""  # Path to SKILL.md


@dataclass
class LoadedSkill:
    """A fully loaded skill with metadata, body, and execution config."""

    metadata: SkillMetadata
    body: str = ""  # SKILL.md body (loaded on trigger)
    definition: dict = field(default_factory=dict)  # JSON definition (prompts, schemas)
    references: dict = field(default_factory=dict)  # reference_name → content
    scripts: list[str] = field(default_factory=list)  # script paths
    has_custom_implementation: bool = False

    @property
    def name(self) -> str:
        return self.metadata.name

    @property
    def phase(self) -> str:
        return self.metadata.phase

    def to_summary(self) -> dict:
        """Summary for API responses — lightweight."""
        return {
            "name": self.metadata.name,
            "display_name": self.definition.get("display_name", self.metadata.name.replace("-", " ").title()),
            "description": self.metadata.description,
            "phase": self.metadata.phase,
            "type": self.metadata.skill_type,
            "version": self.metadata.version,
            "enabled": self.metadata.enabled,
            "has_references": len(self.references) > 0,
            "has_scripts": len(self.scripts) > 0,
            "has_custom_impl": self.has_custom_implementation,
        }

    def to_full(self) -> dict:
        """Full skill data including body and definition."""
        return {
            **self.to_summary(),
            "body": self.body,
            "definition": self.definition,
            "references": list(self.references.keys()),
            "scripts": self.scripts,
        }


def _parse_frontmatter(content: str) -> tuple[dict, str]:
    """Parse YAML frontmatter and body from SKILL.md content."""
    if not content.startswith("---"):
        return {}, content

    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content

    try:
        fm = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        fm = {}

    body = parts[2].strip()
    return fm, body


def _extract_metadata(frontmatter: dict, skill_path: str) -> SkillMetadata:
    """Extract SkillMetadata from parsed frontmatter."""
    reclaw_meta = frontmatter.get("metadata", {}).get("reclaw", {})

    return SkillMetadata(
        name=frontmatter.get("name", ""),
        description=frontmatter.get("description", ""),
        phase=reclaw_meta.get("phase", "discover"),
        skill_type=reclaw_meta.get("type", "mixed"),
        version=reclaw_meta.get("version", "1.0.0"),
        emoji=reclaw_meta.get("emoji", "🔍"),
        tags=reclaw_meta.get("tags", []),
        enabled=reclaw_meta.get("enabled", True),
        path=skill_path,
    )


def discover_skills() -> dict[str, LoadedSkill]:
    """Discover all skills from SKILL.md files and JSON definitions.

    Returns:
        Dict of skill_name → LoadedSkill
    """
    skills: dict[str, LoadedSkill] = {}

    # 1. Discover from SKILL.md files (OpenClaw standard)
    if SKILLS_ROOT.exists():
        for skill_md in SKILLS_ROOT.rglob("SKILL.md"):
            try:
                content = skill_md.read_text(encoding="utf-8")
                frontmatter, body = _parse_frontmatter(content)

                if not frontmatter.get("name"):
                    continue

                metadata = _extract_metadata(frontmatter, str(skill_md))
                skill = LoadedSkill(metadata=metadata, body=body)

                # Check for references/
                ref_dir = skill_md.parent / "references"
                if ref_dir.exists():
                    for ref_file in ref_dir.glob("*.md"):
                        skill.references[ref_file.stem] = str(ref_file)

                # Check for scripts/
                script_dir = skill_md.parent / "scripts"
                if script_dir.exists():
                    for script_file in script_dir.glob("*"):
                        if script_file.is_file():
                            skill.scripts.append(str(script_file))

                skills[metadata.name] = skill
                logger.debug(f"Discovered skill: {metadata.name} from {skill_md}")

            except Exception as e:
                logger.error(f"Error loading {skill_md}: {e}")

    # 2. Enrich with JSON definitions (ReClaw prompts and schemas)
    if DEFINITIONS_DIR.exists():
        for json_file in DEFINITIONS_DIR.glob("*.json"):
            if json_file.name.startswith("_"):
                continue

            try:
                defn = json.loads(json_file.read_text(encoding="utf-8"))
                name = defn.get("name", "")
                if not name:
                    continue

                if name in skills:
                    # Merge definition into existing skill
                    skills[name].definition = defn
                    # Check for custom implementation
                    if defn.get("implementation") == "custom":
                        skills[name].has_custom_implementation = True
                else:
                    # Create skill from definition alone (no SKILL.md found)
                    metadata = SkillMetadata(
                        name=name,
                        description=defn.get("description", ""),
                        phase=defn.get("phase", "discover"),
                        skill_type=defn.get("skill_type", "mixed"),
                        version=defn.get("version", "1.0.0"),
                    )
                    skills[name] = LoadedSkill(metadata=metadata, definition=defn)
                    if defn.get("implementation") == "custom":
                        skills[name].has_custom_implementation = True

            except Exception as e:
                logger.error(f"Error loading definition {json_file}: {e}")

    logger.info(f"Discovered {len(skills)} skills total")
    for phase in ["discover", "define", "develop", "deliver"]:
        count = sum(1 for s in skills.values() if s.phase == phase)
        logger.info(f"  {phase}: {count} skills")

    return skills


def get_skill_catalog() -> dict:
    """Get the full skill catalog for API responses."""
    skills = discover_skills()

    catalog = {
        "total": len(skills),
        "by_phase": {},
        "skills": [],
    }

    for phase in ["discover", "define", "develop", "deliver"]:
        phase_skills = [s for s in skills.values() if s.phase == phase]
        catalog["by_phase"][phase] = {
            "count": len(phase_skills),
            "skills": [s.to_summary() for s in phase_skills],
        }
        catalog["skills"].extend([s.to_summary() for s in phase_skills])

    return catalog
