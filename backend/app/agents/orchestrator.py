"""Meta-Orchestrator — coordinates all ReClaw agents autonomously.

During development and runtime, this orchestrator:
1. Manages agent lifecycle (start, stop, health)
2. Prevents duplicate/conflicting work
3. Distributes tasks respecting resource limits
4. Cross-checks agent outputs for consistency
5. Detects gaps and assigns work proactively
6. Maintains an audit trail of all agent actions

Agents under management:
- DevOps Audit Agent: code quality, data integrity, system health
- UI Audit Agent: heuristics, accessibility, consistency
- UX Evaluation Agent: platform usability, onboarding, user flows
- User Simulation Agent: end-to-end testing, simulated usage
- Task Executor Agent: the main worker (picks Kanban tasks, runs skills)
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum

from app.core.resource_governor import governor
from app.api.websocket import broadcast_agent_status

logger = logging.getLogger(__name__)


class AgentRole(str, Enum):
    TASK_EXECUTOR = "task_executor"
    DEVOPS_AUDIT = "devops_audit"
    UI_AUDIT = "ui_audit"
    UX_EVALUATION = "ux_evaluation"
    USER_SIMULATION = "user_simulation"


class AgentState(str, Enum):
    IDLE = "idle"
    WORKING = "working"
    PAUSED = "paused"
    ERROR = "error"
    STOPPED = "stopped"


@dataclass
class ManagedAgent:
    """An agent managed by the orchestrator."""

    id: str
    role: AgentRole
    name: str
    system_prompt: str  # Configurable per-agent system prompt
    state: AgentState = AgentState.IDLE
    current_task: str = ""
    last_output: str = ""
    error_count: int = 0
    executions: int = 0
    started_at: datetime | None = None
    last_active: datetime | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "role": self.role.value,
            "name": self.name,
            "state": self.state.value,
            "current_task": self.current_task,
            "error_count": self.error_count,
            "executions": self.executions,
            "system_prompt_preview": self.system_prompt[:200] + "..." if len(self.system_prompt) > 200 else self.system_prompt,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "last_active": self.last_active.isoformat() if self.last_active else None,
        }


# Default system prompts for each agent role
DEFAULT_SYSTEM_PROMPTS = {
    AgentRole.TASK_EXECUTOR: """You are the ReClaw Task Executor. Your job is to:
- Pick tasks from the Kanban board and execute them using UXR skills
- Store all findings (nuggets, facts, insights, recommendations) in the database
- Self-check your work against source documents
- Update task progress and provide clear summaries
- Suggest next steps when a task is complete
Always respect the project context hierarchy. Cite sources for every claim.""",

    AgentRole.DEVOPS_AUDIT: """You are the ReClaw DevOps Auditor. Your job is to:
- Monitor data integrity across the system
- Check for orphaned references and corrupt data
- Verify finding quality (no sourceless claims)
- Ensure task state consistency
- Monitor system resources (RAM, disk, Ollama)
- Flag issues by severity (critical > high > medium > low)
Report issues clearly and suggest fixes.""",

    AgentRole.UI_AUDIT: """You are the ReClaw UI Auditor. Your job is to:
- Evaluate the UI against Nielsen's 10 heuristics
- Check WCAG 2.2 accessibility compliance
- Verify navigation paths and state management
- Ensure component consistency across views
- Check error state coverage
- Rate each component and track scores over time
Be specific about issues and provide actionable recommendations.""",

    AgentRole.UX_EVALUATION: """You are the ReClaw UX Evaluator. Your job is to:
- Evaluate the overall platform experience (not just UI components)
- Test the onboarding flow for new users
- Check if setup processes work (API keys, integrations, model config)
- Evaluate information architecture and navigation
- Assess the learning curve for UX researchers
- Test critical user journeys end-to-end
- Recommend improvements to make the platform more intuitive
Think like a real UX researcher using this tool for the first time.""",

    AgentRole.USER_SIMULATION: """You are the ReClaw User Simulator. Your job is to:
