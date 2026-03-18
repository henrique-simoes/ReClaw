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

from sqlalchemy import case, func, select
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
from app.models.agent import Agent, AgentState
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
        self._wake_event = asyncio.Event()
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

            # Wait for interval OR immediate wake signal
            try:
                await asyncio.wait_for(self._wake_event.wait(), timeout=interval)
                self._wake_event.clear()
            except asyncio.TimeoutError:
                pass

    def wake(self) -> None:
        """Wake the agent immediately to check for new tasks (e.g. after task assignment)."""
        if hasattr(self, "_wake_event"):
            self._wake_event.set()

    def stop(self) -> None:
        self._running = False
        logger.info("Agent Orchestrator stopped.")

    async def _persist_agent_state(
        self, state: AgentState, current_task: str = ""
    ) -> None:
        """Persist the agent state to the database so the frontend can read it."""
        try:
            async with async_session() as db:
                result = await db.execute(
                    select(Agent).where(Agent.id == "reclaw-main")
                )
                agent_row = result.scalar_one_or_none()
                if agent_row:
                    agent_row.state = state
                    agent_row.current_task = current_task
                    if state == AgentState.WORKING:
                        agent_row.last_heartbeat_at = datetime.now(timezone.utc)
                    await db.commit()
        except Exception as e:
            logger.error(f"Failed to persist agent state: {e}")

    async def _work_cycle(self) -> bool:
        """Run one work cycle. Returns True if a task was executed."""
        # Check resource budget before doing work
        can_start, reason = governor.can_start_agent("task-executor")
        if not can_start:
            logger.info(f"Agent paused: {reason}")
            await broadcast_agent_status("paused", f"Hardware throttle: {reason}")
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

            # 4. Check queue depth and adapt loop interval
            count_result = await db.execute(
                select(func.count(Task.id)).where(
                    Task.status.in_([TaskStatus.BACKLOG, TaskStatus.IN_PROGRESS])
                )
            )
            pending = count_result.scalar() or 0
            if pending > 0:
                self._loop_interval = 5  # Process queue quickly
                await broadcast_agent_status(
                    "working", f"Task complete. {pending} remaining in queue."
                )
            else:
                self._loop_interval = 30  # Back to normal
                await broadcast_agent_status("idle", "All tasks processed.")

            return True

    async def _pick_next_task(self, db: AsyncSession) -> Task | None:
        """Pick the highest priority task that's ready for work.

        Priority order:
        1. Tasks explicitly assigned to this agent — by priority then position
        2. Unassigned tasks — by priority then position

        Priority mapping: critical > high > medium > low
        """
        priority_order = case(
            (Task.priority == "critical", 0),
            (Task.priority == "high", 1),
            (Task.priority == "medium", 2),
            (Task.priority == "low", 3),
            else_=4,
        )

        # First: check for tasks explicitly assigned to the main agent
        result = await db.execute(
            select(Task)
            .where(
                Task.status.in_([TaskStatus.BACKLOG, TaskStatus.IN_PROGRESS]),
                Task.agent_id == "reclaw-main",
            )
            .order_by(priority_order, Task.position.asc(), Task.created_at.asc())
            .limit(1)
        )
        task = result.scalar_one_or_none()
        if task:
            return task

        # Then: pick unassigned tasks
        result = await db.execute(
            select(Task)
            .where(
                Task.status.in_([TaskStatus.BACKLOG, TaskStatus.IN_PROGRESS]),
                Task.agent_id.is_(None),
            )
            .order_by(priority_order, Task.position.asc(), Task.created_at.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_project(self, db: AsyncSession, project_id: str) -> Project | None:
        result = await db.execute(select(Project).where(Project.id == project_id))
        return result.scalar_one_or_none()

    async def _execute_task(self, db: AsyncSession, task: Task, project: Project) -> None:
        """Execute a task using the appropriate skill."""
        logger.info(f"Executing task: {task.title} (skill: {task.skill_name or 'auto'})")

        # Move to in_progress and persist agent state
        task.status = TaskStatus.IN_PROGRESS
        task.progress = 0.1
        await db.commit()
        await self._persist_agent_state(AgentState.WORKING, task.title)
        await broadcast_agent_status("working", f"Working on: {task.title}")
        await broadcast_task_progress(task.id, 0.1, "Starting task...")

        # Determine which skill to use
        skill = self._select_skill(task)
        if not skill:
            # No specific skill — use general chat to work on the task
            await self._execute_general_task(db, task, project)
            return

        # Check per-agent skill ACL
        if not await self._check_agent_skill_acl(task.agent_id, skill.name):
            logger.warning(f"Agent {task.agent_id} not allowed to use skill {skill.name}")
            task.agent_notes = f"Skill '{skill.name}' not allowed for this agent."
            task.status = TaskStatus.BACKLOG
            await db.commit()
            await broadcast_agent_status("warning", f"Skill blocked: {skill.name} not in agent ACL")
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

            # Self-verify output quality
            verified, verify_reason = self._self_verify_output(output)

            if verified:
                # Update task — passed verification
                task.status = TaskStatus.IN_REVIEW
                task.progress = 1.0
                task.agent_notes = output.summary
                await db.commit()

                await broadcast_task_progress(task.id, 1.0, "Complete — ready for review.")
                await self._persist_agent_state(AgentState.IDLE)
                await broadcast_agent_status("idle", f"Completed: {task.title}")
            else:
                # Verification failed — keep in progress for retry/attention
                task.status = TaskStatus.IN_PROGRESS
                task.progress = 0.5
                task.agent_notes = f"[Verification failed] {verify_reason}\n\n{output.summary}"
                await db.commit()

                await broadcast_task_progress(task.id, 0.5, f"Verification failed: {verify_reason}")
                await self._persist_agent_state(AgentState.IDLE)
                await broadcast_agent_status("warning", f"Needs attention: {task.title} — {verify_reason}")

            # Record skill usage and check health for self-evolution
            skill_manager.record_execution(skill.name, output.success, 0.8 if output.success else 0.2)
            try:
                health = skill_manager.get_skill_health(skill.name)
                if health.get("executions", 0) >= 3 and health.get("avg_quality", 1.0) < 0.5:
                    skill_def = skill_manager.get(skill.name)
                    skill_manager.propose_improvement(
                        skill_name=skill.name,
                        field="execute_prompt",
                        current_value=(skill_def or {}).get("execute_prompt", "")[:200] if isinstance(skill_def, dict) else "",
                        proposed_value="",
                        reason=f"Low quality ({health['avg_quality']:.0%}) after {health['executions']} runs",
                        confidence=0.6,
                    )
                    await broadcast_suggestion(
                        f"Skill '{skill.display_name}' may need tuning (quality: {health['avg_quality']:.0%}). Check pending proposals.",
                        project.id,
                    )
            except Exception:
                pass  # Don't fail task on self-evolution check

            # Generate suggestions
            if output.suggestions:
                for suggestion in output.suggestions[:3]:
                    await broadcast_suggestion(suggestion, project.id)

            logger.info(f"Task {'completed' if verified else 'needs review'}: {task.title} — {output.summary}")

        except Exception as e:
            logger.error(f"Skill execution failed for task {task.id}: {e}")
            task.agent_notes = f"Error: {str(e)}"
            task.status = TaskStatus.BACKLOG  # Return to backlog on failure
            await db.commit()
            await self._persist_agent_state(AgentState.ERROR, str(e))
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

    async def _check_agent_skill_acl(self, agent_id: str | None, skill_name: str) -> bool:
        """Check if an agent is allowed to use a skill. Returns True if allowed."""
        if not agent_id or agent_id == "reclaw-main":
            return True  # Main agent can use all skills

        try:
            async with async_session() as db:
                result = await db.execute(
                    select(Agent).where(Agent.id == agent_id)
                )
                agent = result.scalar_one_or_none()
                if not agent:
                    return True  # Unknown agent — allow

                caps = json.loads(agent.capabilities) if agent.capabilities else []
                # If agent has "skill_execution" capability but no explicit allowed_skills
                # in memory, allow all skills
                memory = json.loads(agent.memory) if agent.memory else {}
                allowed = memory.get("allowed_skills")
                if allowed is None:
                    return True  # No ACL = allow all
                return skill_name in allowed
        except Exception:
            return True  # On error, allow

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
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Task: {task.title}\n\nDetails: {task.description}\n\nAdditional context: {task.user_context}"},
            ],
        )

        result = response.get("message", {}).get("content", "")

        # Verify the LLM response quality
        error_patterns = ["error:", "failed", "unable to", "could not"]
        result_lower = (result or "").lower()
        has_error_pattern = any(p in result_lower for p in error_patterns)

        if not result or len(result.strip()) < 20 or has_error_pattern:
            # Response is empty, too short, or contains error patterns
            reason = (
                "LLM response is empty"
                if not result
                else "LLM response too short (< 20 chars)"
                if len(result.strip()) < 20
                else "LLM response contains error patterns"
            )
            task.status = TaskStatus.IN_PROGRESS
            task.progress = 0.5
            task.agent_notes = f"[Verification failed] {reason}\n\n{result}"
            await db.commit()

            await broadcast_task_progress(task.id, 0.5, f"Verification failed: {reason}")
            await self._persist_agent_state(AgentState.IDLE)
            await broadcast_agent_status("warning", f"Needs attention: {task.title} — {reason}")
        else:
            task.status = TaskStatus.IN_REVIEW
            task.progress = 1.0
            task.agent_notes = result
            await db.commit()

            await broadcast_task_progress(task.id, 1.0, "Complete — ready for review.")
            await self._persist_agent_state(AgentState.IDLE)
            await broadcast_agent_status("idle", f"Completed: {task.title}")

    async def _store_findings(
        self, db: AsyncSession, project_id: str, output: SkillOutput, task: Task
    ) -> None:
        """Store skill output findings in the database with evidence chain links.

        The Atomic Research hierarchy is: Nuggets → Facts → Insights → Recommendations.
        Each level links to the one below via ID arrays (nugget_ids, fact_ids, insight_ids).
        If skills provide explicit IDs, we use them. Otherwise, we auto-link:
        all nuggets feed into all facts, all facts feed into all insights, etc.
        This ensures every finding has traceable evidence.
        """
        # Determine base phase from skill (Double Diamond)
        skill = registry.get(task.skill_name) if task.skill_name else None
        skill_phase = skill.phase.value if skill else None

        # Each finding type has a natural phase in the Atomic Research hierarchy.
        # If the skill specifies a phase, use it; otherwise use the type's default.
        nugget_phase = skill_phase or "discover"
        fact_phase = skill_phase or "define"
        insight_phase = skill_phase or "define"
        rec_phase = skill_phase or "deliver"

        # Track created IDs for auto-linking
        created_nugget_ids: list[str] = []
        created_fact_ids: list[str] = []
        created_insight_ids: list[str] = []

        # Store nuggets
        for nugget_data in output.nuggets:
            nid = str(uuid.uuid4())
            nugget = Nugget(
                id=nid,
                project_id=project_id,
                text=nugget_data.get("text", ""),
                source=nugget_data.get("source", task.title),
                source_location=nugget_data.get("source_location", ""),
                tags=json.dumps(nugget_data.get("tags", [])),
                phase=nugget_phase,
            )
            db.add(nugget)
            created_nugget_ids.append(nid)

        # Store facts — link to nuggets
        for fact_data in output.facts:
            fid = str(uuid.uuid4())
            # Use explicit nugget_ids from skill output if provided, else link to all nuggets
            linked_nuggets = fact_data.get("nugget_ids", created_nugget_ids)
            fact = Fact(
                id=fid,
                project_id=project_id,
                text=fact_data.get("text", ""),
                nugget_ids=json.dumps(linked_nuggets),
                phase=fact_phase,
            )
            db.add(fact)
            created_fact_ids.append(fid)

        # Store insights — link to facts
        for insight_data in output.insights:
            iid = str(uuid.uuid4())
            # Use explicit fact_ids from skill output if provided, else link to all facts
            linked_facts = insight_data.get("fact_ids", created_fact_ids)
            insight = Insight(
                id=iid,
                project_id=project_id,
                text=insight_data.get("text", ""),
                fact_ids=json.dumps(linked_facts),
                phase=insight_phase,
                impact=insight_data.get("impact", "medium"),
            )
            db.add(insight)
            created_insight_ids.append(iid)

        # Store recommendations — link to insights
        for rec_data in output.recommendations:
            # Use explicit insight_ids from skill output if provided, else link to all insights
            linked_insights = rec_data.get("insight_ids", created_insight_ids)
            rec = Recommendation(
                id=str(uuid.uuid4()),
                project_id=project_id,
                text=rec_data.get("text", ""),
                insight_ids=json.dumps(linked_insights),
                phase=rec_phase,
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

    # --- Self-Verification ---

    def _self_verify_output(self, output: SkillOutput) -> tuple[bool, str]:
        """Verify the quality of a skill output before marking tasks as done.

        Returns:
            A tuple of (verified: bool, reason: str).
        """
        # Check explicit failure
        if not output.success:
            return False, f"Skill reported failure: {output.summary}"

        # Check for errors
        if output.errors:
            return False, f"Skill produced errors: {'; '.join(output.errors)}"

        # Check for error patterns in the summary
        error_patterns = ["No files provided", "Error:", "failed", "could not", "unable to"]
        summary_lower = (output.summary or "").lower()
        for pattern in error_patterns:
            if pattern.lower() in summary_lower:
                return False, f"Output summary contains error pattern '{pattern}': {output.summary}"

        # Check if output has any actual findings
        total_findings = (
            len(output.nuggets)
            + len(output.facts)
            + len(output.insights)
            + len(output.recommendations)
        )
        if total_findings == 0:
            return False, "No findings produced (0 nuggets, facts, insights, or recommendations)"

        return True, "Output verified successfully"

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

                # Self-verify the output quality
                verified, verify_reason = self._self_verify_output(output)

                if verified:
                    task_status = TaskStatus.DONE
                    task_notes = output.summary
                else:
                    task_status = TaskStatus.IN_REVIEW
                    task_notes = f"[Verification failed] {verify_reason}\n\n{output.summary}"

                # Create a temporary task to store findings
                task = Task(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    title=f"Manual: {skill.display_name}",
                    skill_name=skill_name,
                    status=task_status,
                    progress=1.0,
                    agent_notes=task_notes,
                )
                db.add(task)

                # Store findings
                await self._store_findings(db, project_id, output, task)

                skill_manager.record_execution(skill_name, output.success, 0.8 if output.success else 0.2)

                if verified:
                    await broadcast_agent_status("idle", f"Completed: {skill.display_name}")
                else:
                    await broadcast_agent_status("warning", f"Needs review: {skill.display_name} — {verify_reason}")

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
