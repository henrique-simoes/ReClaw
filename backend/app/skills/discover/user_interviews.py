"""User Interviews skill — the reference implementation for ReClaw skills.

Capabilities:
- Generate interview guides based on research questions
- Process interview transcripts (extract nuggets, themes, patterns)
- Identify follow-up questions and research gaps
- Synthesize findings across multiple interviews
"""

import json
from pathlib import Path

from app.core.ollama import ollama
from app.core.file_processor import process_file
from app.core.rag import retrieve_context
from app.skills.base import BaseSkill, SkillInput, SkillOutput, SkillPhase, SkillType


INTERVIEW_GUIDE_PROMPT = """You are an expert UX Researcher creating an interview guide.

## Context
{context}

## Research Questions
{research_questions}

## Instructions
Create a semi-structured interview guide with:
1. **Introduction script** (2-3 sentences to put the participant at ease)
2. **Warm-up questions** (2-3 easy questions to build rapport)
3. **Core questions** (8-12 questions organized by theme, each with 2-3 probing follow-ups)
4. **Closing questions** (2-3 wrap-up questions including "Is there anything else?")
5. **Debrief script** (thank them, explain next steps)

For each core question, include:
- The main question
- Why you're asking it (research goal)
- 2-3 follow-up probes
- Things to watch for (body language, hesitation, emotion)

Format as clean Markdown."""


TRANSCRIPT_ANALYSIS_PROMPT = """You are an expert UX Researcher analyzing an interview transcript.

## Project Context
{context}

## Interview Transcript
{transcript}

## Instructions
Analyze this interview transcript and extract:

### 1. Nuggets (Direct Evidence)
Extract 5-15 key quotes or observations. For each:
- The exact quote or paraphrased observation
- Timestamp or location in the transcript (if available)
- Relevant tags (themes it relates to)
- Emotional tone (neutral, positive, negative, frustrated, excited, etc.)

### 2. Key Themes
Identify 3-7 recurring themes with:
- Theme name
- Brief description
- Supporting nugget references
- Strength (how many data points support it)

### 3. Pain Points
List specific pain points mentioned or implied:
- Description
- Severity (1-5)
- Frequency indicator (mentioned once vs. recurring)

### 4. Opportunities
Positive signals or unmet needs that suggest opportunities:
- Description
- Potential impact

### 5. Follow-up Questions
3-5 questions you'd want to explore in the next interview based on what you learned.

### 6. Participant Summary
A 2-3 sentence summary of this participant's experience and perspective.

Respond in valid JSON with this structure:
{{
    "nuggets": [{{"text": "...", "location": "...", "tags": ["..."], "tone": "..."}}],
    "themes": [{{"name": "...", "description": "...", "strength": 1-5}}],
    "pain_points": [{{"description": "...", "severity": 1-5, "frequency": "once|recurring"}}],
    "opportunities": [{{"description": "...", "impact": "low|medium|high"}}],
    "follow_up_questions": ["..."],
    "participant_summary": "..."
}}"""


SYNTHESIS_PROMPT = """You are an expert UX Researcher synthesizing findings across multiple interviews.

## Project Context
{context}

## Individual Interview Analyses
{analyses}

## Instructions
Synthesize the findings across all interviews:

### 1. Cross-cutting Themes
Identify themes that appear across multiple interviews:
- Theme name and description
- How many participants mentioned it
- Key supporting quotes
- Confidence level (high/medium/low based on evidence strength)

### 2. Facts (Verified Claims)
Statements that are supported by multiple data points:
- The fact statement
- Number of supporting data points
- Sources

### 3. Insights (Patterns & Conclusions)
Higher-level patterns you see across the data:
- The insight
- Supporting facts
- Confidence level
- Potential impact on the project

### 4. Recommendations
What should the team do based on these findings:
- Recommendation
- Supporting insights
- Priority (low/medium/high/critical)
- Effort estimate (low/medium/high)

### 5. Research Gaps
What questions remain unanswered:
- Gap description
- Suggested method to fill it
- Priority

Respond in valid JSON with this structure:
{{
    "themes": [{{"name": "...", "description": "...", "participant_count": 0, "quotes": ["..."], "confidence": "high|medium|low"}}],
    "facts": [{{"text": "...", "evidence_count": 0, "sources": ["..."]}}],
    "insights": [{{"text": "...", "supporting_facts": ["..."], "confidence": "high|medium|low", "impact": "low|medium|high"}}],
    "recommendations": [{{"text": "...", "supporting_insights": ["..."], "priority": "low|medium|high|critical", "effort": "low|medium|high"}}],
    "research_gaps": [{{"description": "...", "suggested_method": "...", "priority": "low|medium|high"}}]
}}"""


