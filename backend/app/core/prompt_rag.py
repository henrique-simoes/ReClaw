"""Prompt RAG — Retrieval-Augmented system prompt composition.

Instead of loading entire persona files into the system prompt (which wastes
context window on irrelevant sections), Prompt RAG:

1. Indexes each agent's persona MD files as chunked sections (by ## headers)
2. Keeps core identity (first ~500 tokens of CORE.md) always present
3. Dynamically retrieves the most relevant skill/protocol/memory sections
   based on the current user query
4. Composes a context-budget-aware system prompt

This is especially critical for small local models (7B-13B) with limited
context windows (2K-8K tokens) where every token counts.

Flow:
    User sends "How do I handle interview transcripts?"
    → Prompt RAG embeds the query
    → Retrieves: SKILLS sections about interview analysis,
                 PROTOCOLS sections about research methodology
    → Skips: error handling protocols, UI audit skills, etc.
    → Result: A focused, relevant system prompt using ~30% less tokens
"""

from __future__ import annotations

import hashlib
import logging
import re
from pathlib import Path

from app.config import settings
from app.core.agent_identity import PERSONAS_DIR, IDENTITY_FILES

logger = logging.getLogger(__name__)

# Sections from CORE.md that are ALWAYS included (identity anchor)
ALWAYS_INCLUDE_PATTERNS = [
    r"^# ",            # Title line
    r"^## Identity",   # Core identity
    r"^## Personality", # Communication style
    r"^## Values",     # Behavioral anchors
]

# Maximum tokens for the always-included identity anchor
IDENTITY_ANCHOR_MAX_TOKENS = 600

# How many dynamic sections to retrieve per query
DEFAULT_DYNAMIC_SECTIONS = 8


# ---------------------------------------------------------------------------
# Section chunking
# ---------------------------------------------------------------------------

class PromptSection:
    """A chunk of a persona file, indexed by its section header."""

    def __init__(
        self,
        agent_id: str,
        filename: str,
        header: str,
        content: str,
        depth: int = 2,
    ):
        self.agent_id = agent_id
        self.filename = filename
        self.header = header
        self.content = content
        self.depth = depth  # 1 = #, 2 = ##, 3 = ###
        self.token_estimate = len(content) // 4

    def to_text(self) -> str:
        return f"{self.header}\n{self.content}"

    @property
    def id(self) -> str:
        raw = f"{self.agent_id}:{self.filename}:{self.header}"
        return hashlib.md5(raw.encode()).hexdigest()[:12]


def _chunk_md_by_sections(
    agent_id: str,
    filename: str,
    content: str,
    min_depth: int = 2,
) -> list[PromptSection]:
    """Split a markdown file into sections by ## headers.

    Each section includes the header and all content up to the next
    header of equal or lesser depth.
    """
    lines = content.split("\n")
    sections: list[PromptSection] = []
    current_header = ""
    current_lines: list[str] = []
    current_depth = 0

    for line in lines:
        # Detect header lines
        header_match = re.match(r"^(#{1,4})\s+(.+)", line)
        if header_match:
            depth = len(header_match.group(1))

            # Save previous section
            if current_header and current_lines:
                text = "\n".join(current_lines).strip()
                if text and len(text) > 20:  # Skip trivially small sections
                    sections.append(PromptSection(
                        agent_id=agent_id,
                        filename=filename,
                        header=current_header,
                        content=text,
                        depth=current_depth,
                    ))

            current_header = line.strip()
            current_lines = []
            current_depth = depth
        else:
            current_lines.append(line)

    # Don't forget the last section
    if current_header and current_lines:
        text = "\n".join(current_lines).strip()
        if text and len(text) > 20:
            sections.append(PromptSection(
                agent_id=agent_id,
                filename=filename,
                header=current_header,
                content=text,
                depth=current_depth,
            ))

    return sections


def index_agent_sections(agent_id: str) -> list[PromptSection]:
    """Load and chunk all persona MD files for an agent into sections."""
    all_sections: list[PromptSection] = []

    for filename in IDENTITY_FILES:
        filepath = PERSONAS_DIR / agent_id / filename
        if not filepath.exists():
            continue

        try:
            content = filepath.read_text(encoding="utf-8").strip()
            if not content:
                continue
            sections = _chunk_md_by_sections(agent_id, filename, content)
            all_sections.extend(sections)
        except Exception as e:
            logger.warning(f"Failed to index {filepath}: {e}")

    return all_sections


