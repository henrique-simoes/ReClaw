"""Agent Identity System — loads and composes MD-based agent personas.

Each agent has a persona directory at `backend/app/agents/personas/{agent_id}/`
containing structured markdown files that define the agent's identity:

    CORE.md       — Identity, personality, communication style, values
    SKILLS.md     — Technical capabilities, methodologies, tools
    PROTOCOLS.md  — Behavioral protocols, decision-making, error handling
    MEMORY.md     — Persistent learnings (auto-updated by the agent)

The identity loader composes these files into a rich system prompt that
gives each agent a distinct personality and deep domain knowledge.  For
small models with limited context windows, the loader can compress the
prompt to fit within the available budget using two strategies:

    1. **Prompt RAG** — Retrieve only the most relevant persona sections
       for the current query (query-aware, best accuracy).
    2. **LLMLingua-style compression** — Heuristic token-level compression
       that removes filler words and low-information content (fast, always
       available).
    3. **Proportional truncation** — Legacy fallback: budget-weighted
       file truncation.
"""

from __future__ import annotations

import logging
from pathlib import Path
from functools import lru_cache

from app.config import settings

logger = logging.getLogger(__name__)

# Base path for persona files
PERSONAS_DIR = Path(__file__).parent.parent / "agents" / "personas"

# MD files that compose an agent identity, in priority order
IDENTITY_FILES = ["CORE.md", "SKILLS.md", "PROTOCOLS.md", "MEMORY.md"]

# Budget allocation when compressing for small models (% of total budget)
# CORE gets the most because it defines personality; MEMORY the least
FILE_BUDGET_WEIGHTS = {
    "CORE.md": 0.40,
    "SKILLS.md": 0.25,
    "PROTOCOLS.md": 0.25,
    "MEMORY.md": 0.10,
}

# Compression strategy: "prompt_rag", "llmlingua", "truncate"
# - prompt_rag: Best for query-aware contexts (chat) — retrieves relevant sections
# - llmlingua: Best for general compression — heuristic token-level
# - truncate: Legacy fallback — proportional file truncation
DEFAULT_COMPRESSION_STRATEGY = "llmlingua"


