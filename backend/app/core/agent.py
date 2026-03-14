"""Agent Orchestrator — the autonomous work loop that makes ReClaw an agent.

This is the brain of ReClaw. It:
1. Picks tasks from the Kanban board (highest priority first)
2. Selects the appropriate skill for each task
3. Executes the skill with project context
4. Stores outputs (nuggets, facts, insights, recommendations) in the database
5. Updates task progress via WebSocket
6. Self-checks findings against sources
7. Generates suggestions for the user
8. Loops continuously, respecting resource limits
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.ollama import ollama
from app.core.rag import retrieve_context, ingest_chunks
from app.core.self_check import verify_claim, Confidence
from app.core.file_processor import process_file
from app.core.embeddings import TextChunk
from app.core.context_hierarchy import context_hierarchy
from app.core.resource_governor import governor
from app.models.database import async_session
from app.models.project import Project
from app.models.task import Task, TaskStatus
from app.models.finding import Nugget, Fact, Insight, Recommendation
from app.api.websocket import (
    broadcast_agent_status,
    broadcast_task_progress,
    broadcast_suggestion,
)
from app.skills.registry import registry
from app.skills.base import SkillInput, SkillOutput
from app.skills.skill_manager import skill_manager

logger = logging.getLogger(__name__)


class AgentOrchestrator:
    """Autonomous agent that picks tasks and runs skills."""

    def __init__(self) -> None:
        self._running = False
        self._current_task_id: str | None = None
        self._loop_interval = 30  # seconds between task checks
        self._idle_interval = 60  # seconds when no tasks available

    async def start(self) -> None:
        """Start the autonomous work loop."""
        self._running = True
        logger.info("Agent Orchestrator started.")
        await broadcast_agent_status("idle", "Agent ready, watching for tasks.")

        while self._running:
            try:
                executed = await self._work_cycle()
                interval = self._loop_interval if executed else self._idle_interval
            except Exception as e:
                logger.error(f"Agent work cycle error: {e}")
                await broadcast_agent_status("error", str(e))
                interval = self._idle_interval

            await asyncio.sleep(interval)

    def stop(self) -> None:
        self._running = False
        logger.info("Agent Orchestrator stopped.")

    async def _work_cycle(self) -> bool:
        """Run one work cycle. Returns True if a task was executed."""
        # Check resource budget before doing work
        can_start, reason = governor.can_start_agent("task-executor")
        if not can_start:
            logger.info(f"Agent paused: {reason}")
            await broadcast_agent_status("paused", reason)
            return False

        # Apply throttle if system is under pressure
        await governor.throttle_if_needed()

        async with async_session() as db:
            # 1. Find the next task to work on
            task = await self._pick_next_task(db)
            if not task:
                return False

            # 2. Get the project context
            project = await self._get_project(db, task.project_id)
            if not project:
                logger.error(f"Project not found for task {task.id}")
                return False

            # 3. Execute the task
            self._current_task_id = task.id
            await self._execute_task(db, task, project)
            self._current_task_id = None

            return True

    async def _pick_next_task(self, db: AsyncSession) -> Task | None:
        """Pick the highest priority task that's ready for work."""
        # Look for tasks in backlog or in_progress (agent can resume)
        result = await db.execute(
            select(Task)
            .where(Task.status.in_([TaskStatus.BACKLOG, TaskStatus.IN_PROGRESS]))
            .order_by(Task.position.asc(), Task.created_at.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_project(self, db: AsyncSession, project_id: str) -> Project | None:
        result = await db.execute(select(Project).where(Project.id == project_id))
        return result.scalar_one_or_none()

    async def _execute_task(self, db: AsyncSession, task: Task, project: Project) -> None:
        """Execute a task using the appropriate skill."""
        logger.info(f"Executing task: {task.title} (skill: {task.skill_name or 'auto'})")

        # Move to in_progress
        task.status = TaskStatus.IN_PROGRESS
        task.progress = 0.1
        await db.commit()
        await broadcast_agent_status("working", f"Working on: {task.title}")
        await broadcast_task_progress(task.id, 0.1, "Starting task...")

        # Determine which skill to use
        skill = self._select_skill(task)
        if not skill:
            # No specific skill — use general chat to work on the task
            await self._execute_general_task(db, task, project)
            return

        # Build skill input
        skill_input = SkillInput(
            project_id=project.id,
            task_id=task.id,
            parameters={"mode": "analyze"},
            user_context=task.user_context or task.description,
            project_context=project.project_context,
            company_context=project.company_context,
        )

        # Get files from the project's upload directory
        upload_dir = Path(settings.upload_dir) / project.id
        if upload_dir.exists():
            skill_input.files = [
                str(f) for f in upload_dir.iterdir()
                if f.is_file() and f.suffix.lower() in {".txt", ".md", ".pdf", ".docx", ".csv"}
            ]

        await broadcast_task_progress(task.id, 0.3, f"Running {skill.display_name}...")

        try:
            # Execute the skill
            output = await skill.execute(skill_input)

            # Store findings in the database
            await self._store_findings(db, project.id, output, task)
            await broadcast_task_progress(task.id, 0.7, "Storing findings...")

            # Self-check key insights
            if output.insights:
                await broadcast_task_progress(task.id, 0.8, "Verifying findings...")
                await self._verify_findings(db, project.id, output)

            # Update task
            task.status = TaskStatus.IN_REVIEW
            task.progress = 1.0
            task.agent_notes = output.summary
            await db.commit()

            await broadcast_task_progress(task.id, 1.0, "Complete — ready for review.")
            await broadcast_agent_status("idle", f"Completed: {task.title}")

            # Record skill usage
            skill_manager.record_execution(skill.name, output.success, 0.8 if output.success else 0.2)

            # Generate suggestions
            if output.suggestions:
                for suggestion in output.suggestions[:3]:
                    await broadcast_suggestion(suggestion, project.id)

            logger.info(f"Task completed: {task.title} — {output.summary}")

        except Exception as e:
            logger.error(f"Skill execution failed for task {task.id}: {e}")
            task.agent_notes = f"Error: {str(e)}"
            task.status = TaskStatus.BACKLOG  # Return to backlog on failure
            await db.commit()
            await broadcast_agent_status("error", f"Failed: {task.title} — {e}")

    def _select_skill(self, task: Task):
        """Select the best skill for a task."""
        # If task has an explicit skill_name, use it
        if task.skill_name:
            skill = registry.get(task.skill_name)
            if skill:
                return skill

        # Try to infer skill from task title/description
        title_lower = (task.title + " " + task.description).lower()

        skill_keywords = {
            "interview": "user-interviews",
            "transcript": "user-interviews",
            "survey": "survey-design",
            "questionnaire": "survey-generator",
            "competitive": "competitive-analysis",
            "competitor": "competitive-analysis",
            "persona": "persona-creation",
            "journey": "journey-mapping",
            "affinity": "affinity-mapping",
            "thematic": "thematic-analysis",
            "usability": "usability-testing",
            "heuristic": "heuristic-evaluation",
            "card sort": "card-sorting",
            "tree test": "tree-testing",
            "a/b test": "ab-test-analysis",
            "sus ": "sus-umux-scoring",
            "umux": "sus-umux-scoring",
            "nps": "nps-analysis",
            "stakeholder": "stakeholder-interviews",
            "diary": "diary-studies",
            "ethnograph": "field-studies",
            "field study": "field-studies",
            "accessibility": "accessibility-audit",
            "wcag": "accessibility-audit",
            "analytics": "analytics-review",
            "hmw": "hmw-statements",
            "how might we": "hmw-statements",
            "jobs to be done": "jtbd-analysis",
            "jtbd": "jtbd-analysis",
            "empathy map": "empathy-mapping",
            "user flow": "user-flow-mapping",
            "synthesis": "research-synthesis",
            "report": "research-synthesis",
            "prioriti": "prioritization-matrix",
            "concept test": "concept-testing",
            "cognitive walk": "cognitive-walkthrough",
            "design critique": "design-critique",
            "expert review": "design-critique",
            "prototype": "prototype-feedback",
            "workshop": "workshop-facilitation",
            "design system": "design-system-audit",
            "handoff": "handoff-documentation",
            "presentation": "stakeholder-presentation",
            "retro": "research-retro",
            "longitudinal": "longitudinal-tracking",
            "taxonomy": "taxonomy-generator",
            "kappa": "kappa-thematic-analysis",
            "intercoder": "kappa-thematic-analysis",
            "ai detect": "survey-ai-detection",
            "bot detect": "survey-ai-detection",
        }

        for keyword, skill_name in skill_keywords.items():
            if keyword in title_lower:
                skill = registry.get(skill_name)
                if skill:
                    return skill

        return None

    async def _execute_general_task(self, db: AsyncSession, task: Task, project: Project) -> None:
        """Handle tasks without a specific skill — use general LLM reasoning."""
        context = await retrieve_context(project.id, task.title + " " + task.description)

        # Use the full context hierarchy as system prompt
        system_prompt = await context_hierarchy.compose_context(
            db,
            project_id=project.id,
            task_context=task.user_context or task.description,
        )

        if context.has_context:
            system_prompt += f"\n\n## Relevant Documents\n{context.context_text}"

        response = await ollama.chat(
            messages=[{"role": "user", "content": f"Task: {task.title}\n\nDetails: {task.description}\n\nAdditional context: {task.user_context}"}],
            system=system_prompt,
        )

        result = response.get("message", {}).get("content", "")

        task.status = TaskStatus.IN_REVIEW
        task.progress = 1.0
        task.agent_notes = result
        await db.commit()

        await broadcast_task_progress(task.id, 1.0, "Complete — ready for review.")
        await broadcast_agent_status("idle", f"Completed: {task.title}")

    async def _store_findings(
        self, db: AsyncSession, project_id: str, output: SkillOutput, task: Task
    ) -> None:
        """Store skill output findings in the database."""
        phase = "discover"  # Default — could be inferred from skill

        # Determine phase from skill
        skill = registry.get(task.skill_name) if task.skill_name else None
        if skill:
            phase = skill.phase.value

        # Store nuggets
        for nugget_data in output.nuggets:
            nugget = Nugget(
                id=str(uuid.uuid4()),
                project_id=project_id,
                text=nugget_data.get("text", ""),
                source=nugget_data.get("source", task.title),
                source_location=nugget_data.get("source_location", ""),
                tags=json.dumps(nugget_data.get("tags", [])),
                phase=phase,
            )
            db.add(nugget)

        # Store facts
        for fact_data in output.facts:
            fact = Fact(
                id=str(uuid.uuid4()),
                project_id=project_id,
                text=fact_data.get("text", ""),
                phase=phase,
            )
            db.add(fact)

        # Store insights
        for insight_data in output.insights:
            insight = Insight(
                id=str(uuid.uuid4()),
                project_id=project_id,
                text=insight_data.get("text", ""),
                phase=phase,
                impact=insight_data.get("impact", "medium"),
            )
            db.add(insight)

        # Store recommendations
        for rec_data in output.recommendations:
            rec = Recommendation(
                id=str(uuid.uuid4()),
                project_id=project_id,
                text=rec_data.get("text", ""),
                phase=phase,
                priority=rec_data.get("priority", "medium"),
                effort=rec_data.get("effort", "medium"),
            )
            db.add(rec)

        await db.commit()

        # Also ingest any text artifacts into the vector store for RAG
        for filename, content in output.artifacts.items():
            if isinstance(content, str) and len(content) > 50:
                chunks = [TextChunk(text=content[:2000], source=f"skill:{task.skill_name}:{filename}")]
                await ingest_chunks(project_id, chunks)

        logger.info(
            f"Stored findings: {len(output.nuggets)} nuggets, {len(output.facts)} facts, "
            f"{len(output.insights)} insights, {len(output.recommendations)} recs"
        )

    async def _verify_findings(self, db: AsyncSession, project_id: str, output: SkillOutput) -> None:
        """Self-check key insights against the knowledge base."""
        for insight_data in output.insights[:5]:  # Check top 5
            text = insight_data.get("text", "")
            if text:
                try:
                    result = await verify_claim(text, project_id)
                    if result.confidence == Confidence.LOW or result.confidence == Confidence.UNVERIFIED:
                        logger.warning(f"Low-confidence insight: '{text[:60]}...' — {result.notes}")
                except Exception as e:
                    logger.error(f"Verification failed for insight: {e}")

    # --- Manual Skill Execution (from API/Chat) ---

    async def execute_skill(
        self,
        skill_name: str,
        project_id: str,
        files: list[str] | None = None,
        parameters: dict | None = None,
        user_context: str = "",
    ) -> SkillOutput:
        """Execute a skill manually (from API or chat).

        Returns:
            SkillOutput with findings.
        """
        skill = registry.get(skill_name)
        if not skill:
            return SkillOutput(success=False, summary=f"Skill not found: {skill_name}",
                              errors=[f"Unknown skill: {skill_name}"])

        async with async_session() as db:
            project = await self._get_project(db, project_id)
            if not project:
                return SkillOutput(success=False, summary="Project not found",
                                  errors=[f"Project not found: {project_id}"])

            skill_input = SkillInput(
                project_id=project_id,
                files=files or [],
                parameters=parameters or {},
                user_context=user_context,
                project_context=project.project_context,
                company_context=project.company_context,
            )

            await broadcast_agent_status("working", f"Running {skill.display_name}...")

            try:
                output = await skill.execute(skill_input)

                # Create a temporary task to store findings
                task = Task(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    title=f"Manual: {skill.display_name}",
                    skill_name=skill_name,
                    status=TaskStatus.DONE,
                    progress=1.0,
                    agent_notes=output.summary,
                )
                db.add(task)

                # Store findings
                await self._store_findings(db, project_id, output, task)

                skill_manager.record_execution(skill_name, output.success, 0.8 if output.success else 0.2)
                await broadcast_agent_status("idle", f"Completed: {skill.display_name}")

                return output

            except Exception as e:
                logger.error(f"Manual skill execution failed: {e}")
                await broadcast_agent_status("error", str(e))
                return SkillOutput(success=False, summary=f"Execution failed: {e}", errors=[str(e)])

    async def plan_skill(self, skill_name: str, project_id: str, user_context: str = "") -> dict:
        """Generate a research plan using a skill."""
        skill = registry.get(skill_name)
        if not skill:
            return {"error": f"Skill not found: {skill_name}"}

        async with async_session() as db:
            project = await self._get_project(db, project_id)
            if not project:
                return {"error": f"Project not found: {project_id}"}

            skill_input = SkillInput(
                project_id=project_id,
                user_context=user_context,
                project_context=project.project_context,
                company_context=project.company_context,
            )

            return await skill.plan(skill_input)


# Singleton
agent = AgentOrchestrator()