# ---------------------------------------------------------------------------
# Similarity scoring (lightweight, no embedding dependency)
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> set[str]:
    """Simple word tokenization for keyword overlap scoring."""
    return set(re.findall(r'\b\w{3,}\b', text.lower()))


def _keyword_similarity(query_tokens: set[str], section: PromptSection) -> float:
    """Score a section's relevance to a query using keyword overlap.

    This is a lightweight alternative to embedding-based similarity
    that works without any model inference — important because Prompt RAG
    runs on every chat request and must be fast.
    """
    section_tokens = _tokenize(section.content + " " + section.header)
    if not section_tokens or not query_tokens:
        return 0.0

    overlap = query_tokens & section_tokens
    # Jaccard-ish similarity weighted by overlap size
    score = len(overlap) / (len(query_tokens) + len(section_tokens) - len(overlap))

    # Boost for header matches (section title is more important)
    header_tokens = _tokenize(section.header)
    header_overlap = query_tokens & header_tokens
    if header_overlap:
        score += 0.3 * len(header_overlap) / max(len(query_tokens), 1)

    # Boost for CORE.md sections (identity is always relevant)
    if section.filename == "CORE.md":
        score += 0.1

    return min(score, 1.0)


async def _embedding_similarity(
    query: str,
    section: PromptSection,
    query_vector: list[float] | None = None,
) -> float:
    """Score a section's relevance using embedding similarity.

    Falls back to keyword similarity if embeddings are unavailable.
    """
    try:
        from app.core.embeddings import embed_text

        if query_vector is None:
            query_vector = await embed_text(query)

        section_text = section.header + " " + section.content[:500]
        section_vector = await embed_text(section_text)

        # Cosine similarity
        dot = sum(a * b for a, b in zip(query_vector, section_vector))
        mag_q = sum(a * a for a in query_vector) ** 0.5
        mag_s = sum(a * a for a in section_vector) ** 0.5

        if mag_q == 0 or mag_s == 0:
            return 0.0

        return dot / (mag_q * mag_s)

    except Exception:
        # Fall back to keyword similarity
        return _keyword_similarity(_tokenize(query), section)


# ---------------------------------------------------------------------------
# Identity anchor extraction
# ---------------------------------------------------------------------------

def _extract_identity_anchor(agent_id: str) -> str:
    """Extract the always-included identity core from CORE.md.

    This includes the title, Identity, Personality, and Values sections —
    the minimum needed for the model to know WHO it is.
    """
    filepath = PERSONAS_DIR / agent_id / "CORE.md"
    if not filepath.exists():
        return ""

    try:
        content = filepath.read_text(encoding="utf-8").strip()
    except Exception:
        return ""

    lines = content.split("\n")
    anchor_lines: list[str] = []
    in_anchor = False
    anchor_chars = 0
    max_chars = IDENTITY_ANCHOR_MAX_TOKENS * 4  # ~4 chars per token

    for line in lines:
        # Always include the title
        if line.startswith("# "):
            anchor_lines.append(line)
            anchor_chars += len(line)
            in_anchor = True
            continue

        # Check if this line starts an anchor section
        is_anchor_header = any(
            re.match(pat, line) for pat in ALWAYS_INCLUDE_PATTERNS
        )
        if is_anchor_header:
            in_anchor = True

        # Check if we've hit a non-anchor section
        if line.startswith("## ") and not is_anchor_header:
            in_anchor = False

        if in_anchor:
            if anchor_chars + len(line) > max_chars:
                break
            anchor_lines.append(line)
            anchor_chars += len(line)

    return "\n".join(anchor_lines).strip()


# ---------------------------------------------------------------------------
# Main composition engine
# ---------------------------------------------------------------------------

