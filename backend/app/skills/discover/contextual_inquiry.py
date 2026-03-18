"""Contextual Inquiry skill — observe users in their natural environment."""

import json
from app.core.ollama import ollama
from app.skills.base import BaseSkill, SkillInput, SkillOutput, SkillPhase, SkillType


class ContextualInquirySkill(BaseSkill):
    @property
    def name(self) -> str: return "contextual-inquiry"
    @property
    def display_name(self) -> str: return "Contextual Inquiry"
    @property
    def description(self) -> str:
        return "Structure and analyze contextual inquiry observations — studying users in their natural work environment."
    @property
    def phase(self) -> SkillPhase: return SkillPhase.DISCOVER
    @property
    def skill_type(self) -> SkillType: return SkillType.QUALITATIVE

    async def plan(self, skill_input: SkillInput) -> dict:
        prompt = f"""Create a contextual inquiry observation plan for UX research.
Context: {skill_input.project_context or 'General UX research'}
User context: {skill_input.user_context or 'Not specified'}

Include:
1. Observation objectives (what to look for)
2. Pre-visit preparation checklist
3. Observation framework (AEIOU: Activities, Environments, Interactions, Objects, Users)
4. Interview prompts to use during observation ("Tell me what you're doing now", "Why did you do that?")
5. Note-taking template structure
6. Post-observation debrief questions
7. Ethical considerations and consent requirements

Format as Markdown."""
        response = await ollama.chat(messages=[{"role": "user", "content": prompt}], temperature=0.7)
        return {"skill": self.name, "plan": response.get("message", {}).get("content", "")}

    async def execute(self, skill_input: SkillInput) -> SkillOutput:
        from app.core.file_processor import process_file
        from pathlib import Path

        all_text = []
        for f in (skill_input.files or []):
            result = process_file(Path(f))
            if not result.error and result.chunks:
                all_text.append("\n".join(c.text for c in result.chunks))

        # Fallback: use user_context as inline observation data
        if not all_text and skill_input.user_context:
            all_text.append(skill_input.user_context)

        if not all_text:
            return SkillOutput(success=False, summary="No observation notes provided.", errors=["Provide observation note files."])

        prompt = f"""Analyze these contextual inquiry observation notes for UX research.

Project context: {skill_input.project_context or 'Not specified'}

Observation notes:
{chr(10).join(all_text)[:8000]}

Extract and structure:
1. **Activities observed** — what users were doing, step by step
2. **Environment factors** — physical/digital context affecting behavior
3. **Interactions** — how users interacted with tools, people, systems
4. **Pain points** — friction, workarounds, frustrations observed
5. **Workflow patterns** — recurring sequences, habits, shortcuts
6. **Nuggets** — specific quotes or observations (with context)
7. **Opportunities** — unmet needs or improvement areas
8. **Cultural/social factors** — team dynamics, norms, communication patterns

Respond in JSON:
{{"activities": [{{"description": "...", "frequency": "common|occasional|rare"}}],
"environment_factors": [{{"factor": "...", "impact": "positive|negative|neutral"}}],
"interactions": [{{"description": "...", "with": "tool|person|system"}}],
"pain_points": [{{"description": "...", "severity": 1-5, "workaround": "..."}}],
"workflow_patterns": [{{"pattern": "...", "participants": 0}}],
"nuggets": [{{"text": "...", "context": "...", "tags": ["..."]}}],
"opportunities": [{{"description": "...", "impact": "low|medium|high"}}],
"summary": "..."}}"""

        response = await ollama.chat(messages=[{"role": "user", "content": prompt}], temperature=0.3)
        text = response.get("message", {}).get("content", "")

        try:
            data = json.loads(text[text.find("{"):text.rfind("}") + 1])
        except (json.JSONDecodeError, ValueError):
            data = {}

        nuggets = [{"text": n["text"], "source": "contextual-inquiry", "tags": n.get("tags", [])}
                   for n in data.get("nuggets", [])]

        return SkillOutput(
            success=True,
            summary=data.get("summary", f"Analyzed contextual inquiry notes. Found {len(nuggets)} nuggets."),
            nuggets=nuggets,
            artifacts={"analysis.json": json.dumps(data, indent=2)},
        )
