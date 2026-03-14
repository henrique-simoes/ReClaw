"""Skills management API — CRUD, versioning, self-improvement, execution, health monitoring."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.agent import agent
from app.skills.skill_manager import skill_manager
from app.skills.registry import registry

router = APIRouter()


class SkillExecuteRequest(BaseModel):
    project_id: str
    files: list[str] = []
    parameters: dict = {}
    user_context: str = ""


class SkillPlanRequest(BaseModel):
    project_id: str
    user_context: str = ""


class SkillCreateRequest(BaseModel):
    name: str
    display_name: str
    description: str
    phase: str
    skill_type: str
    plan_prompt: str = ""
    execute_prompt: str = ""
    output_schema: str = ""


class SkillUpdateRequest(BaseModel):
    display_name: str | None = None
    description: str | None = None
    plan_prompt: str | None = None
    execute_prompt: str | None = None
    output_schema: str | None = None
    enabled: bool | None = None
    changelog_entry: str = ""


# --- Skill CRUD ---

@router.get("/skills")
async def list_skills(phase: str | None = None):
    """List all skill definitions with optional phase filter."""
    if phase:
        skills = skill_manager.list_by_phase(phase)
    else:
        skills = skill_manager.list_all()

    return {
        "skills": [s.to_dict() for s in skills],
        "count": len(skills),
        "by_phase": {
            p: len(skill_manager.list_by_phase(p))
            for p in ["discover", "define", "develop", "deliver"]
        },
    }


# --- Routes with fixed paths MUST come before {name} parameterized routes ---

@router.get("/skills/health/all")
async def get_all_health():
    """Get health scores for all skills."""
    return {"skills": skill_manager.get_all_health()}


@router.get("/skills/proposals/pending")
async def get_pending_proposals():
    """Get all pending skill improvement proposals."""
    return {
        "proposals": [p.to_dict() for p in skill_manager.get_pending_proposals()],
        "count": len(skill_manager.get_pending_proposals()),
    }


@router.get("/skills/proposals/all")
async def get_all_proposals(limit: int = 50):
    """Get all proposals (pending, approved, rejected)."""
    return {
        "proposals": [p.to_dict() for p in skill_manager.get_all_proposals(limit)],
    }


# --- Parameterized routes ---

@router.get("/skills/{name}")
async def get_skill(name: str):
    """Get a single skill definition with full details."""
    defn = skill_manager.get(name)
    if not defn:
        raise HTTPException(status_code=404, detail=f"Skill not found: {name}")

    result = defn.to_dict()
    result["health"] = skill_manager.get_skill_health(name)
    result["usage"] = skill_manager.get_usage_stats(name)
    return result


@router.post("/skills", status_code=201)
async def create_skill(data: SkillCreateRequest):
    """Create a new skill definition."""
    if skill_manager.get(data.name):
        raise HTTPException(status_code=409, detail=f"Skill already exists: {data.name}")

    defn = skill_manager.create_skill(data.model_dump())
    return defn.to_dict()


@router.patch("/skills/{name}")
async def update_skill(name: str, data: SkillUpdateRequest):
    """Update a skill definition (auto-increments version)."""
    if not skill_manager.get(name):
        raise HTTPException(status_code=404, detail=f"Skill not found: {name}")

    updates = data.model_dump(exclude_unset=True, exclude={"changelog_entry"})
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    defn = skill_manager.update_skill(name, updates, data.changelog_entry)
    return defn.to_dict()


@router.delete("/skills/{name}", status_code=204)
async def delete_skill(name: str):
    """Delete a skill (backed up, recoverable)."""
    if not skill_manager.delete_skill(name):
        raise HTTPException(status_code=404, detail=f"Skill not found: {name}")


@router.post("/skills/{name}/toggle")
async def toggle_skill(name: str, enabled: bool = True):
    """Enable or disable a skill."""
    defn = skill_manager.toggle_skill(name, enabled)
    return {"name": name, "enabled": defn.enabled, "version": defn.version}


# --- Health & Usage (specific {name} routes) ---

@router.get("/skills/{name}/health")
async def get_skill_health(name: str):
    """Get health score for a specific skill."""
    health = skill_manager.get_skill_health(name)
    if health.get("status") == "not_found":
        raise HTTPException(status_code=404, detail=f"Skill not found: {name}")
    return health


# --- Self-Improvement Proposals ---

@router.post("/skills/proposals/{proposal_id}/approve")
async def approve_proposal(proposal_id: str):
    """Approve a skill improvement proposal (applies the change)."""
    if not skill_manager.approve_proposal(proposal_id):
        raise HTTPException(status_code=404, detail="Proposal not found or not pending")
    return {"status": "approved", "proposal_id": proposal_id}


@router.post("/skills/proposals/{proposal_id}/reject")
async def reject_proposal(proposal_id: str, reason: str = ""):
    """Reject a skill improvement proposal."""
    if not skill_manager.reject_proposal(proposal_id, reason):
        raise HTTPException(status_code=404, detail="Proposal not found or not pending")
    return {"status": "rejected", "proposal_id": proposal_id}


# --- Skill Execution ---

@router.post("/skills/{name}/execute")
async def execute_skill(name: str, data: SkillExecuteRequest):
    """Execute a skill on a project. Stores findings automatically.

    This is the main way to invoke skills — from the UI, chat, or API.
    The agent runs the skill, stores nuggets/facts/insights/recommendations,
    and returns the output.
    """
    if not registry.get(name):
        raise HTTPException(status_code=404, detail=f"Skill not found: {name}")

    output = await agent.execute_skill(
        skill_name=name,
        project_id=data.project_id,
        files=data.files,
        parameters=data.parameters,
        user_context=data.user_context,
    )

    return {
        "success": output.success,
        "summary": output.summary,
        "nuggets_count": len(output.nuggets),
        "facts_count": len(output.facts),
        "insights_count": len(output.insights),
        "recommendations_count": len(output.recommendations),
        "suggestions": output.suggestions,
        "errors": output.errors,
        "artifacts": list(output.artifacts.keys()),
    }


@router.post("/skills/{name}/plan")
async def plan_skill(name: str, data: SkillPlanRequest):
    """Generate a research plan using a skill.

    Returns a plan with steps, methods, and recommendations
    without actually executing the skill.
    """
    if not registry.get(name):
        raise HTTPException(status_code=404, detail=f"Skill not found: {name}")

    plan = await agent.plan_skill(
        skill_name=name,
        project_id=data.project_id,
        user_context=data.user_context,
    )

    if "error" in plan:
        raise HTTPException(status_code=400, detail=plan["error"])

    return plan