async def compose_dynamic_prompt(
    agent_id: str,
    query: str,
    max_tokens: int | None = None,
    use_embeddings: bool = True,
    top_k: int = DEFAULT_DYNAMIC_SECTIONS,
) -> str:
    """Compose an agent's system prompt dynamically based on the query.

    Args:
        agent_id: Agent whose persona to load.
        query: The user's current message/query.
        max_tokens: Token budget for the entire identity prompt.
        use_embeddings: Whether to use embedding similarity (slower but better).
        top_k: Number of dynamic sections to retrieve.

    Returns:
        Composed system prompt with identity anchor + relevant sections.
    """
    budget = max_tokens
    if budget is None:
        budget = getattr(settings, "max_context_tokens", 8192)
        budget = int(budget * 0.3)  # 30% of context for identity

    # 1. Always include the identity anchor
    anchor = _extract_identity_anchor(agent_id)
    anchor_tokens = len(anchor) // 4

    remaining_budget = budget - anchor_tokens
    if remaining_budget <= 100:
        # Budget too tight — just return the anchor
        return anchor

    # 2. Index all sections
    all_sections = index_agent_sections(agent_id)
    if not all_sections:
        return anchor

    # 3. Score sections by relevance to query
    query_tokens = _tokenize(query)
    scored_sections: list[tuple[float, PromptSection]] = []

    if use_embeddings:
        try:
            from app.core.embeddings import embed_text
            query_vector = await embed_text(query)

            for section in all_sections:
                # Skip sections that are part of the anchor (already included)
                if any(
                    re.match(pat, section.header)
                    for pat in ALWAYS_INCLUDE_PATTERNS
                ):
                    continue

                score = await _embedding_similarity(
                    query, section, query_vector
                )
                scored_sections.append((score, section))
        except Exception:
            # Fall back to keyword similarity
            use_embeddings = False

    if not use_embeddings:
        for section in all_sections:
            if any(
                re.match(pat, section.header)
                for pat in ALWAYS_INCLUDE_PATTERNS
            ):
                continue

            score = _keyword_similarity(query_tokens, section)
            scored_sections.append((score, section))

    # 4. Sort by relevance and select top-K within budget
    scored_sections.sort(key=lambda x: x[0], reverse=True)

    selected_sections: list[PromptSection] = []
    used_tokens = 0

    for score, section in scored_sections[:top_k * 2]:  # Oversample for budget fit
        if len(selected_sections) >= top_k:
            break
        if used_tokens + section.token_estimate > remaining_budget:
            continue
        selected_sections.append(section)
        used_tokens += section.token_estimate

    # 5. Compose: anchor + selected sections (sorted by file order, not relevance)
    file_order = {f: i for i, f in enumerate(IDENTITY_FILES)}
    selected_sections.sort(
        key=lambda s: (file_order.get(s.filename, 99), s.depth)
    )

    parts = [anchor]
    for section in selected_sections:
        parts.append(section.to_text())

    composed = "\n\n---\n\n".join(parts)

    logger.debug(
        f"Prompt RAG for {agent_id}: {anchor_tokens} anchor + "
        f"{used_tokens} dynamic = {anchor_tokens + used_tokens} tokens "
        f"({len(selected_sections)} sections selected from {len(all_sections)})"
    )

    return composed


# ---------------------------------------------------------------------------
# Keyword-only fast path (for when embeddings are unavailable or too slow)
# ---------------------------------------------------------------------------

def compose_keyword_prompt(
    agent_id: str,
    query: str,
    max_tokens: int | None = None,
    top_k: int = DEFAULT_DYNAMIC_SECTIONS,
) -> str:
    """Synchronous, keyword-only version of compose_dynamic_prompt.

    Use this when embeddings are not available or when speed is critical.
    """
    budget = max_tokens
    if budget is None:
        budget = getattr(settings, "max_context_tokens", 8192)
        budget = int(budget * 0.3)

    anchor = _extract_identity_anchor(agent_id)
    anchor_tokens = len(anchor) // 4
    remaining = budget - anchor_tokens

    if remaining <= 100:
        return anchor

    all_sections = index_agent_sections(agent_id)
    if not all_sections:
        return anchor

    query_tokens = _tokenize(query)
    scored = [
        (_keyword_similarity(query_tokens, s), s)
        for s in all_sections
        if not any(re.match(p, s.header) for p in ALWAYS_INCLUDE_PATTERNS)
    ]
    scored.sort(key=lambda x: x[0], reverse=True)

    selected: list[PromptSection] = []
    used = 0
    for score, section in scored[:top_k * 2]:
        if len(selected) >= top_k:
            break
        if used + section.token_estimate > remaining:
            continue
        selected.append(section)
        used += section.token_estimate

    file_order = {f: i for i, f in enumerate(IDENTITY_FILES)}
    selected.sort(key=lambda s: (file_order.get(s.filename, 99), s.depth))

    parts = [anchor]
    for section in selected:
        parts.append(section.to_text())

    return "\n\n---\n\n".join(parts)
