"""UX Evaluation Agent — evaluates the overall ReClaw platform experience.

Unlike the UI Audit Agent (which checks heuristics/accessibility per component),
this agent evaluates the holistic UX: onboarding, setup flows, learning curve,
information architecture, and critical user journeys.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

from app.core.ollama import ollama

logger = logging.getLogger(__name__)


class UXEvalAgent:
    """Evaluates overall platform UX and suggests improvements."""

    def __init__(self) -> None:
        self._running = False
        self._audit_interval = 900  # 15 minutes
        self._reports: list[dict] = []

    async def start(self) -> None:
        self._running = True
        logger.info("UX Evaluation Agent started.")

        while self._running:
            try:
                report = await self.run_evaluation()
                self._reports.append(report)
                if len(self._reports) > 20:
                    self._reports = self._reports[-20:]
            except Exception as e:
                logger.error(f"UX Evaluation error: {e}")

            await asyncio.sleep(self._audit_interval)

    def stop(self) -> None:
        self._running = False

    async def run_evaluation(self) -> dict:
        """Run a UX evaluation of the ReClaw platform."""
        timestamp = datetime.now(timezone.utc).isoformat()

        # Define the user journeys to evaluate
        journeys = [
            {
                "name": "First-time Setup",
                "steps": ["Install Docker", "Run docker compose up", "Open browser at localhost:3000",
                          "See empty state", "Create first project", "Set company context"],
                "critical": True,
            },
            {
                "name": "Upload & Analyze Interview",
                "steps": ["Navigate to Interviews view", "Upload transcript file",
                          "See file in file list", "Type 'analyze interviews' in chat",
                          "See nuggets extracted", "View in Findings"],
                "critical": True,
            },
            {
                "name": "Create & Track Tasks",
                "steps": ["Navigate to Tasks view", "Create a task", "Add context to task",
                          "Agent picks up task", "See progress updates", "Review completed task"],
                "critical": True,
            },
            {
                "name": "Search & Discover Findings",
                "steps": ["Press Cmd+K", "Type search query", "See results across finding types",
                          "Click finding to see details", "Navigate to Atomic drill-down"],
                "critical": False,
            },
            {
                "name": "Configure Context Layers",
                "steps": ["Navigate to Context view", "Edit company context",
                          "Edit project context", "Set guardrails", "Save all",
                          "Verify agent uses new context in responses"],
                "critical": True,
            },
        ]

        # Ask LLM to evaluate each journey
        prompt = f"""You are a UX expert evaluating a research platform called ReClaw.

ReClaw is a local-first AI agent for UX Research with these views:
- Chat: conversational interface with skill execution
- Findings: Atomic Research organized by Double Diamond phase
- Tasks: Kanban board for directing the agent
- Interviews: transcript viewer with nugget extraction
- Metrics: quantitative research dashboard
- Context: editable company/project/guardrails layers
- History: version tracking with rollback
- Settings: hardware info, model management
- Search: Cmd+K global search across findings

User journeys to evaluate:
{json.dumps(journeys, indent=2)}

For each journey, evaluate:
1. Discoverability: Can a new user find how to start this? (1-5)
2. Clarity: Are the steps clear and self-explanatory? (1-5)
3. Efficiency: Is this achievable in a reasonable number of steps? (1-5)
4. Error handling: What happens if something goes wrong? (1-5)
5. Satisfaction: How satisfying is the end result? (1-5)

Also provide:
- Top 3 UX improvements needed
- Onboarding gaps (what would confuse a new user?)
- Missing features that users would expect

Respond in JSON:
{{"journey_scores": [{{"name": "...", "discoverability": 1-5, "clarity": 1-5,
"efficiency": 1-5, "error_handling": 1-5, "satisfaction": 1-5,
"issues": ["..."], "suggestions": ["..."]}}],
"top_improvements": ["..."],
"onboarding_gaps": ["..."],
"missing_features": ["..."],
"overall_score": 0-100,
"summary": "..."}}"""

        try:
            resp = await ollama.chat(messages=[{"role": "user", "content": prompt}], temperature=0.3)
            text = resp.get("message", {}).get("content", "")
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(text[start:end])
            else:
                data = {"summary": text, "overall_score": 0}
        except Exception as e:
            data = {"error": str(e), "overall_score": 0}

        return {"timestamp": timestamp, **data}

    def get_latest_report(self) -> dict | None:
        return self._reports[-1] if self._reports else None

    def get_reports(self, limit: int = 10) -> list[dict]:
        return self._reports[-limit:]


# Singleton
ux_eval_agent = UXEvalAgent()
