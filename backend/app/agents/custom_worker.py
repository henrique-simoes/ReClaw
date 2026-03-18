"""Custom Agent Worker — generic work loop for user-created agents.

When a custom agent is created, a CustomAgentWorker is spawned to:
1. Pick up tasks assigned to this agent's ID
2. Execute skills using the agent's system prompt as context
3. Report status via WebSocket
4. Respect resource governor limits
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.resource_governor import governor
from app.models.database import async_session
from app.models.agent import Agent, AgentRole, AgentState
from app.models.task import Task, TaskStatus
from app.api.websocket import broadcast_agent_status

logger = logging.getLogger(__name__)


class CustomAgentWorker:
    """Work loop for a custom agent."""

    def __init__(self, agent_id: str, agent_name: str) -> None:
        self.agent_id = agent_id
        self.agent_name = agent_name
        self._running = False
        self._task: asyncio.Task | None = None
        self._loop_interval = 30
        self._idle_interval = 120

    async def start(self) -> None:
        """Start the work loop."""
        self._running = True
        logger.info(f"Custom agent worker started: {self.agent_name} ({self.agent_id})")

        while self._running:
            try:
                executed = await self._work_cycle()
                interval = self._loop_interval if executed else self._idle_interval
            except Exception as e:
                logger.error(f"Custom agent {self.agent_id} work cycle error: {e}")
                await self._update_db_state(AgentState.ERROR, str(e))
                interval = self._idle_interval

            await asyncio.sleep(interval)

    def stop(self) -> None:
        self._running = False
        logger.info(f"Custom agent worker stopped: {self.agent_name} ({self.agent_id})")

    async def _work_cycle(self) -> bool:
        """Run one work cycle. Returns True if a task was executed."""
        # Check resource budget
        can_start, reason = governor.can_start_agent(f"custom-{self.agent_id}")
        if not can_start:
            return False

        await governor.throttle_if_needed()

        async with async_session() as db:
            # Check if agent is still active and not paused
            result = await db.execute(
                select(Agent).where(Agent.id == self.agent_id)
            )
            agent = result.scalar_one_or_none()
            if not agent or not agent.is_active or agent.state == AgentState.PAUSED:
                return False

            # Pick tasks assigned to this agent
            task = await self._pick_task(db)
            if not task:
                return False

            # Execute the task
            await self._execute_task(db, task, agent)
            return True

    async def _pick_task(self, db: AsyncSession) -> Task | None:
        """Pick the next task assigned to this agent."""
        priority_order = case(
            (Task.priority == "critical", 0),
            (Task.priority == "high", 1),
            (Task.priority == "medium", 2),
            (Task.priority == "low", 3),
            else_=4,
        )

        result = await db.execute(
            select(Task)
            .where(
                Task.status.in_([TaskStatus.BACKLOG, TaskStatus.IN_PROGRESS]),
                Task.agent_id == self.agent_id,
            )
            .order_by(priority_order, Task.position.asc(), Task.created_at.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _execute_task(self, db: AsyncSession, task: Task, agent: Agent) -> None:
        """Execute a task using the main agent orchestrator's skill execution."""
        logger.info(f"Custom agent {self.agent_id} executing: {task.title}")

        task.status = TaskStatus.IN_PROGRESS
        task.progress = 0.1
        await db.commit()

        await self._update_db_state(AgentState.WORKING, task.title)
        await broadcast_agent_status("working", f"{self.agent_name}: {task.title}")

        try:
            # Delegate to the main agent orchestrator's skill execution
            from app.core.agent import agent as agent_orchestrator
            from app.models.project import Project

            project_result = await db.execute(
                select(Project).where(Project.id == task.project_id)
            )
            project = project_result.scalar_one_or_none()
            if not project:
                task.agent_notes = "Error: project not found"
                task.status = TaskStatus.BACKLOG
                await db.commit()
                return

            await agent_orchestrator._execute_task(db, task, project)

            # Update execution count
            agent_row_result = await db.execute(
                select(Agent).where(Agent.id == self.agent_id)
            )
            agent_row = agent_row_result.scalar_one_or_none()
            if agent_row:
                agent_row.executions = (agent_row.executions or 0) + 1
                agent_row.last_heartbeat_at = datetime.now(timezone.utc)
                await db.commit()

        except Exception as e:
            logger.error(f"Custom agent {self.agent_id} task error: {e}")
            task.status = TaskStatus.BACKLOG
            task.agent_notes = f"Error: {e}"
            await db.commit()
            await self._update_db_state(AgentState.ERROR, str(e))
            return

        await self._update_db_state(AgentState.IDLE)

    async def _update_db_state(self, state: AgentState, current_task: str = "") -> None:
        """Update agent state in the database."""
        try:
            async with async_session() as db:
                result = await db.execute(
                    select(Agent).where(Agent.id == self.agent_id)
                )
                agent = result.scalar_one_or_none()
                if agent:
                    agent.state = state
                    agent.current_task = current_task
                    if state == AgentState.WORKING:
                        agent.last_heartbeat_at = datetime.now(timezone.utc)
                    await db.commit()
        except Exception as e:
            logger.error(f"Failed to update custom agent state: {e}")


# Registry of active custom agent workers
_active_workers: dict[str, CustomAgentWorker] = {}
_active_tasks: dict[str, asyncio.Task] = {}


async def start_custom_agent(agent_id: str, agent_name: str) -> CustomAgentWorker:
    """Start a work loop for a custom agent."""
    if agent_id in _active_workers:
        return _active_workers[agent_id]

    worker = CustomAgentWorker(agent_id, agent_name)
    _active_workers[agent_id] = worker
    _active_tasks[agent_id] = asyncio.create_task(worker.start())
    logger.info(f"Started custom agent worker: {agent_name} ({agent_id})")
    return worker


async def stop_custom_agent(agent_id: str) -> None:
    """Stop a custom agent's work loop."""
    worker = _active_workers.pop(agent_id, None)
    task = _active_tasks.pop(agent_id, None)
    if worker:
        worker.stop()
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


async def load_custom_agents_from_db() -> None:
    """Load all active custom agents from DB and start their workers.
    Called on application startup.
    """
    try:
        async with async_session() as db:
            result = await db.execute(
                select(Agent).where(
                    Agent.is_system == False,
                    Agent.is_active == True,
                    Agent.role == AgentRole.CUSTOM,
                )
            )
            agents = result.scalars().all()
            for agent in agents:
                await start_custom_agent(agent.id, agent.name)
            if agents:
                logger.info(f"Loaded {len(agents)} custom agents from database")
    except Exception as e:
        logger.error(f"Failed to load custom agents: {e}")


def get_active_workers() -> dict[str, CustomAgentWorker]:
    """Get all active custom agent workers."""
    return dict(_active_workers)
