"""Context DAG API — inspect, search, and manage the conversation DAG."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.context_dag import context_dag

router = APIRouter()


# ---- Request models ----

class ExpandRequest(BaseModel):
    """Request body for expanding a DAG node."""
    node_id: str


class GrepRequest(BaseModel):
    """Request body for searching conversation history."""
    query: str


# ---- Endpoints ----

@router.get("/context-dag/{session_id}")
async def get_dag_structure(session_id: str) -> dict:
    """Return the full DAG tree structure and stats for a session."""
    try:
        return await context_dag.get_dag_structure(session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/context-dag/{session_id}/health")
async def get_dag_health(session_id: str) -> dict:
    """Return context health statistics for a session."""
    try:
        return await context_dag.get_health(session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/context-dag/{session_id}/expand")
async def expand_node(session_id: str, body: ExpandRequest) -> dict:
    """Expand a DAG node to see its original messages or child summaries."""
    try:
        items = await context_dag.expand_node(body.node_id)
        return {"node_id": body.node_id, "items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/context-dag/{session_id}/grep")
async def grep_history(session_id: str, body: GrepRequest) -> dict:
    """Search all messages in a session's history (case-insensitive)."""
    if not body.query or not body.query.strip():
        raise HTTPException(status_code=400, detail="Query must not be empty")
    try:
        results = await context_dag.grep_history(session_id, body.query)
        return {"query": body.query, "count": len(results), "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/context-dag/{session_id}/node/{node_id}")
async def get_node_details(session_id: str, node_id: str) -> dict:
    """Return full metadata for a single DAG node."""
    try:
        info = await context_dag.describe_node(node_id)
        if "error" in info:
            raise HTTPException(status_code=404, detail=info["error"])
        return info
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/context-dag/{session_id}/compact")
async def force_compact(session_id: str) -> dict:
    """Force DAG compaction for a session (creates summary nodes for uncovered messages)."""
    try:
        await context_dag.compact_if_needed(session_id)
        health = await context_dag.get_health(session_id)
        return {"compacted": True, "status": "ok", "health": health}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
