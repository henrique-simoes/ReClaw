"""Agent management and orchestrator API routes."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.orchestrator import meta_orchestrator, AgentRole
from app.agents.ux_eval_agent import ux_eval_agent
from app.agents.user_sim_agent import user_sim_agent
from app.core.resource_governor import governor
from app.core.context_hierarchy import context_hierarchy, ContextDocument
from app.models.database import get_db

router = APIRouter()


# --- Orchestrator ---

@router.get("/agents/status")
async def get_orchestrator_status():
    """Get full orchestrator status with all agents."""
    return meta_orchestrator.get_status()


@router.get("/agents")
async def list_agents():
    """List all managed agents."""
    return {"agents": [a.to_dict() for a in meta_orchestrator.list_agents()]}


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    """Get a specific agent's details."""
    agent = meta_orchestrator.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent.to_dict()


class AgentPromptUpdate(BaseModel):
    system_prompt: str


@router.patch("/agents/{agent_id}/prompt")
async def update_agent_prompt(agent_id: str, data: AgentPromptUpdate):
    """Update an agent's system prompt."""
    if not meta_orchestrator.update_agent_prompt(agent_id, data.system_prompt):
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"status": "updated", "agent_id": agent_id}


class CreateAgentRequest(BaseModel):
    name: str
    role: str = "task_executor"
    system_prompt: str


@router.post("/agents", status_code=201)
async def create_agent(data: CreateAgentRequest):
    """Create a custom agent with user-defined system prompt."""
    try:
        role = AgentRole(data.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be: {', '.join(r.value for r in AgentRole)}")

    agent = meta_orchestrator.create_custom_agent(data.name, role, data.system_prompt)
    return agent.to_dict()


@router.post("/agents/{agent_id}/pause")
async def pause_agent(agent_id: str):
    if not meta_orchestrator.pause_agent(agent_id):
        raise HTTPException(status_code=404, detail="Agent not found or not pausable")
    return {"status": "paused"}


@router.post("/agents/{agent_id}/resume")
async def resume_agent(agent_id: str):
    if not meta_orchestrator.resume_agent(agent_id):
        raise HTTPException(status_code=404, detail="Agent not found or not paused")
    return {"status": "resumed"}


@router.get("/agents/log/recent")
async def get_agent_log(limit: int = 50):
    return {"log": meta_orchestrator.get_work_log(limit)}


# --- Resource Governor ---

@router.get("/resources")
async def get_resource_status():
    """Get current resource status and budget."""
    return governor.get_status()


# --- UX Evaluation Agent ---

@router.get("/audit/ux/latest")
async def get_ux_eval():
    report = ux_eval_agent.get_latest_report()
    if not report:
        return {"status": "no_reports", "message": "No UX evaluation has run yet."}
    return report


@router.post("/audit/ux/run")
async def trigger_ux_eval():
    report = await ux_eval_agent.run_evaluation()
    return report


# --- User Simulation Agent ---

@router.get("/audit/sim/latest")
async def get_sim_report():
    report = user_sim_agent.get_latest_report()
    if not report:
        return {"status": "no_reports", "message": "No simulation has run yet."}
    return report


@router.post("/audit/sim/run")
async def trigger_simulation():
    report = await user_sim_agent.run_simulation()
    return report


# --- Context Hierarchy ---

class ContextCreateRequest(BaseModel):
    name: str
    level_type: str  # platform, company, product, project, task, agent
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
    """List context documents with optional filters."""
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
    """Create a new context document."""
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
    """Get full context document."""
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
    """Get the fully composed context hierarchy for a project."""
    composed = await context_hierarchy.compose_context(db, project_id)
    return {"project_id": project_id, "composed_context": composed, "length": len(composed)}