- Simulate real user behavior across all platform features
- Create projects, upload files, run skills, review findings
- Test edge cases: empty states, large files, concurrent operations
- Verify that the entire workflow works end-to-end
- Measure task completion rates and identify failure points
- Report bugs, broken flows, and missing features
Act as a moderately technical UX researcher who is new to the platform.""",
}


class MetaOrchestrator:
    """Coordinates all ReClaw agents, preventing conflicts and ensuring coverage."""

    def __init__(self) -> None:
        self._agents: dict[str, ManagedAgent] = {}
        self._running = False
        self._cycle_interval = 60  # seconds between orchestration cycles
        self._work_log: list[dict] = []  # Audit trail

    def _create_default_agents(self) -> None:
        """Create the default set of managed agents."""
        for role in AgentRole:
            agent_id = f"reclaw-{role.value}"
            if agent_id not in self._agents:
                self._agents[agent_id] = ManagedAgent(
                    id=agent_id,
                    role=role,
                    name=role.value.replace("_", " ").title(),
                    system_prompt=DEFAULT_SYSTEM_PROMPTS.get(role, ""),
                )

    async def start(self) -> None:
        """Start the meta-orchestrator."""
        self._running = True
        self._create_default_agents()
        logger.info(f"Meta-Orchestrator started with {len(self._agents)} agents.")

        while self._running:
            try:
                await self._orchestration_cycle()
            except Exception as e:
                logger.error(f"Orchestration cycle error: {e}")

            await asyncio.sleep(self._cycle_interval)

    def stop(self) -> None:
        self._running = False
        for agent in self._agents.values():
            agent.state = AgentState.STOPPED
        logger.info("Meta-Orchestrator stopped.")

    async def _orchestration_cycle(self) -> None:
        """Run one orchestration cycle."""
        budget = governor.compute_budget()

        if budget.paused:
            # Pause all agents
            for agent in self._agents.values():
                if agent.state == AgentState.WORKING:
                    agent.state = AgentState.PAUSED
                    self._log_action(agent.id, "paused", "Resource pressure — system paused")
            return

        # Resume paused agents if resources allow
        for agent in self._agents.values():
            if agent.state == AgentState.PAUSED:
                agent.state = AgentState.IDLE
                self._log_action(agent.id, "resumed", "Resources available")

        # Check for conflicts — no two agents should work on the same data
        active_tasks = {a.current_task for a in self._agents.values() if a.current_task}
        if len(active_tasks) != len([a for a in self._agents.values() if a.current_task]):
            logger.warning("Conflict detected: multiple agents on same task!")
            # Resolve by keeping only the first agent on each task
            seen: set[str] = set()
            for agent in self._agents.values():
                if agent.current_task in seen:
                    agent.current_task = ""
                    agent.state = AgentState.IDLE
                    self._log_action(agent.id, "deconflicted", "Duplicate task assignment removed")
                elif agent.current_task:
                    seen.add(agent.current_task)

        # Check agent health
        for agent in self._agents.values():
            if agent.error_count >= 3:
                agent.state = AgentState.PAUSED
                self._log_action(agent.id, "paused", f"Too many errors ({agent.error_count})")

    def _log_action(self, agent_id: str, action: str, details: str) -> None:
        """Log an orchestrator action for audit trail."""
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "agent_id": agent_id,
            "action": action,
            "details": details,
        }
        self._work_log.append(entry)
        if len(self._work_log) > 500:
            self._work_log = self._work_log[-500:]

    # --- Agent Management API ---

    def get_agent(self, agent_id: str) -> ManagedAgent | None:
        return self._agents.get(agent_id)

    def list_agents(self) -> list[ManagedAgent]:
        return list(self._agents.values())

    def update_agent_prompt(self, agent_id: str, system_prompt: str) -> bool:
        """Update an agent's system prompt."""
        agent = self._agents.get(agent_id)
        if not agent:
            return False
        agent.system_prompt = system_prompt
        self._log_action(agent_id, "prompt_updated", f"System prompt updated ({len(system_prompt)} chars)")
        return True

    def create_custom_agent(self, name: str, role: AgentRole, system_prompt: str) -> ManagedAgent:
        """Create a custom agent with a user-defined system prompt."""
        agent_id = f"custom-{uuid.uuid4().hex[:8]}"
        agent = ManagedAgent(
            id=agent_id,
            role=role,
            name=name,
            system_prompt=system_prompt,
        )
        self._agents[agent_id] = agent
        self._log_action(agent_id, "created", f"Custom agent: {name}")
        return agent

    def pause_agent(self, agent_id: str) -> bool:
        agent = self._agents.get(agent_id)
        if not agent:
            return False
        agent.state = AgentState.PAUSED
        self._log_action(agent_id, "paused", "Manual pause")
        return True

    def resume_agent(self, agent_id: str) -> bool:
        agent = self._agents.get(agent_id)
        if not agent or agent.state != AgentState.PAUSED:
            return False
        agent.state = AgentState.IDLE
        self._log_action(agent_id, "resumed", "Manual resume")
        return True

    def get_work_log(self, limit: int = 50) -> list[dict]:
        return self._work_log[-limit:]

    def get_status(self) -> dict:
        """Get full orchestrator status."""
        return {
            "running": self._running,
            "agents": [a.to_dict() for a in self._agents.values()],
            "active_count": sum(1 for a in self._agents.values() if a.state == AgentState.WORKING),
            "paused_count": sum(1 for a in self._agents.values() if a.state == AgentState.PAUSED),
            "resource_status": governor.get_status(),
            "recent_actions": self._work_log[-10:],
        }


# Singleton
meta_orchestrator = MetaOrchestrator()
