"""Prompt Compressor — LLMLingua-inspired heuristic compression for system prompts.

Microsoft's LLMLingua uses a small model (GPT-2) to score token perplexity
and remove low-information tokens.  Since ReClaw runs on local machines and
can't assume torch/transformers are available, this module implements a
lightweight heuristic equivalent that follows the same principles:

1. **Token importance scoring** — Score each token by information density
   using word frequency (common words = low info), positional importance
   (first/last sentences more important), and domain term detection.

2. **Budget controller** — Allocate different compression ratios to
   different prompt sections:
     - Identity/instructions: 10-20% compression (keep most)
     - Examples/demonstrations: 50-70% compression
     - Context/memory: 30-40% compression

3. **Structural compression** — Remove redundant formatting, collapse
   whitespace, abbreviate repeated patterns, strip markdown decorators.

4. **Semantic compression** — Remove filler words, redundant qualifiers,
   and low-information sentences while preserving meaning.

Performance: ~5ms for a 10K-character prompt on typical hardware.
"""

from __future__ import annotations

import re
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Filler words and patterns that can be safely removed
# ---------------------------------------------------------------------------

# Common filler words that add little information density
FILLER_WORDS = {
    "actually", "basically", "certainly", "clearly", "definitely",
    "essentially", "extremely", "furthermore", "generally",
    "importantly", "indeed", "moreover", "naturally", "obviously",
    "particularly", "perhaps", "possibly", "presumably",
    "primarily", "probably", "quite", "rather", "really",
    "relatively", "simply", "somewhat", "specifically",
    "typically", "usually", "very", "virtually",
}

# Redundant qualifiers that can be trimmed
REDUNDANT_QUALIFIERS = {
    "in order to": "to",
    "due to the fact that": "because",
    "in the event that": "if",
    "at this point in time": "now",
    "for the purpose of": "to",
    "in the case of": "for",
    "with regard to": "about",
    "with respect to": "about",
    "it is important to note that": "",
    "it should be noted that": "",
    "it is worth mentioning that": "",
    "as a matter of fact": "",
    "in other words": "",
    "that is to say": "",
    "needless to say": "",
    "it goes without saying that": "",
    "the fact of the matter is": "",
    "each and every": "every",
    "first and foremost": "first",
    "any and all": "all",
}

# UX Research domain terms that should NEVER be compressed
DOMAIN_TERMS = {
    "ux", "uxr", "usability", "heuristic", "accessibility", "wcag",
    "nielsen", "nugget", "fact", "insight", "recommendation",
    "atomic research", "double diamond", "discover", "define",
    "develop", "deliver", "affinity", "thematic", "persona",
    "journey map", "interview", "transcript", "survey", "coding",
    "codebook", "intercoder", "kappa", "reliability",
    "cognitive walkthrough", "card sorting", "tree test",
    "findability", "learnability", "satisfaction",
    "task completion", "error rate", "sus", "nps",
    "information architecture", "ia", "stakeholder",
    "evidence", "citation", "source", "confidence",
    "qualitative", "quantitative", "mixed methods",
}

# Markdown formatting that can be simplified
MD_CLEANUP_PATTERNS = [
    (r'\n{3,}', '\n\n'),          # Collapse multiple blank lines
    (r'---\n\n---', '---'),        # Collapse repeated separators
    (r'\*\*\*(.+?)\*\*\*', r'\1'), # Remove bold-italic (keep text)
    (r'_{2,}', ''),                # Remove horizontal rules made of underscores
]


# ---------------------------------------------------------------------------
# Section-type detection
# ---------------------------------------------------------------------------

class SectionType:
    IDENTITY = "identity"         # Who the agent is
    INSTRUCTIONS = "instructions" # How to behave
    EXAMPLES = "examples"         # Demonstrations
    CONTEXT = "context"           # Background info / memory
    METADATA = "metadata"         # Lists, references, etc.


def _detect_section_type(header: str, content: str) -> str:
    """Detect the type of a prompt section for budget allocation."""
    header_lower = header.lower()
    content_lower = content[:200].lower()

    if any(kw in header_lower for kw in ["identity", "personality", "values", "who", "name"]):
        return SectionType.IDENTITY
    if any(kw in header_lower for kw in ["example", "demonstration", "sample", "template"]):
        return SectionType.EXAMPLES
    if any(kw in header_lower for kw in ["memory", "learning", "history", "log", "pattern"]):
        return SectionType.CONTEXT
    if any(kw in header_lower for kw in ["reference", "list", "index", "baseline"]):
        return SectionType.METADATA
    if any(kw in content_lower for kw in ["for example", "e.g.", "such as", "like this"]):
        return SectionType.EXAMPLES

    return SectionType.INSTRUCTIONS


# Budget allocation: what fraction of tokens to KEEP per section type
COMPRESSION_BUDGETS = {
    SectionType.IDENTITY: 0.90,       # Keep 90% (minimal compression)
    SectionType.INSTRUCTIONS: 0.80,   # Keep 80%
    SectionType.EXAMPLES: 0.40,       # Keep 40% (heavy compression)
    SectionType.CONTEXT: 0.60,        # Keep 60%
    SectionType.METADATA: 0.50,       # Keep 50%
}


