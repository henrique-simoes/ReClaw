"""Self-Evolution Engine — OpenClaw-inspired .learnings → promotion pipeline.

Agents learn from errors, workflows, and user feedback.  When a learning
pattern reaches promotion thresholds (recurrence, distinct contexts,
time window, confidence), it gets promoted from the transient DB into
permanent persona MD files — literally rewriting the agent's identity.

Promotion targets:
    error_pattern    → PROTOCOLS.md   (Error handling / resilience)
    workflow_pattern → SKILLS.md      (How to do things better)
    user_preference  → CORE.md        (Communication & values)
    performance_note → MEMORY.md      (Stays in memory layer)

Thresholds (modeled after OpenClaw's self-improving-agent):
    ≥ 3 occurrences  (times_applied)
    ≥ 2 distinct project contexts  (project_id diversity)
    Within 30-day recency window
    ≥ 70% confidence
    ≥ 60% success rate (times_successful / times_applied)

Two modes:
    - **Proposal mode** (default): Generates proposals for user review.
    - **Self-evolving mode**: Auto-applies promotions when thresholds are met.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

from sqlalchemy import select, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.agent_identity import (
    PERSONAS_DIR,
    IDENTITY_FILES,
    _load_persona_file,
    save_agent_memory,
    load_agent_memory,
)
from app.models.database import async_session

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Promotion thresholds (OpenClaw-aligned)
# ---------------------------------------------------------------------------

PROMOTION_THRESHOLDS = {
    "min_occurrences": 3,       # Pattern seen at least 3 times
    "min_contexts": 2,          # Across at least 2 distinct project contexts
    "max_age_days": 30,         # Within a 30-day window
    "min_confidence": 70,       # Minimum confidence score (0-100)
    "min_success_rate": 0.6,    # 60% success rate when applied
}

# Which MD file receives promotions for each learning category
PROMOTION_TARGETS = {
    "error_pattern": "PROTOCOLS.md",
    "workflow_pattern": "SKILLS.md",
    "user_preference": "CORE.md",
    "performance_note": "MEMORY.md",
    "evolution_proposal": "MEMORY.md",
}

# Section headers within each target file where promotions land
PROMOTION_SECTIONS = {
    "PROTOCOLS.md": "## Learned Error Patterns",
    "SKILLS.md": "## Learned Workflow Patterns",
    "CORE.md": "## Learned User Preferences",
    "MEMORY.md": "### Promoted Learnings",
}


# ---------------------------------------------------------------------------
# Self-Evolution Engine
# ---------------------------------------------------------------------------

class SelfEvolutionEngine:
    """Scans agent learnings and promotes mature patterns into persona files."""

    async def scan_for_promotions(
        self,
        agent_id: str,
        thresholds: dict | None = None,
    ) -> list[dict]:
        """Scan an agent's learnings for patterns ready for promotion.

        Returns a list of promotion candidates with their details.
        """
        th = thresholds or PROMOTION_THRESHOLDS
        cutoff = datetime.now(timezone.utc) - timedelta(days=th["max_age_days"])
        candidates = []

        try:
            from app.core.agent_learning import AgentLearning

            async with async_session() as db:
                # Get all active, non-promoted learnings for this agent
                result = await db.execute(
                    select(AgentLearning).where(
                        AgentLearning.agent_id == agent_id,
                        AgentLearning.active == True,
                        AgentLearning.updated_at >= cutoff,
                    )
                )
                learnings = result.scalars().all()

                for learning in learnings:
                    # Check if already promoted (stored in resolution field)
                    if learning.resolution and "[PROMOTED]" in learning.resolution:
                        continue

                    occurrences = learning.times_applied or 0
                    confidence = learning.confidence or 0
                    successful = learning.times_successful or 0
                    success_rate = (
                        successful / occurrences if occurrences > 0 else 0
                    )

                    # Count distinct project contexts for this pattern
                    ctx_result = await db.execute(
                        select(func.count(distinct(AgentLearning.project_id)))
                        .where(
                            AgentLearning.agent_id == agent_id,
                            AgentLearning.category == learning.category,
                            AgentLearning.trigger == learning.trigger,
                            AgentLearning.active == True,
                        )
                    )
                    distinct_contexts = ctx_result.scalar() or 1

                    # Check all thresholds
                    meets_occurrences = occurrences >= th["min_occurrences"]
                    meets_contexts = distinct_contexts >= th["min_contexts"]
                    meets_confidence = confidence >= th["min_confidence"]
                    meets_success = success_rate >= th["min_success_rate"]

                    # All thresholds must be met
                    qualifies = all([
                        meets_occurrences,
                        meets_contexts,
                        meets_confidence,
                        meets_success,
                    ])

                    if qualifies:
                        target_file = PROMOTION_TARGETS.get(
                            learning.category, "MEMORY.md"
                        )
                        candidates.append({
                            "learning_id": learning.id,
                            "agent_id": agent_id,
                            "category": learning.category,
                            "learning": learning.learning,
                            "trigger": learning.trigger,
                            "resolution": learning.resolution,
                            "confidence": confidence,
                            "occurrences": occurrences,
                            "success_rate": round(success_rate, 2),
                            "distinct_contexts": distinct_contexts,
                            "target_file": target_file,
                            "target_section": PROMOTION_SECTIONS.get(
                                target_file, "## Promoted Learnings"
                            ),
                            "created_at": learning.created_at.isoformat()
                            if learning.created_at
                            else None,
                        })

        except Exception as e:
            logger.error(f"Evolution scan failed for {agent_id}: {e}")

        return candidates

    async def promote_learning(
        self,
        agent_id: str,
        learning_id: int,
        target_file: str | None = None,
    ) -> dict:
        """Promote a specific learning into the agent's persona file.

        Returns a dict with promotion result details.
        """
        try:
            from app.core.agent_learning import AgentLearning

            async with async_session() as db:
                result = await db.execute(
                    select(AgentLearning).where(AgentLearning.id == learning_id)
                )
                learning = result.scalar_one_or_none()
                if not learning:
                    return {"success": False, "error": "Learning not found"}

                if learning.agent_id != agent_id:
                    return {"success": False, "error": "Learning belongs to another agent"}

                # Determine target file
                tf = target_file or PROMOTION_TARGETS.get(
                    learning.category, "MEMORY.md"
                )
                section = PROMOTION_SECTIONS.get(tf, "## Promoted Learnings")

                # Build the promotion text
                promotion_text = _format_promotion(learning)

                # Write to the target persona file
                success = _append_to_persona_file(agent_id, tf, section, promotion_text)

                if success:
                    # Mark the learning as promoted in DB
                    learning.resolution = (
                        f"[PROMOTED to {tf}] "
                        + (learning.resolution or "")
                    )
                    learning.confidence = min(100, (learning.confidence or 50) + 10)
                    await db.commit()

                    logger.info(
                        f"Promoted learning {learning_id} for {agent_id} → {tf}"
                    )
                    return {
                        "success": True,
                        "agent_id": agent_id,
                        "learning_id": learning_id,
                        "target_file": tf,
                        "target_section": section,
                        "promotion_text": promotion_text,
                    }
                else:
                    return {
                        "success": False,
                        "error": f"Failed to write to {tf} for {agent_id}",
                    }

        except Exception as e:
            logger.error(f"Promotion failed for learning {learning_id}: {e}")
            return {"success": False, "error": str(e)}

    async def auto_evolve(self, agent_id: str) -> list[dict]:
        """Run the full self-evolution cycle for an agent.

        Scans for promotable learnings and auto-applies them.
        Returns a list of promotions that were applied.
        """
        candidates = await self.scan_for_promotions(agent_id)
        promotions = []

        for candidate in candidates:
            result = await self.promote_learning(
                agent_id=agent_id,
                learning_id=candidate["learning_id"],
                target_file=candidate["target_file"],
            )
            if result.get("success"):
                promotions.append(result)

        if promotions:
            logger.info(
                f"Self-evolution for {agent_id}: {len(promotions)} promotions applied"
            )

        return promotions

    async def scan_all_agents(self) -> dict[str, list[dict]]:
        """Scan all agents with persona directories for promotable learnings."""
        from app.core.agent_identity import list_agent_personas

        results = {}
        for agent_id in list_agent_personas():
            candidates = await self.scan_for_promotions(agent_id)
            if candidates:
                results[agent_id] = candidates

        # Also scan custom agents (those in DB but without persona dirs)
        try:
            from app.models.agent import Agent

            async with async_session() as db:
                db_result = await db.execute(
                    select(Agent.id).where(Agent.is_active == True)
                )
                for row in db_result.fetchall():
                    aid = row[0]
                    if aid not in results:
                        candidates = await self.scan_for_promotions(aid)
                        if candidates:
                            results[aid] = candidates
        except Exception:
            pass

        return results

    async def create_persona_for_custom_agent(self, agent_id: str, name: str, system_prompt: str) -> bool:
        """Create persona MD files for a custom user-created agent.

        This gives custom agents the same evolution capabilities as system agents.
        """
        persona_dir = PERSONAS_DIR / agent_id
        if persona_dir.exists():
            return True  # Already has persona files

        try:
            persona_dir.mkdir(parents=True, exist_ok=True)

            # Generate CORE.md from the system prompt
            core_content = f"""# {name} -- Custom Research Agent

