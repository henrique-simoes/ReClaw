"""Agent management, A2A messaging, and orchestrator API routes."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.orchestrator import meta_orchestrator
from app.agents.ux_eval_agent import ux_eval_agent
from app.agents.user_sim_agent import user_sim_agent
from app.config import settings
from app.core.resource_governor import governor
from app.core.context_hierarchy import context_hierarchy, ContextDocument
from app.models.database import get_db
from app.services import agent_service, a2a

router = APIRouter()


# ───── Agent CRUD ─────


class CreateAgentRequest(BaseModel):
    name: str
    role: str = "custom"
    system_prompt: str = ""
    capabilities: list[str] | None = None
    heartbeat_interval: int = 60


class UpdateAgentRequest(BaseModel):
    name: str | None = None
    system_prompt: str | None = None
    capabilities: list[str] | None = None
    heartbeat_interval: int | None = None
    state: str | None = None
    is_active: bool | None = None


@router.get("/agents")
async def list_agents(include_system: bool = True, db: AsyncSession = Depends(get_db)):
    """List all active agents."""
    agents = await agent_service.list_agents(db, include_system)
    return {"agents": agents}


@router.get("/agents/capacity")
async def check_capacity():
    """Check hardware capacity for creating another agent."""
    return await agent_service.check_capacity()


@router.get("/agents/heartbeat/status")
async def heartbeat_status(db: AsyncSession = Depends(get_db)):
    """Get heartbeat status for all agents."""
    agents = await agent_service.list_agents(db)
    return {
        "agents": [
            {
                "id": a["id"],
                "name": a["name"],
                "heartbeat_status": a["heartbeat_status"],
                "last_heartbeat_at": a["last_heartbeat_at"],
                "state": a["state"],
            }
            for a in agents
        ]
    }


@router.get("/agents/a2a/log")
async def get_a2a_log(limit: int = 100, db: AsyncSession = Depends(get_db)):
    """Get the full A2A message log."""
    messages = await a2a.get_full_log(db, limit)
    return {"messages": messages}


@router.get("/agents/status")
async def get_orchestrator_status():
    """Get full orchestrator status."""
    return meta_orchestrator.get_status()


@router.get("/agents/log/recent")
async def get_agent_log(limit: int = 50):
    return {"log": meta_orchestrator.get_work_log(limit)}


@router.post("/agents", status_code=201)
async def create_agent(data: CreateAgentRequest, db: AsyncSession = Depends(get_db)):
    """Create a new user agent."""
    agent = await agent_service.create_agent(
        db,
        name=data.name,
        role=data.role,
        system_prompt=data.system_prompt,
        capabilities=data.capabilities,
        heartbeat_interval=data.heartbeat_interval,
    )
    try:
        from app.api.websocket import manager as ws_manager
        await ws_manager.broadcast("agent_created", agent)
    except Exception:
        pass
    # Start the custom agent's work loop
    try:
        from app.agents.custom_worker import start_custom_agent
        await start_custom_agent(agent["id"], agent["name"])
    except Exception:
        pass
    return agent


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    """Get a specific agent's full details."""
    agent = await agent_service.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.patch("/agents/{agent_id}")
