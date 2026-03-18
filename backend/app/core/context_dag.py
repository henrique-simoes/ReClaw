"""DAG-based lossless context summarization engine.

Preserves ALL original messages in SQLite. Groups older messages
into hierarchical summary nodes (a DAG). Agents can drill into
any summary via active recall tools.

Architecture:
- Leaf nodes (depth=0): Summarize a batch of ~32 contiguous messages
- Internal nodes (depth=1+): Summarize ~4 child nodes from the level below
- Fresh tail: The 32 most recent messages are kept verbatim
- DAG depth grows logarithmically with conversation length
"""
from __future__ import annotations

import json
import logging
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import select, func

from app.config import settings
from app.models.database import async_session
from app.models.message import Message
from app.models.context_dag import ContextDAGNode

logger = logging.getLogger(__name__)


class ContextDAG:
    """Manages hierarchical context summarization for chat sessions."""

    @property
    def fresh_tail_size(self) -> int:
        return settings.dag_fresh_tail_size

    @property
    def batch_size(self) -> int:
        return settings.dag_batch_size

    @property
    def rollup_threshold(self) -> int:
        return settings.dag_rollup_threshold

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def compact_if_needed(self, session_id: str) -> None:
        """Check if compaction is needed and create new DAG nodes if so.

        Compaction targets messages that are:
        (a) not in the fresh tail (last ``fresh_tail_size`` messages), AND
        (b) not already covered by an existing depth-0 DAG node.
        """
        async with async_session() as db:
            # Fetch all messages for this session ordered by time
            result = await db.execute(
                select(Message)
                .where(Message.session_id == session_id)
                .order_by(Message.created_at.asc())
            )
            all_messages = result.scalars().all()

            if not all_messages:
                return

            total = len(all_messages)

            # Determine the fresh tail boundary
            tail_start = max(0, total - self.fresh_tail_size)
            fresh_tail_ids = {m.id for m in all_messages[tail_start:]}

            # Get all depth-0 DAG nodes and collect their covered message IDs
            node_result = await db.execute(
                select(ContextDAGNode)
                .where(
                    ContextDAGNode.session_id == session_id,
                    ContextDAGNode.depth == 0,
                )
            )
            existing_nodes = node_result.scalars().all()
            covered_ids: set[str] = set()
            for node in existing_nodes:
                try:
                    ids = json.loads(node.message_ids)
                    covered_ids.update(ids)
                except (json.JSONDecodeError, TypeError):
                    pass

            # Find uncovered messages outside the fresh tail
            uncovered: list[Message] = []
            for msg in all_messages:
                if msg.id not in fresh_tail_ids and msg.id not in covered_ids:
                    uncovered.append(msg)

            if len(uncovered) < self.batch_size:
                return

            # Process in batches of batch_size
            batches_created = 0
            for i in range(0, len(uncovered), self.batch_size):
                batch = uncovered[i : i + self.batch_size]
                if len(batch) < self.batch_size:
                    # Don't create a partial batch unless it's the only one remaining
                    break

                batch_dicts = [
                    {
                        "id": m.id,
                        "role": m.role,
                        "content": m.content,
                        "created_at": m.created_at.isoformat() if m.created_at else "",
                    }
                    for m in batch
                ]

                summary_text = await self._summarize_batch(batch_dicts)

                original_tokens = sum(len(m.content or "") // 4 for m in batch)
                summary_tokens = len(summary_text) // 4

                node = ContextDAGNode(
                    id=str(uuid.uuid4()),
                    session_id=session_id,
                    parent_id=None,
                    depth=0,
                    summary_text=summary_text,
                    message_ids=json.dumps([m.id for m in batch]),
                    child_node_ids="[]",
                    token_count=summary_tokens,
                    original_token_count=original_tokens,
                    message_count=len(batch),
                    time_range_start=batch[0].created_at,
                    time_range_end=batch[-1].created_at,
                )
                db.add(node)
                batches_created += 1

            if batches_created > 0:
                await db.commit()
                logger.info(
                    "DAG compaction: created %d depth-0 node(s) for session %s",
                    batches_created,
                    session_id,
                )

            # Roll up depth-0 nodes into higher levels if needed
            await self._roll_up(session_id, 0)

    async def build_context_window(
        self, session_id: str, fresh_tail_size: int = 32
    ) -> tuple[list[dict], list[dict]]:
        """Build the context window from DAG summaries + fresh tail.

        Returns:
            (dag_summary_messages, fresh_tail_messages)
            dag_summary_messages: list of system-role dicts with DAG summaries
            fresh_tail_messages: list of role/content dicts for recent messages
        """
        async with async_session() as db:
            # Get all messages for the session
            result = await db.execute(
                select(Message)
                .where(Message.session_id == session_id)
                .order_by(Message.created_at.asc())
            )
            all_messages = result.scalars().all()

            if not all_messages:
                return [], []

            # Fresh tail
            tail_start = max(0, len(all_messages) - fresh_tail_size)
            fresh_tail = all_messages[tail_start:]

            fresh_tail_messages = [
                {"role": m.role, "content": m.content}
                for m in fresh_tail
                if m.role in ("user", "assistant", "system")
            ]

            # Get top-level DAG nodes (parent_id IS NULL) ordered by time
            node_result = await db.execute(
                select(ContextDAGNode)
                .where(
                    ContextDAGNode.session_id == session_id,
                    ContextDAGNode.parent_id.is_(None),
                )
                .order_by(ContextDAGNode.time_range_start.asc())
            )
            top_nodes = node_result.scalars().all()

            dag_summary_messages = []
            for node in top_nodes:
                dag_summary_messages.append({
                    "role": "system",
                    "content": (
                        f"[Context Summary — DAG:{node.id}] "
                        f"{node.summary_text}"
                    ),
                })

            return dag_summary_messages, fresh_tail_messages

    async def expand_node(self, node_id: str) -> list[dict]:
        """Expand a DAG node to reveal its contents.

        For depth-0 nodes: returns the original messages.
        For depth>0 nodes: returns the child node summaries.
        """
        async with async_session() as db:
            result = await db.execute(
                select(ContextDAGNode).where(ContextDAGNode.id == node_id)
            )
            node = result.scalar_one_or_none()
            if not node:
                return [{"error": f"Node {node_id} not found"}]

            if node.depth == 0:
                # Return original messages
                try:
                    msg_ids = json.loads(node.message_ids)
                except (json.JSONDecodeError, TypeError):
                    return [{"error": "Could not parse message IDs for this node"}]

                if not msg_ids:
                    return [{"info": "No messages associated with this node"}]

                msg_result = await db.execute(
                    select(Message)
                    .where(Message.id.in_(msg_ids))
                    .order_by(Message.created_at.asc())
                )
                messages = msg_result.scalars().all()
                return [
                    {
                        "id": m.id,
                        "role": m.role,
                        "content": m.content,
                        "created_at": m.created_at.isoformat() if m.created_at else "",
                    }
                    for m in messages
                ]
            else:
                # Return child node summaries
                try:
                    child_ids = json.loads(node.child_node_ids)
                except (json.JSONDecodeError, TypeError):
                    return [{"error": "Could not parse child node IDs"}]

                if not child_ids:
                    return [{"info": "No child nodes for this node"}]

                child_result = await db.execute(
                    select(ContextDAGNode)
                    .where(ContextDAGNode.id.in_(child_ids))
                    .order_by(ContextDAGNode.time_range_start.asc())
                )
                children = child_result.scalars().all()
                return [
                    {
                        "node_id": c.id,
                        "depth": c.depth,
                        "summary": c.summary_text,
                        "message_count": c.message_count,
                        "time_range_start": c.time_range_start.isoformat() if c.time_range_start else None,
                        "time_range_end": c.time_range_end.isoformat() if c.time_range_end else None,
                    }
                    for c in children
                ]

    async def grep_history(self, session_id: str, query: str) -> list[dict]:
        """Search ALL messages in the session for a query string (case-insensitive).

        For each match, identifies which DAG node (if any) covers it.
        Returns up to 20 results.
        """
        if not query or not query.strip():
            return []

        async with async_session() as db:
            # Case-insensitive LIKE search
            search_pattern = f"%{query}%"
            result = await db.execute(
                select(Message)
                .where(
                    Message.session_id == session_id,
                    Message.content.ilike(search_pattern),
                )
                .order_by(Message.created_at.desc())
                .limit(20)
            )
            matches = result.scalars().all()

            if not matches:
                return []

            # Build a lookup: message_id -> dag_node_id for depth-0 nodes
            node_result = await db.execute(
                select(ContextDAGNode)
                .where(
                    ContextDAGNode.session_id == session_id,
                    ContextDAGNode.depth == 0,
                )
            )
            nodes = node_result.scalars().all()

            msg_to_node: dict[str, str] = {}
            for node in nodes:
                try:
                    msg_ids = json.loads(node.message_ids)
                    for mid in msg_ids:
                        msg_to_node[mid] = node.id
                except (json.JSONDecodeError, TypeError):
                    pass

            results = []
            for m in matches:
                # Create a content excerpt around the match
                content = m.content or ""
                lower_content = content.lower()
                lower_query = query.lower()
                idx = lower_content.find(lower_query)
                if idx >= 0:
                    start = max(0, idx - 80)
                    end = min(len(content), idx + len(query) + 80)
                    excerpt = content[start:end]
                    if start > 0:
                        excerpt = "..." + excerpt
                    if end < len(content):
                        excerpt = excerpt + "..."
                else:
                    excerpt = content[:200]

                results.append({
                    "message_id": m.id,
                    "role": m.role,
                    "content_excerpt": excerpt,
                    "created_at": m.created_at.isoformat() if m.created_at else "",
                    "dag_node_id": msg_to_node.get(m.id),
                })

            return results

    async def describe_node(self, node_id: str) -> dict:
        """Return full metadata for a single DAG node."""
        async with async_session() as db:
            result = await db.execute(
                select(ContextDAGNode).where(ContextDAGNode.id == node_id)
            )
            node = result.scalar_one_or_none()
            if not node:
                return {"error": f"Node {node_id} not found"}

            try:
                message_ids = json.loads(node.message_ids)
            except (json.JSONDecodeError, TypeError):
                message_ids = []

            try:
                child_node_ids = json.loads(node.child_node_ids)
            except (json.JSONDecodeError, TypeError):
                child_node_ids = []

            return {
                "id": node.id,
                "session_id": node.session_id,
                "parent_id": node.parent_id,
                "depth": node.depth,
                "summary_text": node.summary_text,
                "message_ids": message_ids,
                "child_node_ids": child_node_ids,
                "token_count": node.token_count,
                "original_token_count": node.original_token_count,
                "message_count": node.message_count,
                "compression_ratio": (
                    round(node.original_token_count / max(node.token_count, 1), 2)
                ),
                "time_range_start": node.time_range_start.isoformat() if node.time_range_start else None,
                "time_range_end": node.time_range_end.isoformat() if node.time_range_end else None,
                "created_at": node.created_at.isoformat() if node.created_at else None,
            }

    async def get_dag_structure(self, session_id: str) -> dict:
        """Return the full DAG tree structure with stats for a session."""
        async with async_session() as db:
            result = await db.execute(
                select(ContextDAGNode)
                .where(ContextDAGNode.session_id == session_id)
                .order_by(ContextDAGNode.depth.asc(), ContextDAGNode.time_range_start.asc())
            )
            all_nodes = result.scalars().all()

            if not all_nodes:
                return {
                    "session_id": session_id,
                    "nodes": [],
                    "stats": {
                        "total_nodes": 0,
                        "max_depth": 0,
                        "nodes_by_depth": {},
                        "total_messages_covered": 0,
                        "compression_ratio": 0,
                    },
                }

            nodes_by_depth: dict[int, list[dict]] = defaultdict(list)
            top_level: list[dict] = []
            total_messages = 0
            total_orig_tokens = 0
            total_sum_tokens = 0
            max_depth = 0

            for node in all_nodes:
                depth = node.depth
                if depth > max_depth:
                    max_depth = depth

                node_info = {
                    "id": node.id,
                    "parent_id": node.parent_id,
                    "depth": depth,
                    "message_count": node.message_count,
                    "token_count": node.token_count,
                    "original_token_count": node.original_token_count,
                    "time_range_start": node.time_range_start.isoformat() if node.time_range_start else None,
                    "time_range_end": node.time_range_end.isoformat() if node.time_range_end else None,
                    "summary_preview": (node.summary_text or "")[:150],
                }
                nodes_by_depth[depth].append(node_info)

                if node.parent_id is None:
                    top_level.append(node_info)

                # Only count depth-0 to avoid double-counting
                if depth == 0:
                    total_messages += node.message_count
                    total_orig_tokens += node.original_token_count
                    total_sum_tokens += node.token_count

            # Flatten all node info into a single list for the frontend
            all_node_infos = []
            for depth_nodes in nodes_by_depth.values():
                all_node_infos.extend(depth_nodes)

            return {
                "session_id": session_id,
                "nodes": top_level,
                "stats": {
                    "total_nodes": len(all_nodes),
                    "max_depth": max_depth,
                    "nodes_by_depth": {
                        str(d): len(nodes) for d, nodes in nodes_by_depth.items()
                    },
                    "total_messages_covered": total_messages,
                    "total_original_tokens": total_orig_tokens,
                    "total_summary_tokens": total_sum_tokens,
                    "compression_ratio": (
                        round(total_orig_tokens / max(total_sum_tokens, 1), 2)
                        if total_orig_tokens > 0
                        else 0
                    ),
                },
            }

    async def get_health(self, session_id: str) -> dict:
        """Return health / statistics for the session's context DAG."""
        async with async_session() as db:
            # Total messages
            msg_count_result = await db.execute(
                select(func.count(Message.id)).where(
                    Message.session_id == session_id
                )
            )
            total_messages = msg_count_result.scalar() or 0

            # All DAG nodes
            node_result = await db.execute(
                select(ContextDAGNode).where(
                    ContextDAGNode.session_id == session_id
                )
            )
            all_nodes = node_result.scalars().all()

            if not all_nodes:
                return {
                    "session_id": session_id,
                    "total_messages": total_messages,
                    "compacted_messages": 0,
                    "dag_depth": 0,
                    "fresh_tail_size": min(total_messages, self.fresh_tail_size),
                    "compression_ratio": 1.0,
                    "nodes_by_depth": {},
                    "total_nodes": 0,
                    "dag_enabled": settings.dag_enabled,
                }

            # Count compacted messages (from depth-0 nodes only)
            compacted_ids: set[str] = set()
            nodes_by_depth: dict[int, int] = defaultdict(int)
            max_depth = 0
            total_orig = 0
            total_sum = 0

            for node in all_nodes:
                nodes_by_depth[node.depth] += 1
                if node.depth > max_depth:
                    max_depth = node.depth
                if node.depth == 0:
                    try:
                        ids = json.loads(node.message_ids)
                        compacted_ids.update(ids)
                    except (json.JSONDecodeError, TypeError):
                        pass
                    total_orig += node.original_token_count
                    total_sum += node.token_count

            return {
                "session_id": session_id,
                "total_messages": total_messages,
                "compacted_messages": len(compacted_ids),
                "dag_depth": max_depth,
                "fresh_tail_size": min(
                    total_messages, self.fresh_tail_size
                ),
                "compression_ratio": (
                    round(total_orig / max(total_sum, 1), 2) if total_orig > 0 else 1.0
                ),
                "nodes_by_depth": {str(d): c for d, c in sorted(nodes_by_depth.items())},
                "total_nodes": len(all_nodes),
                "dag_enabled": settings.dag_enabled,
            }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _summarize_batch(self, messages: list[dict]) -> str:
        """Summarize a batch of message dicts using the LLM.

        Falls back to a mechanical summary on failure.
        """
        from app.core.ollama import ollama

        # Build a transcript
        lines: list[str] = []
        for m in messages:
            role = m.get("role", "unknown")
            content = (m.get("content") or "")[:800]
            ts = m.get("created_at", "")
            lines.append(f"[{ts}] {role}: {content}")
        transcript = "\n".join(lines)

        prompt = (
            "Summarize this conversation segment. Preserve ALL:\n"
            "- Proper nouns (people, companies, tools)\n"
            "- Numbers, dates, statistics\n"
            "- Decisions made and action items\n"
            "- Research findings and data points\n"
            "- Emotional context and user sentiments\n"
            "- File references and sources\n\n"
            "Be concise but complete. Do not omit details that might be needed later.\n\n"
            f"{transcript}"
        )

        try:
            result = await ollama.chat(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=settings.dag_summary_max_tokens,
            )
            summary = result.get("message", {}).get("content", "")
            if summary and summary.strip():
                return summary.strip()
        except Exception as e:
            logger.warning("DAG summarization LLM call failed: %s", e)

        # Fallback: mechanical summary
        roles = defaultdict(int)
        topics: list[str] = []
        for m in messages:
            roles[m.get("role", "unknown")] += 1
            content = (m.get("content") or "").strip()
            if content:
                # Take the first sentence-ish fragment as a topic hint
                fragment = content[:80].split(".")[0]
                if fragment and fragment not in topics:
                    topics.append(fragment)

        role_str = ", ".join(f"{r}: {c}" for r, c in sorted(roles.items()))
        topic_str = "; ".join(topics[:5])
        return (
            f"[Fallback summary of {len(messages)} messages ({role_str}). "
            f"Topics: {topic_str}]"
        )

    async def _roll_up(self, session_id: str, depth: int) -> None:
        """Roll up orphan nodes at ``depth`` into a parent node at ``depth+1``.

        Orphan nodes are those with ``parent_id IS NULL``.
        If the number of orphans >= ``rollup_threshold``, they are grouped.
        """
        async with async_session() as db:
            result = await db.execute(
                select(ContextDAGNode)
                .where(
                    ContextDAGNode.session_id == session_id,
                    ContextDAGNode.depth == depth,
                    ContextDAGNode.parent_id.is_(None),
                )
                .order_by(ContextDAGNode.time_range_start.asc())
            )
            orphans = result.scalars().all()

            if len(orphans) < self.rollup_threshold:
                return

            # Group orphans into chunks of rollup_threshold
            rolled_up = False
            for i in range(0, len(orphans) - self.rollup_threshold + 1, self.rollup_threshold):
                group = orphans[i : i + self.rollup_threshold]
                if len(group) < self.rollup_threshold:
                    break

                # Summarize the group's summaries
                group_dicts = [
                    {
                        "id": n.id,
                        "role": "system",
                        "content": n.summary_text,
                        "created_at": n.time_range_start.isoformat() if n.time_range_start else "",
                    }
                    for n in group
                ]
                parent_summary = await self._summarize_batch(group_dicts)

                # Collect all message IDs from children
                all_message_ids: list[str] = []
                total_orig_tokens = 0
                total_message_count = 0
                for n in group:
                    try:
                        ids = json.loads(n.message_ids)
                        all_message_ids.extend(ids)
                    except (json.JSONDecodeError, TypeError):
                        pass
                    total_orig_tokens += n.original_token_count
                    total_message_count += n.message_count

                # Time range spans all children
                time_start = group[0].time_range_start
                time_end = group[-1].time_range_end

                parent_node = ContextDAGNode(
                    id=str(uuid.uuid4()),
                    session_id=session_id,
                    parent_id=None,
                    depth=depth + 1,
                    summary_text=parent_summary,
                    message_ids=json.dumps(all_message_ids),
                    child_node_ids=json.dumps([n.id for n in group]),
                    token_count=len(parent_summary) // 4,
                    original_token_count=total_orig_tokens,
                    message_count=total_message_count,
                    time_range_start=time_start,
                    time_range_end=time_end,
                )
                db.add(parent_node)

                # Update children to point to parent
                for n in group:
                    n.parent_id = parent_node.id
                    db.add(n)

                rolled_up = True

            if rolled_up:
                await db.commit()
                logger.info(
                    "DAG roll-up: created depth-%d node(s) for session %s",
                    depth + 1,
                    session_id,
                )
                # Recursively check the next level
                await self._roll_up(session_id, depth + 1)


# Singleton
context_dag = ContextDAG()