def _load_persona_file(agent_id: str, filename: str) -> str | None:
    """Load a single persona MD file for an agent."""
    filepath = PERSONAS_DIR / agent_id / filename
    if filepath.exists():
        try:
            return filepath.read_text(encoding="utf-8").strip()
        except Exception as e:
            logger.warning(f"Failed to read persona file {filepath}: {e}")
    return None


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 characters per token for English text."""
    return len(text) // 4


def _truncate_to_tokens(text: str, max_tokens: int) -> str:
    """Truncate text to approximately max_tokens tokens."""
    max_chars = max_tokens * 4
    if len(text) <= max_chars:
        return text
    # Truncate at a sentence boundary if possible
    truncated = text[:max_chars]
    last_period = truncated.rfind(".")
    last_newline = truncated.rfind("\n")
    cut_point = max(last_period, last_newline)
    if cut_point > max_chars * 0.7:
        return truncated[:cut_point + 1]
    return truncated + "\n\n[...truncated for context window budget]"


def load_agent_identity(
    agent_id: str,
    max_tokens: int | None = None,
    strategy: str | None = None,
) -> str:
    """Load and compose the full agent identity from persona MD files.

    Args:
        agent_id: The agent's ID (maps to persona directory name).
        max_tokens: Optional token budget for the identity prompt.
            If the composed identity exceeds this budget, compression
            is applied using the chosen strategy.
            If None, uses settings.max_context_tokens * 0.3 (30% of
            context window reserved for agent identity).
        strategy: Compression strategy when over budget.
            "llmlingua" — Heuristic token-level compression (default).
            "truncate"  — Legacy proportional file truncation.
            None uses DEFAULT_COMPRESSION_STRATEGY.

    Returns:
        Composed identity string ready to use as system prompt content.
        Falls back to empty string if no persona files exist.
    """
    sections: list[tuple[str, str]] = []  # (filename, content)

    for filename in IDENTITY_FILES:
        content = _load_persona_file(agent_id, filename)
        if content:
            sections.append((filename, content))

    if not sections:
        logger.debug(f"No persona files found for agent {agent_id}")
        return ""

    # Compose the full identity
    composed = "\n\n---\n\n".join(content for _, content in sections)

    # Check if we need to compress for small models
    budget = max_tokens
    if budget is None:
        budget = getattr(settings, "max_context_tokens", 8192)
        budget = int(budget * 0.3)  # 30% of context for identity

    total_tokens = _estimate_tokens(composed)

    if total_tokens <= budget:
        return composed

    # --- Compression needed ---
    compression_strategy = strategy or DEFAULT_COMPRESSION_STRATEGY

    logger.info(
        f"Compressing agent identity for {agent_id}: "
        f"{total_tokens} tokens -> {budget} budget "
        f"(strategy: {compression_strategy})"
    )

    if compression_strategy == "llmlingua":
        return _compress_llmlingua(composed, budget)
    else:
        return _compress_truncate(sections, budget)


def _compress_llmlingua(composed: str, budget_tokens: int) -> str:
    """Compress using LLMLingua-inspired heuristic compression."""
    try:
        from app.core.prompt_compressor import compress_prompt
        return compress_prompt(composed, max_tokens=budget_tokens)
    except Exception as e:
        logger.warning(f"LLMLingua compression failed, falling back to truncate: {e}")
        return _truncate_to_tokens(composed, budget_tokens)


def _compress_truncate(
    sections: list[tuple[str, str]],
    budget_tokens: int,
) -> str:
    """Legacy compression: proportional file truncation."""
    compressed_sections = []
    for filename, content in sections:
        weight = FILE_BUDGET_WEIGHTS.get(filename, 0.25)
        file_budget = int(budget_tokens * weight)
        compressed = _truncate_to_tokens(content, file_budget)
        compressed_sections.append(compressed)

    return "\n\n---\n\n".join(compressed_sections)


def load_agent_memory(agent_id: str) -> str:
    """Load only the MEMORY.md file for an agent (for updates)."""
    return _load_persona_file(agent_id, "MEMORY.md") or ""


def save_agent_memory(agent_id: str, content: str) -> bool:
    """Save updated MEMORY.md content for an agent.

    This is how agents evolve — their MEMORY.md is updated with
    new learnings, error patterns, and user preferences.
    """
    persona_dir = PERSONAS_DIR / agent_id
    if not persona_dir.exists():
        logger.warning(f"Persona directory not found for agent {agent_id}")
        return False

    filepath = persona_dir / "MEMORY.md"
    try:
        filepath.write_text(content, encoding="utf-8")
        logger.info(f"Updated MEMORY.md for agent {agent_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to save MEMORY.md for agent {agent_id}: {e}")
        return False


def append_learning(agent_id: str, category: str, learning: str) -> bool:
    """Append a new learning entry to an agent's MEMORY.md.

    Args:
        agent_id: The agent's ID.
        category: The section to append to (e.g., "Error Patterns & Resolutions").
        learning: The learning text to append.

    Returns:
        True if successfully appended.
    """
    memory = load_agent_memory(agent_id)
    if not memory:
        return False

    # Find the category section and append
    category_header = f"### {category}"
    if category_header in memory:
        # Insert after the last line in that category section
        lines = memory.split("\n")
        insert_idx = None
        in_category = False
        for i, line in enumerate(lines):
            if line.strip() == category_header:
                in_category = True
                continue
            if in_category:
                if line.startswith("### ") or line.startswith("## "):
                    insert_idx = i
                    break
                insert_idx = i + 1

        if insert_idx is not None:
            lines.insert(insert_idx, f"- {learning}")
            return save_agent_memory(agent_id, "\n".join(lines))

    # Category not found — append at the end
    memory += f"\n\n### {category}\n- {learning}\n"
    return save_agent_memory(agent_id, memory)


def list_agent_personas() -> list[str]:
    """List all agent IDs that have persona directories."""
    if not PERSONAS_DIR.exists():
        return []
    return [
        d.name for d in PERSONAS_DIR.iterdir()
        if d.is_dir() and (d / "CORE.md").exists()
    ]


def get_agent_display_name(agent_id: str) -> str | None:
    """Extract the display name from an agent's CORE.md title line.

    The CORE.md first line format is: `# DisplayName -- Role Description`
    """
    core = _load_persona_file(agent_id, "CORE.md")
    if not core:
        return None
    first_line = core.split("\n")[0]
    if first_line.startswith("# "):
        name = first_line[2:].strip()
        # Extract just the name before the " -- " separator
        if " -- " in name:
            return name.split(" -- ")[0].strip()
        if " - " in name:
            return name.split(" - ")[0].strip()
        return name
    return None
