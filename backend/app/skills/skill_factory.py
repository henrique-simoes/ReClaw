"""Skill factory — generate skills from configuration to reduce boilerplate.

Each skill has the same core pattern:
1. plan() — generate a research plan using LLM
2. execute() — process input files + context, extract findings using LLM
3. validate_output() — check quality

This factory creates concrete skill classes from config dicts.
"""

import json
from pathlib import Path
from typing import Any

from app.core.ollama import ollama
from app.core.file_processor import process_file
from app.skills.base import BaseSkill, SkillInput, SkillOutput, SkillPhase, SkillType


def _extract_text_from_files(files: list[str], max_chars: int = 4000) -> str:
    """Extract text from input files."""
    texts = []
    total = 0
    for f in files:
        result = process_file(Path(f))
        if not result.error and result.chunks:
            for chunk in result.chunks:
                if total + len(chunk.text) > max_chars:
                    break
                texts.append(chunk.text)
                total += len(chunk.text)
    return "\n\n".join(texts)


def _parse_json_response(text: str) -> dict:
    """Try to extract JSON from an LLM response."""
    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except (json.JSONDecodeError, ValueError):
        pass
    return {}


def create_skill(
    skill_name: str,
    display: str,
    desc: str,
    phase: SkillPhase,
    skill_type: SkillType,
    plan_prompt: str,
    execute_prompt: str,
    output_schema: str,
) -> type[BaseSkill]:
    """Create a concrete skill class from configuration.

    Args:
        skill_name: Unique identifier (e.g., 'competitive-analysis')
        display: Human name (e.g., 'Competitive Analysis')
        desc: Description of what the skill does
        phase: Double Diamond phase
        skill_type: Qual/quant/mixed
        plan_prompt: Prompt template for plan(). Uses {context}, {user_context}
        execute_prompt: Prompt template for execute(). Uses {context}, {content}
        output_schema: JSON schema description appended to execute_prompt
    """

    class GeneratedSkill(BaseSkill):
        @property
        def name(self) -> str: return skill_name
        @property
        def display_name(self) -> str: return display
        @property
        def description(self) -> str: return desc
        @property
        def phase(self) -> SkillPhase: return phase
        @property
        def skill_type(self) -> SkillType: return skill_type

        async def plan(self, skill_input: SkillInput) -> dict:
            ctx = skill_input.project_context or skill_input.user_context or "General UX research"
            prompt = plan_prompt.format(context=ctx, user_context=skill_input.user_context or "")
            resp = await ollama.chat(messages=[{"role": "user", "content": prompt}], temperature=0.7)
            return {"skill": self.name, "plan": resp.get("message", {}).get("content", "")}

        async def execute(self, skill_input: SkillInput) -> SkillOutput:
            content = _extract_text_from_files(skill_input.files) if skill_input.files else ""
            if not content and not skill_input.user_context:
                return SkillOutput(success=False, summary="No input provided.", errors=["Provide files or context."])

            # Build source attribution from actual file names
            file_sources = [Path(f).name for f in skill_input.files] if skill_input.files else []
            source_label = ", ".join(file_sources[:3]) if file_sources else self.name

            ctx = "\n".join(filter(None, [skill_input.company_context, skill_input.project_context, skill_input.user_context]))
            data_content = content or (skill_input.user_context or "N/A")[:4000]
            full_prompt = execute_prompt.format(context=(ctx or "N/A")[:2000], content=data_content)
            full_prompt += f"\n\nRespond in JSON:\n{output_schema}"

            resp = await ollama.chat(messages=[{"role": "user", "content": full_prompt}], temperature=0.3)
            data = _parse_json_response(resp.get("message", {}).get("content", ""))

            # Normalize findings — handle both dict and string items from LLM
            def _as_dict(item, default_key="text"):
                return item if isinstance(item, dict) else {default_key: str(item)}

            # Use source from LLM if provided, fall back to file name(s), then skill name
            nuggets = [{"text": _as_dict(n).get("text", str(n)), "source": _as_dict(n).get("source", source_label), "tags": _as_dict(n).get("tags", [])}
                       for n in data.get("nuggets", [])]
            facts = [{"text": _as_dict(f).get("text", str(f))} for f in data.get("facts", [])]
            insights = [{"text": _as_dict(i).get("text", str(i)), "confidence": _as_dict(i).get("confidence", "medium")}
                        for i in data.get("insights", [])]
            recommendations = [{"text": _as_dict(r).get("text", str(r)), "priority": _as_dict(r).get("priority", "medium")}
                               for r in data.get("recommendations", [])]

            return SkillOutput(
                success=True,
                summary=data.get("summary", f"Completed {display} analysis."),
                nuggets=nuggets, facts=facts, insights=insights, recommendations=recommendations,
                artifacts={f"{skill_name}_analysis.json": json.dumps(data, indent=2)},
                suggestions=data.get("suggestions", []),
            )

    # Set a unique class name for debugging
    GeneratedSkill.__name__ = f"{display.replace(' ', '')}Skill"
    GeneratedSkill.__qualname__ = GeneratedSkill.__name__
    return GeneratedSkill
