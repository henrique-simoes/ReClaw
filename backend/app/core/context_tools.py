"""Active recall tools for agents to search/expand compacted conversation history.

These functions let an agent drill into DAG-summarized context when it needs
the original details behind a summary node.
"""
from __future__ import annotations

from app.core.context_dag import context_dag


async def context_expand(session_id: str, node_id: str) -> str:
    """Expand a DAG node to reveal its original messages or child summaries.

    Returns a formatted string suitable for injection into LLM context.
    """
    items = await context_dag.expand_node(node_id)

    if not items:
        return f"[Context Expand] No content found for node {node_id}."

    # Check for error / info entries
    if len(items) == 1 and ("error" in items[0] or "info" in items[0]):
        msg = items[0].get("error") or items[0].get("info", "")
        return f"[Context Expand] {msg}"

    lines: list[str] = []
    lines.append(f"[Context Expand — node {node_id}]")

    for item in items:
        if "role" in item and "content" in item:
            # Original message
            ts = item.get("created_at", "")
            role = item.get("role", "unknown")
            content = item.get("content", "")
            lines.append(f"  [{ts}] {role}: {content}")
        elif "summary" in item:
            # Child node summary
            nid = item.get("node_id", "?")
            depth = item.get("depth", "?")
            count = item.get("message_count", 0)
            summary = item.get("summary", "")
            t_start = item.get("time_range_start", "")
            t_end = item.get("time_range_end", "")
            lines.append(
                f"  [DAG:{nid} depth={depth} msgs={count} "
                f"range={t_start}..{t_end}]\n    {summary}"
            )

    return "\n".join(lines)


async def context_grep(session_id: str, query: str) -> str:
    """Search all messages in the session for a query string.

    Returns a formatted string of matching excerpts with DAG node references.
    """
    results = await context_dag.grep_history(session_id, query)

    if not results:
        return f'[Context Search] No results for "{query}".'

    lines: list[str] = []
    lines.append(f'[Context Search — {len(results)} result(s) for "{query}"]')

    for r in results:
        mid = r.get("message_id", "?")
        role = r.get("role", "?")
        excerpt = r.get("content_excerpt", "")
        ts = r.get("created_at", "")
        dag_id = r.get("dag_node_id")
        dag_ref = f" (DAG:{dag_id})" if dag_id else ""
        lines.append(f"  [{ts}] {role}{dag_ref}: {excerpt}")

    return "\n".join(lines)


async def context_describe(session_id: str, node_id: str) -> str:
    """Describe a DAG node's full metadata.

    Returns a formatted string with all node details.
    """
    info = await context_dag.describe_node(node_id)

    if "error" in info:
        return f"[Context Describe] {info['error']}"

    lines: list[str] = [
        f"[Context Describe — DAG node {info.get('id', '?')}]",
        f"  Session:           {info.get('session_id', '?')}",
        f"  Depth:             {info.get('depth', '?')}",
        f"  Parent:            {info.get('parent_id') or '(root)'}",
        f"  Messages covered:  {info.get('message_count', 0)}",
        f"  Original tokens:   {info.get('original_token_count', 0)}",
        f"  Summary tokens:    {info.get('token_count', 0)}",
        f"  Compression ratio: {info.get('compression_ratio', '?')}x",
        f"  Time range:        {info.get('time_range_start', '?')} .. {info.get('time_range_end', '?')}",
        f"  Child nodes:       {info.get('child_node_ids', [])}",
        f"  Created at:        {info.get('created_at', '?')}",
        f"  Summary:",
        f"    {info.get('summary_text', '')}",
    ]

    return "\n".join(lines)
