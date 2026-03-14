"""Resource Governor — prevents naive users from overwhelming hardware.

Controls:
1. Max concurrent agents (based on available resources)
2. Task queue depth limits per project
3. LLM request throttling when resources are low
4. Automatic agent pausing when system is under pressure
5. Memory/CPU monitoring with adaptive throttling
"""

import asyncio
import logging
import os
import time
from dataclasses import dataclass

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ResourceBudget:
    """Current resource allocation and limits."""

    max_concurrent_agents: int
    max_tasks_per_project: int
    max_queued_llm_requests: int
    throttle_delay_ms: int  # Added delay between LLM calls when under pressure
    paused: bool  # All agent work paused due to resource exhaustion


@dataclass
class SystemResources:
    """Current system resource snapshot."""

    ram_total_gb: float
    ram_available_gb: float
    ram_used_pct: float
    cpu_count: int
    cpu_load_pct: float
    disk_free_gb: float
    disk_used_pct: float


class ResourceGovernor:
    """Monitors system resources and governs agent/task limits."""

    def __init__(self) -> None:
        self._active_agents: set[str] = set()
        self._queued_requests: int = 0
        self._last_check: float = 0
        self._cached_resources: SystemResources | None = None
        self._check_interval = 10  # seconds between resource checks

    def get_resources(self) -> SystemResources:
        """Get current system resources (cached for performance)."""
        now = time.time()
        if self._cached_resources and (now - self._last_check) < self._check_interval:
            return self._cached_resources

        try:
            import psutil
            mem = psutil.virtual_memory()
            cpu_pct = psutil.cpu_percent(interval=0.1)
            disk = psutil.disk_usage("/")

            self._cached_resources = SystemResources(
                ram_total_gb=round(mem.total / (1024**3), 1),
                ram_available_gb=round(mem.available / (1024**3), 1),
                ram_used_pct=mem.percent,
                cpu_count=os.cpu_count() or 1,
                cpu_load_pct=cpu_pct,
                disk_free_gb=round(disk.free / (1024**3), 1),
                disk_used_pct=disk.percent,
            )
        except ImportError:
            # psutil not available — use conservative defaults
            self._cached_resources = SystemResources(
                ram_total_gb=8.0, ram_available_gb=4.0, ram_used_pct=50.0,
                cpu_count=os.cpu_count() or 4, cpu_load_pct=50.0,
                disk_free_gb=50.0, disk_used_pct=50.0,
            )

        self._last_check = now
        return self._cached_resources

    def compute_budget(self) -> ResourceBudget:
        """Compute current resource budget based on system state."""
        res = self.get_resources()

        # Determine pressure level
        ram_pressure = res.ram_used_pct > 85
        cpu_pressure = res.cpu_load_pct > 80
        disk_pressure = res.disk_used_pct > 90
        critical = res.ram_used_pct > 95 or res.disk_used_pct > 95

        if critical:
            return ResourceBudget(
                max_concurrent_agents=0,
                max_tasks_per_project=5,
                max_queued_llm_requests=0,
                throttle_delay_ms=5000,
                paused=True,
            )

        if ram_pressure and cpu_pressure:
            return ResourceBudget(
                max_concurrent_agents=1,
                max_tasks_per_project=10,
                max_queued_llm_requests=1,
                throttle_delay_ms=2000,
                paused=False,
            )

        if ram_pressure or cpu_pressure:
            return ResourceBudget(
                max_concurrent_agents=2,
                max_tasks_per_project=20,
                max_queued_llm_requests=2,
                throttle_delay_ms=500,
                paused=False,
            )

        # Comfortable resources — scale by available RAM
        available_gb = res.ram_available_gb - settings.resource_reserve_ram_gb
        if available_gb >= 12:
            max_agents = 4
        elif available_gb >= 8:
            max_agents = 3
        elif available_gb >= 4:
            max_agents = 2
        else:
            max_agents = 1

        return ResourceBudget(
            max_concurrent_agents=max_agents,
            max_tasks_per_project=50,
            max_queued_llm_requests=max_agents * 2,
            throttle_delay_ms=0,
            paused=False,
        )

    # --- Agent lifecycle ---

    def can_start_agent(self, agent_id: str) -> tuple[bool, str]:
        """Check if a new agent can be started within resource limits."""
        budget = self.compute_budget()

        if budget.paused:
            return False, "System resources critical — all agents paused. Close other applications to free memory."

        if len(self._active_agents) >= budget.max_concurrent_agents:
            return False, f"Max concurrent agents reached ({budget.max_concurrent_agents}). Wait for a running agent to finish."

        return True, "OK"

    def register_agent(self, agent_id: str) -> None:
        self._active_agents.add(agent_id)
        logger.info(f"Agent registered: {agent_id} (active: {len(self._active_agents)})")

    def unregister_agent(self, agent_id: str) -> None:
        self._active_agents.discard(agent_id)
        logger.info(f"Agent unregistered: {agent_id} (active: {len(self._active_agents)})")

    def active_agent_count(self) -> int:
        return len(self._active_agents)

    # --- LLM request throttling ---

    async def throttle_if_needed(self) -> None:
        """Apply throttle delay if system is under pressure."""
        budget = self.compute_budget()
        if budget.throttle_delay_ms > 0:
            logger.debug(f"Throttling LLM request by {budget.throttle_delay_ms}ms")
            await asyncio.sleep(budget.throttle_delay_ms / 1000)

    # --- Status ---

    def get_status(self) -> dict:
        """Get full resource governor status."""
        res = self.get_resources()
        budget = self.compute_budget()

        return {
            "resources": {
                "ram_total_gb": res.ram_total_gb,
                "ram_available_gb": res.ram_available_gb,
                "ram_used_pct": res.ram_used_pct,
                "cpu_cores": res.cpu_count,
                "cpu_load_pct": res.cpu_load_pct,
                "disk_free_gb": res.disk_free_gb,
                "disk_used_pct": res.disk_used_pct,
            },
            "budget": {
                "max_concurrent_agents": budget.max_concurrent_agents,
                "max_tasks_per_project": budget.max_tasks_per_project,
                "max_queued_llm_requests": budget.max_queued_llm_requests,
                "throttle_delay_ms": budget.throttle_delay_ms,
                "paused": budget.paused,
            },
            "active_agents": len(self._active_agents),
            "active_agent_ids": list(self._active_agents),
        }


# Singleton
governor = ResourceGovernor()