async def update_agent(agent_id: str, data: UpdateAgentRequest, db: AsyncSession = Depends(get_db)):
    """Update an agent's configuration."""
    updates = data.model_dump(exclude_unset=True)
    if "heartbeat_interval" in updates:
        updates["heartbeat_interval_seconds"] = updates.pop("heartbeat_interval")
    agent = await agent_service.update_agent(db, agent_id, updates)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.delete("/agents/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    """Soft-delete an agent."""
    # Stop custom agent worker if running
    try:
        from app.agents.custom_worker import stop_custom_agent
        await stop_custom_agent(agent_id)
    except Exception:
        pass
    if not await agent_service.delete_agent(db, agent_id):
        raise HTTPException(status_code=404, detail="Agent not found or is a system agent")


@router.post("/agents/{agent_id}/pause")
async def pause_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    from app.models.agent import AgentState
    if not await agent_service.set_agent_state(db, agent_id, AgentState.PAUSED):
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"status": "paused"}


@router.post("/agents/{agent_id}/resume")
async def resume_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    from app.models.agent import AgentState
    if not await agent_service.set_agent_state(db, agent_id, AgentState.IDLE):
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"status": "resumed"}


# ───── Avatar ─────


@router.post("/agents/{agent_id}/avatar")
async def upload_avatar(agent_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Upload an avatar image for an agent."""
    agent = await agent_service.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if file.content_type not in ("image/png", "image/jpeg", "image/webp", "image/gif"):
        raise HTTPException(status_code=400, detail="Avatar must be PNG, JPEG, WebP, or GIF")

    ext = file.filename.split(".")[-1] if file.filename else "png"
    filename = f"{agent_id}.{ext}"
    avatar_dir = Path(settings.agent_avatars_dir)
    avatar_dir.mkdir(parents=True, exist_ok=True)
    dest = avatar_dir / filename

    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    await agent_service.update_agent(db, agent_id, {"avatar_path": str(dest)})
    return {"avatar_path": str(dest)}


@router.get("/agents/{agent_id}/avatar")
async def get_avatar(agent_id: str, db: AsyncSession = Depends(get_db)):
    """Serve an agent's avatar image."""
    agent = await agent_service.get_agent(db, agent_id)
    if not agent or not agent.get("avatar_path"):
        raise HTTPException(status_code=404, detail="No avatar found")
    path = Path(agent["avatar_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Avatar file missing")
    return FileResponse(path)


# ───── Agent Memory ─────


@router.get("/agents/{agent_id}/memory")
async def get_memory(agent_id: str, db: AsyncSession = Depends(get_db)):
    memory = await agent_service.get_agent_memory(db, agent_id)
    return {"agent_id": agent_id, "memory": memory}


@router.patch("/agents/{agent_id}/memory")
async def update_memory(agent_id: str, updates: dict, db: AsyncSession = Depends(get_db)):
    memory = await agent_service.update_agent_memory(db, agent_id, updates)
    return {"agent_id": agent_id, "memory": memory}


# ───── A2A Messaging ─────


class A2AMessageRequest(BaseModel):
    to_agent_id: str | None = None
    message_type: str = "consult"
    content: str
    metadata: dict | None = None


@router.get("/agents/{agent_id}/messages")
async def get_messages(agent_id: str, limit: int = 50, unread_only: bool = False, db: AsyncSession = Depends(get_db)):
    messages = await a2a.get_messages(db, agent_id, limit, unread_only)
    return {"messages": messages}


@router.post("/agents/{agent_id}/messages")
async def send_message(agent_id: str, data: A2AMessageRequest, db: AsyncSession = Depends(get_db)):
    msg = await a2a.send_message(
        db,
        from_agent_id=agent_id,
        to_agent_id=data.to_agent_id,
        message_type=data.message_type,
        content=data.content,
        metadata=data.metadata,
    )
    return msg


# ───── Audit Agents ─────


@router.get("/audit/ux/latest")
async def get_ux_eval():
    report = ux_eval_agent.get_latest_report()
    if not report:
        return {"status": "no_reports", "message": "No UX evaluation has run yet."}
    return report


@router.post("/audit/ux/run")
async def trigger_ux_eval():
    return await ux_eval_agent.run_evaluation()


@router.get("/audit/sim/latest")
async def get_sim_report():
    report = user_sim_agent.get_latest_report()
    if not report:
        return {"status": "no_reports", "message": "No simulation has run yet."}
    return report


@router.post("/audit/sim/run")
async def trigger_simulation():
    return await user_sim_agent.run_simulation()


# ───── Agent Export / Transfer ─────


class AgentExportData(BaseModel):
    name: str
    role: str
    system_prompt: str
    capabilities: list[str]
    heartbeat_interval: int
    memory: dict


@router.get("/agents/{agent_id}/export")
async def export_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    """Export an agent's configuration as a portable JSON config."""
    agent = await agent_service.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {
        "reclaw_version": "0.1.0",
        "type": "agent_config",
        "agent": {
            "name": agent["name"],
            "role": agent["role"],
            "system_prompt": agent["system_prompt"],
            "capabilities": agent["capabilities"],
            "heartbeat_interval": agent["heartbeat_interval_seconds"],
            "memory": agent["memory"],
        },
    }


@router.post("/agents/import")
async def import_agent(data: AgentExportData, db: AsyncSession = Depends(get_db)):
    """Import an agent from an exported config."""
    agent = await agent_service.create_agent(
        db,
        name=data.name,
        role=data.role,
        system_prompt=data.system_prompt,
        capabilities=data.capabilities,
        heartbeat_interval=data.heartbeat_interval,
    )
    # Apply memory if provided
    if data.memory:
        await agent_service.update_agent_memory(db, agent["id"], data.memory)
        agent = await agent_service.get_agent(db, agent["id"])
    return agent


# ───── Resource Governor ─────


@router.get("/resources")
async def get_resource_status():
    return governor.get_status()


# ───── Context Hierarchy ─────


class ContextCreateRequest(BaseModel):
    name: str
    level_type: str
    content: str
    project_id: str = ""
    parent_id: str = ""
    priority: int = 0


class ContextUpdateRequest(BaseModel):
    name: str | None = None
    content: str | None = None
    priority: int | None = None
    enabled: bool | None = None


@router.get("/contexts")
async def list_contexts(
    level_type: str | None = None,
    project_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    docs = await context_hierarchy.list_contexts(db, level_type, project_id)
    return {
        "contexts": [
            {
                "id": d.id, "name": d.name, "level": d.level,
                "level_type": d.level_type, "content_preview": d.content[:200],
                "content_length": len(d.content), "priority": d.priority,
                "enabled": d.enabled, "project_id": d.project_id,
            }
            for d in docs
        ]
    }


@router.post("/contexts", status_code=201)
async def create_context(data: ContextCreateRequest, db: AsyncSession = Depends(get_db)):
    valid_types = {"platform", "company", "product", "project", "task", "agent"}
    if data.level_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid level_type. Must be: {', '.join(valid_types)}")
    doc = await context_hierarchy.create_context(
        db, data.name, data.level_type, data.content,
        data.project_id, data.parent_id, data.priority,
    )
    return {"id": doc.id, "name": doc.name, "level": doc.level, "level_type": doc.level_type}


@router.get("/contexts/{doc_id}")
async def get_context(doc_id: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    result = await db.execute(select(ContextDocument).where(ContextDocument.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Context not found")
    return {
        "id": doc.id, "name": doc.name, "level": doc.level,
        "level_type": doc.level_type, "content": doc.content,
        "priority": doc.priority, "enabled": doc.enabled,
        "project_id": doc.project_id, "parent_id": doc.parent_id,
    }


@router.patch("/contexts/{doc_id}")
async def update_context(doc_id: str, data: ContextUpdateRequest, db: AsyncSession = Depends(get_db)):
    updates = data.model_dump(exclude_unset=True)
    doc = await context_hierarchy.update_context(db, doc_id, updates)
    if not doc:
        raise HTTPException(status_code=404, detail="Context not found")
    return {"id": doc.id, "name": doc.name, "updated": True}


@router.delete("/contexts/{doc_id}", status_code=204)
async def delete_context(doc_id: str, db: AsyncSession = Depends(get_db)):
    if not await context_hierarchy.delete_context(db, doc_id):
        raise HTTPException(status_code=404, detail="Context not found")


@router.get("/contexts/composed/{project_id}")
async def get_composed_context(project_id: str, db: AsyncSession = Depends(get_db)):
    composed = await context_hierarchy.compose_context(db, project_id)
    return {"project_id": project_id, "composed_context": composed, "length": len(composed)}