## Identity
You are {name}, a custom agent created within the ReClaw UX Research platform.
Your primary directive is defined by your creator's system prompt.

## Creator's Directive
{system_prompt[:2000]}

## Personality
- Helpful and task-focused
- Follow instructions precisely
- Report findings with evidence
- Ask for clarification when uncertain

## Values
- Evidence over assumption
- Transparency about limitations
- Respect for project context
"""
            (persona_dir / "CORE.md").write_text(core_content, encoding="utf-8")

            # Generate minimal SKILLS.md
            skills_content = f"""# {name} -- Skills

## Capabilities
- Execute assigned UX research skills
- Analyze documents and extract findings
- Communicate findings to other agents via A2A

## Limitations
- Custom agent — capabilities defined by creator
- Defer to system agents for specialized audits
"""
            (persona_dir / "SKILLS.md").write_text(skills_content, encoding="utf-8")

            # Generate PROTOCOLS.md
            protocols_content = f"""# {name} -- Behavioral Protocols

## Task Execution
1. Read task description and user context
2. Select appropriate skill or use general reasoning
3. Execute with evidence-based methodology
4. Store findings in Atomic Research hierarchy
5. Self-verify output quality

## Error Handling
- On error: log the pattern, attempt retry with modified approach
- Record error learnings for future reference
- Broadcast warning (not crash) on recoverable errors
- Escalate to system agents for critical failures