class UserInterviewsSkill(BaseSkill):
    """Skill for planning, conducting, and analyzing user interviews."""

    @property
    def name(self) -> str:
        return "user-interviews"

    @property
    def display_name(self) -> str:
        return "User Interviews"

    @property
    def description(self) -> str:
        return (
            "Plan, conduct, and analyze user interviews. "
            "Generate interview guides, process transcripts, extract nuggets and themes, "
            "and synthesize findings across multiple interviews."
        )

    @property
    def phase(self) -> SkillPhase:
        return SkillPhase.DISCOVER

    @property
    def skill_type(self) -> SkillType:
        return SkillType.QUALITATIVE

    async def plan(self, skill_input: SkillInput) -> dict:
        """Generate an interview research plan."""
        research_questions = skill_input.parameters.get(
            "research_questions", "Understand user experience and pain points"
        )
        num_participants = skill_input.parameters.get("num_participants", 5)

        context_parts = []
        if skill_input.company_context:
            context_parts.append(f"Company: {skill_input.company_context}")
        if skill_input.project_context:
            context_parts.append(f"Project: {skill_input.project_context}")
        if skill_input.user_context:
            context_parts.append(f"Additional context: {skill_input.user_context}")

        context = "\n".join(context_parts) if context_parts else "No additional context provided."

        # Generate interview guide
        prompt = INTERVIEW_GUIDE_PROMPT.format(
            context=context,
            research_questions=research_questions,
        )

        response = await ollama.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )

        guide_content = response.get("message", {}).get("content", "")

        return {
            "skill": self.name,
            "plan_type": "interview_guide",
            "research_questions": research_questions,
            "recommended_participants": num_participants,
            "estimated_time_per_interview": "45-60 minutes",
            "guide": guide_content,
            "steps": [
                f"Recruit {num_participants} participants matching your target audience",
                "Review and customize the interview guide below",
                "Conduct interviews (record with consent)",
                "Upload transcripts to ReClaw for analysis",
                "Review extracted nuggets and themes",
                "Synthesize findings across all interviews",
            ],
        }

    async def execute(self, skill_input: SkillInput) -> SkillOutput:
        """Process interview transcripts and extract findings."""
        mode = skill_input.parameters.get("mode", "analyze")

        if mode == "plan":
            plan = await self.plan(skill_input)
            return SkillOutput(
                success=True,
                summary="Interview guide generated.",
                artifacts={"interview_guide.md": plan["guide"]},
                suggestions=plan["steps"],
            )

        # Analyze mode — process transcript files or inline context
        context_parts = []
        if skill_input.project_context:
            context_parts.append(skill_input.project_context)
        if skill_input.company_context:
            context_parts.append(skill_input.company_context)
        if skill_input.user_context:
            context_parts.append(skill_input.user_context)
        context = "\n".join(context_parts) if context_parts else "No context."

        if not skill_input.files and not skill_input.user_context:
            return SkillOutput(
                success=False,
                summary="No files provided for analysis.",
                errors=["Please provide interview transcript files."],
            )

        # Process each transcript
        all_analyses = []
        all_nuggets = []
        all_errors = []

        # If files provided, process them; otherwise use inline user_context as transcript
        transcripts_to_analyze = []

        for file_path_str in (skill_input.files or []):
            file_path = Path(file_path_str)
            if not file_path.exists():
                all_errors.append(f"File not found: {file_path_str}")
                continue

            # Extract text from file
            processed = process_file(file_path)
            if processed.error:
                all_errors.append(f"Error processing {file_path.name}: {processed.error}")
                continue

            transcripts_to_analyze.append("\n".join(chunk.text for chunk in processed.chunks))

        # Fallback: if no file transcripts, use user_context as inline data
        if not transcripts_to_analyze and skill_input.user_context:
            transcripts_to_analyze.append(skill_input.user_context)

        # Track source names for each transcript
        transcript_sources = []
        for file_path_str in (skill_input.files or []):
            transcript_sources.append(Path(file_path_str).name)
        if not transcript_sources and skill_input.user_context:
            transcript_sources.append("inline-context")

        for idx, transcript in enumerate(transcripts_to_analyze):
            source_name = transcript_sources[idx] if idx < len(transcript_sources) else f"transcript-{idx}"

            # Analyze the transcript
            prompt = TRANSCRIPT_ANALYSIS_PROMPT.format(
                context=context,
                transcript=transcript[:4000],  # Limit transcript length for context window
            )

            response = await ollama.chat(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
            )

            response_text = response.get("message", {}).get("content", "")

            # Parse JSON response
            try:
                # Try to extract JSON from the response
                json_start = response_text.find("{")
                json_end = response_text.rfind("}") + 1
                if json_start >= 0 and json_end > json_start:
                    analysis = json.loads(response_text[json_start:json_end])
                else:
                    analysis = {"raw_analysis": response_text}
            except json.JSONDecodeError:
                analysis = {"raw_analysis": response_text}

            analysis["source_file"] = source_name
            all_analyses.append(analysis)

            # Extract nuggets
            for nugget_data in analysis.get("nuggets", []):
                all_nuggets.append({
                    "text": nugget_data.get("text", ""),
                    "source": source_name,
                    "source_location": nugget_data.get("location", ""),
                    "tags": nugget_data.get("tags", []),
                })

        # If multiple transcripts, synthesize across them
        synthesis = None
        if len(all_analyses) > 1:
            analyses_text = json.dumps(all_analyses, indent=2)
            synthesis_prompt = SYNTHESIS_PROMPT.format(
                context=context,
                analyses=analyses_text[:12000],
            )

            synth_response = await ollama.chat(
                messages=[{"role": "user", "content": synthesis_prompt}],
                temperature=0.3,
            )

            synth_text = synth_response.get("message", {}).get("content", "")
            try:
                json_start = synth_text.find("{")
                json_end = synth_text.rfind("}") + 1
                if json_start >= 0 and json_end > json_start:
                    synthesis = json.loads(synth_text[json_start:json_end])
            except json.JSONDecodeError:
                synthesis = {"raw_synthesis": synth_text}

        # Build output
        facts = []
        insights = []
        recommendations = []
        suggestions = []

        if synthesis:
            facts = [{"text": f["text"]} for f in synthesis.get("facts", [])]
            insights = [
                {"text": i["text"], "confidence": i.get("confidence", "medium")}
                for i in synthesis.get("insights", [])
            ]
            recommendations = [
                {
                    "text": r["text"],
                    "priority": r.get("priority", "medium"),
                    "effort": r.get("effort", "medium"),
                }
                for r in synthesis.get("recommendations", [])
            ]
            for gap in synthesis.get("research_gaps", []):
                suggestions.append(
                    f"Research gap: {gap['description']} — "
                    f"Consider: {gap.get('suggested_method', 'further investigation')}"
                )

        # Generate summary
        num_files = len(skill_input.files)
        num_analyzed = len(all_analyses)
        summary = (
            f"Analyzed {num_analyzed}/{num_files} interview transcripts. "
            f"Extracted {len(all_nuggets)} nuggets, {len(facts)} facts, "
            f"{len(insights)} insights, {len(recommendations)} recommendations."
        )

        return SkillOutput(
            success=len(all_errors) == 0 or len(all_analyses) > 0,
            summary=summary,
            nuggets=all_nuggets,
            facts=facts,
            insights=insights,
            recommendations=recommendations,
            artifacts={
                "analysis.json": json.dumps(all_analyses, indent=2),
                **({"synthesis.json": json.dumps(synthesis, indent=2)} if synthesis else {}),
            },
            suggestions=suggestions,
            errors=all_errors,
        )