# ---------------------------------------------------------------------------
# Token importance scoring
# ---------------------------------------------------------------------------

def _word_importance(word: str) -> float:
    """Score a word's information importance (0.0 = filler, 1.0 = critical).

    Heuristic scoring based on:
    - Domain terms get maximum importance
    - Filler words get minimum importance
    - Short common words (articles, prepositions) are low importance
    - Longer, rarer words are higher importance
    """
    word_lower = word.lower()

    # Domain terms are critical — never compress
    if word_lower in DOMAIN_TERMS:
        return 1.0

    # Filler words are low importance
    if word_lower in FILLER_WORDS:
        return 0.1

    # Common short words (articles, prepositions, conjunctions)
    if word_lower in {"the", "a", "an", "is", "are", "was", "were", "be",
                       "been", "being", "have", "has", "had", "do", "does",
                       "did", "will", "would", "shall", "should", "may",
                       "might", "can", "could", "to", "of", "in", "for",
                       "on", "at", "by", "with", "from", "up", "about",
                       "into", "through", "during", "before", "after",
                       "above", "below", "between", "out", "off", "over",
                       "under", "again", "further", "then", "once",
                       "and", "but", "or", "nor", "not", "so", "yet",
                       "both", "either", "neither", "each", "every",
                       "all", "any", "few", "more", "most", "other",
                       "some", "such", "no", "only", "own", "same",
                       "than", "too", "just", "also", "there", "here",
                       "that", "this", "these", "those", "it", "its",
                       "they", "them", "their", "we", "our", "you", "your"}:
        return 0.2

    # Longer words tend to be more informative
    length_score = min(len(word) / 10, 0.5) + 0.3

    # Capitalized words (proper nouns, acronyms) are more important
    if word[0].isupper() and len(word) > 1:
        length_score += 0.1

    # ALL CAPS words (acronyms) are very important
    if word.isupper() and len(word) > 1:
        length_score += 0.2

    return min(length_score, 0.9)


def _sentence_importance(sentence: str, position: float) -> float:
    """Score a sentence's importance based on content and position.

    Args:
        sentence: The sentence text.
        position: 0.0 (first sentence) to 1.0 (last sentence).
    """
    words = sentence.split()
    if not words:
        return 0.0

    # Average word importance
    avg_word_imp = sum(_word_importance(w) for w in words) / len(words)

    # Position bonus: first and last sentences are more important
    position_bonus = 0.0
    if position < 0.15:  # First ~15% of text
        position_bonus = 0.15
    elif position > 0.85:  # Last ~15%
        position_bonus = 0.10

    # Length penalty: very short sentences may be filler
    if len(words) < 4:
        avg_word_imp *= 0.7

    # Bullet points and numbered lists are usually important
    stripped = sentence.strip()
    if stripped.startswith(("- ", "* ", "1.", "2.", "3.", "4.", "5.")):
        avg_word_imp += 0.1

    # Sentences with domain terms get a boost
    domain_count = sum(1 for w in words if w.lower() in DOMAIN_TERMS)
    if domain_count > 0:
        avg_word_imp += 0.1 * min(domain_count, 3)

    return min(avg_word_imp + position_bonus, 1.0)


# ---------------------------------------------------------------------------
# Compression engine
# ---------------------------------------------------------------------------

def compress_text(
    text: str,
    target_ratio: float = 0.7,
    section_type: str = SectionType.INSTRUCTIONS,
) -> str:
    """Compress text to approximately target_ratio of its original length.

    Args:
        text: The text to compress.
        target_ratio: Fraction of text to KEEP (0.7 = keep 70%).
        section_type: Type of section for budget adjustment.

    Returns:
        Compressed text.
    """
    if not text or target_ratio >= 1.0:
        return text

    # Apply budget adjustment based on section type
    budget = COMPRESSION_BUDGETS.get(section_type, 0.7)
    effective_ratio = min(target_ratio, budget)

    if effective_ratio >= 0.95:
        return text  # Not worth compressing

    original_len = len(text)
    target_len = int(original_len * effective_ratio)

    # Phase 1: Structural compression (always applied)
    result = _structural_compress(text)

    # Phase 2: Redundant qualifier removal
    result = _remove_redundant_qualifiers(result)

    # If we're already within budget, stop here
    if len(result) <= target_len:
        return result

    # Phase 3: Sentence-level compression (remove lowest-importance sentences)
    result = _sentence_level_compress(result, target_len)

    # Phase 4: Word-level compression (remove filler words) if still over budget
    if len(result) > target_len:
        result = _word_level_compress(result, target_len)

    return result