## Learned Error Patterns
(Auto-populated by the self-evolution engine)
"""
            (persona_dir / "PROTOCOLS.md").write_text(protocols_content, encoding="utf-8")

            # Generate MEMORY.md
            memory_content = f"""# {name} -- Persistent Memory

## Learnings Log
(Auto-populated as the agent encounters patterns)

### Error Patterns & Resolutions
(Empty — will be populated through operation)

### Workflow Patterns
(Empty — will be populated through operation)

### User Preferences
(Empty — will be populated through interaction)

### Promoted Learnings
(Auto-populated by the self-evolution engine when patterns mature)
"""
            (persona_dir / "MEMORY.md").write_text(memory_content, encoding="utf-8")

            logger.info(f"Created persona files for custom agent: {name} ({agent_id})")
            return True

        except Exception as e:
            logger.error(f"Failed to create persona for {agent_id}: {e}")
            return False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _format_promotion(learning) -> str:
    """Format a learning record into a concise promotion entry."""
    category_labels = {
        "error_pattern": "Error Pattern",
        "workflow_pattern": "Workflow Pattern",
        "user_preference": "User Preference",
        "performance_note": "Performance Note",
    }
    label = category_labels.get(learning.category, learning.category)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    parts = [f"**[{label}]** ({timestamp}, confidence: {learning.confidence}%)"]
    parts.append(learning.learning[:500])
    if learning.resolution and not learning.resolution.startswith("[PROMOTED"):
        parts.append(f"  Resolution: {learning.resolution[:300]}")

    return " ".join(parts)


def _append_to_persona_file(
    agent_id: str,
    filename: str,
    section_header: str,
    text: str,
) -> bool:
    """Append a promotion entry to a specific section of a persona file."""
    filepath = PERSONAS_DIR / agent_id / filename
    if not filepath.exists():
        # Create the file with the section
        try:
            filepath.parent.mkdir(parents=True, exist_ok=True)
            content = f"{section_header}\n- {text}\n"
            filepath.write_text(content, encoding="utf-8")
            return True
        except Exception as e:
            logger.error(f"Failed to create {filepath}: {e}")
            return False

    try:
        content = filepath.read_text(encoding="utf-8")

        if section_header in content:
            # Find the section and append after the last entry
            lines = content.split("\n")
            insert_idx = None
            in_section = False

            for i, line in enumerate(lines):
                if line.strip() == section_header:
                    in_section = True
                    continue
                if in_section:
                    # Stop at the next section header
                    if line.startswith("## ") or (
                        line.startswith("### ") and line.strip() != section_header
                    ):
                        insert_idx = i
                        break
                    insert_idx = i + 1

            if insert_idx is not None:
                lines.insert(insert_idx, f"- {text}")
                filepath.write_text("\n".join(lines), encoding="utf-8")
                return True
        else:
            # Section doesn't exist — append it at the end
            content += f"\n\n{section_header}\n- {text}\n"
            filepath.write_text(content, encoding="utf-8")
            return True

    except Exception as e:
        logger.error(f"Failed to append to {filepath}: {e}")
        return False

    return False


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

self_evolution = SelfEvolutionEngine()
