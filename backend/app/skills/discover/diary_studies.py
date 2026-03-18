"""Diary Studies skill — longitudinal self-reported user experiences."""
import json
from app.core.ollama import ollama
from app.core.file_processor import process_file
from app.skills.base import BaseSkill, SkillInput, SkillOutput, SkillPhase, SkillType
from pathlib import Path

class DiaryStudiesSkill(BaseSkill):
    @property
    def name(self) -> str: return "diary-studies"
    @property
    def display_name(self) -> str: return "Diary Studies"
    @property
    def description(self) -> str:
        return "Design diary study prompts, analyze entries over time, identify behavioral patterns and emotional arcs across longitudinal self-reported data."
    @property
    def phase(self) -> SkillPhase: return SkillPhase.DISCOVER
    @property
    def skill_type(self) -> SkillType: return SkillType.QUALITATIVE

    async def plan(self, skill_input: SkillInput) -> dict:
        prompt = f"""Design a diary study plan for UX research.
Context: {skill_input.project_context or 'General UX research'}

Include: study duration recommendation, entry frequency, prompt design (structured + open-ended), 
participant guidelines, reminder strategy, sample diary prompts for each day/phase,
analysis approach, and dropout mitigation strategies. Format as Markdown."""
        resp = await ollama.chat(messages=[{"role": "user", "content": prompt}], temperature=0.7)
        return {"skill": self.name, "plan": resp.get("message", {}).get("content", "")}

    async def execute(self, skill_input: SkillInput) -> SkillOutput:
        texts = []
        for f in (skill_input.files or []):
            r = process_file(Path(f))
            if not r.error and r.chunks:
                texts.append("\n".join(c.text for c in r.chunks))

        # Fallback: use user_context as inline diary data
        if not texts and skill_input.user_context:
            texts.append(skill_input.user_context)

        if not texts:
            return SkillOutput(success=False, summary="No diary entries provided.", errors=["Upload diary entry files."])

        prompt = f"""Analyze these diary study entries for UX research patterns.
Context: {skill_input.project_context or 'N/A'}

Entries:
{chr(10).join(texts)[:8000]}

Extract:
1. Temporal patterns (how behavior/sentiment changes over time)
2. Emotional arc (mood/satisfaction trajectory)
3. Recurring behaviors and habits
4. Trigger events (what prompts specific behaviors)
5. Pain points that persist vs. resolve
6. Adaptation patterns (how users learn/adjust)
7. Key nuggets with timestamps
8. Participant-level summaries

JSON format:
{{"temporal_patterns": [{{"pattern": "...", "timeframe": "..."}}],
"emotional_arc": [{{"phase": "...", "sentiment": "positive|neutral|negative", "description": "..."}}],
"behaviors": [{{"behavior": "...", "frequency": "daily|weekly|occasional"}}],
"triggers": [{{"trigger": "...", "resulting_behavior": "..."}}],
"pain_points": [{{"issue": "...", "persistent": true, "severity": 1-5}}],
"nuggets": [{{"text": "...", "day": "...", "tags": ["..."]}}],
"summary": "..."}}"""

        resp = await ollama.chat(messages=[{"role": "user", "content": prompt}], temperature=0.3)
        text = resp.get("message", {}).get("content", "")
        try:
            data = json.loads(text[text.find("{"):text.rfind("}") + 1])
        except (json.JSONDecodeError, ValueError):
            data = {}

        nuggets = [{"text": n["text"], "source": "diary-study", "tags": n.get("tags", [])} for n in data.get("nuggets", [])]
        return SkillOutput(success=True, summary=data.get("summary", f"Analyzed diary entries. {len(nuggets)} nuggets extracted."),
                          nuggets=nuggets, artifacts={"diary_analysis.json": json.dumps(data, indent=2)})