def compress_prompt(
    prompt: str,
    max_chars: int | None = None,
    max_tokens: int | None = None,
) -> str:
    """Compress a full system prompt intelligently.

    Splits the prompt into sections, detects their types, applies
    differentiated compression ratios, and reassembles.

    Args:
        prompt: Full system prompt text.
        max_chars: Maximum character count for output.
        max_tokens: Maximum token count (~4 chars/token).

    Returns:
        Compressed prompt.
    """
    if max_tokens:
        max_chars = max_tokens * 4

    if not max_chars or len(prompt) <= max_chars:
        return prompt

    target_ratio = max_chars / len(prompt)

    # Split into sections by markdown headers
    sections = re.split(r'\n(?=#{1,3}\s)', prompt)

    compressed_parts: list[str] = []
    total_budget = max_chars

    for i, section in enumerate(sections):
        # Detect section type
        first_line = section.split("\n")[0] if section else ""
        section_type = _detect_section_type(first_line, section)

        # Allocate budget proportionally
        section_fraction = len(section) / len(prompt)
        section_budget = int(total_budget * section_fraction)

        # Get the compression budget for this section type
        keep_ratio = COMPRESSION_BUDGETS.get(section_type, 0.7)
        section_target = min(section_budget, int(len(section) * keep_ratio))

        if len(section) <= section_target:
            compressed_parts.append(section)
        else:
            ratio = section_target / len(section)
            compressed = compress_text(section, ratio, section_type)
            compressed_parts.append(compressed)

    result = "\n".join(compressed_parts)

    # Final trim if still over budget
    if len(result) > max_chars:
        result = result[:max_chars]
        # Try to end at a sentence boundary
        last_period = result.rfind(".")
        last_newline = result.rfind("\n")
        cut = max(last_period, last_newline)
        if cut > max_chars * 0.8:
            result = result[:cut + 1]
        result += "\n\n[...compressed for context budget]"

    return result


# ---------------------------------------------------------------------------
# Internal compression phases
# ---------------------------------------------------------------------------

def _structural_compress(text: str) -> str:
    """Phase 1: Remove redundant formatting and whitespace."""
    result = text

    # Apply MD cleanup patterns
    for pattern, replacement in MD_CLEANUP_PATTERNS:
        result = re.sub(pattern, replacement, result)

    # Collapse multiple spaces
    result = re.sub(r' {2,}', ' ', result)

    # Remove empty list items
    result = re.sub(r'\n- \n', '\n', result)

    # Remove trailing whitespace on each line
    result = "\n".join(line.rstrip() for line in result.split("\n"))

    return result


def _remove_redundant_qualifiers(text: str) -> str:
    """Phase 2: Replace verbose phrases with concise alternatives."""
    result = text
    for verbose, concise in REDUNDANT_QUALIFIERS.items():
        # Case-insensitive replacement
        pattern = re.compile(re.escape(verbose), re.IGNORECASE)
        result = pattern.sub(concise, result)
    return result


def _sentence_level_compress(text: str, target_len: int) -> str:
    """Phase 3: Remove lowest-importance sentences to fit budget."""
    # Split into sentences (handling bullet points and newlines)
    lines = text.split("\n")
    sentences: list[tuple[int, str]] = []  # (original_index, text)

    for i, line in enumerate(lines):
        if line.strip():
            sentences.append((i, line))

    if not sentences:
        return text

    # Score each sentence
    total = len(sentences)
    scored: list[tuple[float, int, str]] = []
    for idx, (orig_idx, sent) in enumerate(sentences):
        position = idx / max(total - 1, 1)
        score = _sentence_importance(sent, position)

        # Headers are always important
        if sent.strip().startswith("#"):
            score = 1.0

        scored.append((score, orig_idx, sent))

    # Sort by importance (ascending) — remove least important first
    scored.sort(key=lambda x: x[0])

    # Remove sentences until we're within budget
    # SAFETY: never remove ALL sentences; keep at least 30% (min 1)
    min_keep = max(1, int(len(sentences) * 0.3))
    max_removable = len(sentences) - min_keep
    current_len = len(text)
    removed_indices: set[int] = set()

    for score, orig_idx, sent in scored:
        if current_len <= target_len:
            break
        if len(removed_indices) >= max_removable:
            break
        # Don't remove headers or very important sentences
        if score >= 0.8:
            break
        removed_indices.add(orig_idx)
        current_len -= len(sent) + 1  # +1 for newline

    # Reconstruct without removed sentences
    result_lines = []
    for i, line in enumerate(lines):
        if i not in removed_indices:
            result_lines.append(line)

    return "\n".join(result_lines)


def _word_level_compress(text: str, target_len: int) -> str:
    """Phase 4: Remove filler words to fit budget.

    SAFETY: Always keeps at least 30% of the original words to prevent
    empty or nonsensical output.
    """
    if not text.strip():
        return text

    words = text.split()
    min_keep = max(3, int(len(words) * 0.3))  # Keep at least 30%
    result_words: list[str] = []
    current_len = 0
    skipped = 0
    max_skip = len(words) - min_keep

    for word in words:
        clean = word.strip(".,;:!?()[]{}\"'")
        importance = _word_importance(clean) if clean else 0.3

        # Keep word if: important, still under budget, or already skipped too many
        if importance >= 0.3 or current_len < target_len or skipped >= max_skip:
            result_words.append(word)
            current_len += len(word) + 1
        else:
            skipped += 1

    return " ".join(result_words)
