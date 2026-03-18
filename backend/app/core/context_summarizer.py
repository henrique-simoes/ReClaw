"""Context summarizer — compresses older messages into summaries instead of trimming."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ContextSummary:
    summary_text: str
    messages_summarized: int
    original_token_count: int
    summary_token_count: int


class ContextSummarizer:
    """Summarizes older messages when context window pressure is high."""

    def __init__(self, threshold: float = 0.75) -> None:
        self.threshold = threshold  # Trigger at 75% of context window

    async def summarize_messages(self, messages: list[dict], max_summary_tokens: int = 200) -> ContextSummary:
        """Use the LLM to summarize a batch of messages."""
        from app.core.ollama import ollama

        # Build conversation text for summarization
        conv_text = "\n".join(
            f"{m.get('role', 'unknown')}: {m.get('content', '')[:500]}"
            for m in messages
        )

        original_chars = sum(len(m.get("content", "")) for m in messages)

        summary_prompt = (
            "Summarize the following conversation concisely. "
            "Preserve key facts, decisions, research findings, and action items. "
            "Be specific about names, numbers, and research methods mentioned.\n\n"
            f"{conv_text}"
        )

        try:
            result = await ollama.chat(
                messages=[{"role": "user", "content": summary_prompt}],
                temperature=0.3,
                max_tokens=max_summary_tokens,
            )
            summary_text = result.get("message", {}).get("content", "")
            if not summary_text.strip():
                summary_text = f"[Summary of {len(messages)} messages about: {messages[0].get('content', '')[:100]}...]"
        except Exception as e:
            logger.warning(f"Summarization failed, using fallback: {e}")
            topics = set()
            for m in messages:
                content = m.get("content", "")[:100]
                if content:
                    topics.add(content.split(".")[0])
            summary_text = f"[Previous conversation summary ({len(messages)} messages): {'; '.join(list(topics)[:5])}]"

        return ContextSummary(
            summary_text=summary_text,
            messages_summarized=len(messages),
            original_token_count=original_chars // 4,
            summary_token_count=len(summary_text) // 4,
        )

    async def apply_summarization(
        self, system_prompt: str, messages: list[dict], budget: int | None = None
    ) -> tuple[list[dict], ContextSummary | None]:
        """If messages exceed budget, summarize older ones.

        Returns (modified_messages, summary_or_none).
        """
        max_tokens = budget or settings.max_context_tokens

        # Estimate total tokens
        system_tokens = len(system_prompt) // 4
        msg_tokens = sum(len(m.get("content", "")) // 4 for m in messages)
        total = system_tokens + msg_tokens

        threshold_tokens = int(max_tokens * self.threshold)

        if total <= threshold_tokens or len(messages) <= 4:
            return messages, None

        # Keep the most recent 4 messages (2 user + 2 assistant typically)
        fresh_count = min(4, len(messages))
        old_messages = messages[:-fresh_count]
        fresh_messages = messages[-fresh_count:]

        if not old_messages:
            return messages, None

        summary = await self.summarize_messages(old_messages)

        # Prepend summary as a system message
        summary_msg = {
            "role": "system",
            "content": f"[Previous conversation summary]\n{summary.summary_text}",
        }

        result_messages = [summary_msg] + fresh_messages
        logger.info(
            f"Summarized {summary.messages_summarized} messages: "
            f"{summary.original_token_count} -> {summary.summary_token_count} tokens"
        )

        return result_messages, summary


context_summarizer = ContextSummarizer()
