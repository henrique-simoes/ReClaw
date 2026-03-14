"""ReClaw — Local-first AI agent for UX Research."""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import agents, audit, chat, files, findings, metrics, projects, settings, skills, tasks
from app.api.websocket import router as ws_router
from app.agents.devops_agent import devops_agent
from app.agents.ui_audit_agent import ui_audit_agent
from app.agents.ux_eval_agent import ux_eval_agent
from app.agents.user_sim_agent import user_sim_agent
from app.agents.orchestrator import meta_orchestrator
from app.config import settings as app_settings
from app.core.agent import agent as agent_orchestrator
from app.core.file_watcher import FileWatcher
from app.models.database import init_db
from app.skills.registry import load_default_skills
from app.skills.skill_manager import skill_manager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application startup and shutdown lifecycle."""
    # Startup
    app_settings.ensure_dirs()
    await init_db()
    load_default_skills()
    skill_manager.load_all()

    # Auto-pull default model if not available
    from app.core.ollama import ollama
    try:
        if await ollama.health():
            models = await ollama.list_models()
            model_names = [m.get("name", "") for m in models]
            if not any(app_settings.ollama_model in n for n in model_names):
                import logging
                logging.getLogger(__name__).info(f"Pulling default model: {app_settings.ollama_model}")
                async for _ in ollama.pull_model(app_settings.ollama_model):
                    pass
    except Exception:
        pass  # Don't block startup if model pull fails

    # Start file watcher
    watcher = FileWatcher()
    watcher_task = asyncio.create_task(watcher.start())
    app.state.file_watcher = watcher

    # Start all agents and orchestrator
    bg_tasks = [
        asyncio.create_task(devops_agent.start()),
        asyncio.create_task(ui_audit_agent.start()),
        asyncio.create_task(ux_eval_agent.start()),
        asyncio.create_task(user_sim_agent.start()),
        asyncio.create_task(agent_orchestrator.start()),
        asyncio.create_task(meta_orchestrator.start()),
    ]

    yield

    # Shutdown
    watcher.stop()
    devops_agent.stop()
    ui_audit_agent.stop()
    ux_eval_agent.stop()
    user_sim_agent.stop()
    agent_orchestrator.stop()
    meta_orchestrator.stop()

    for task in [watcher_task, *bg_tasks]:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="ReClaw",
    description="Local-first AI agent for UX Research",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(projects.router, prefix="/api", tags=["Projects"])
app.include_router(tasks.router, prefix="/api", tags=["Tasks"])
app.include_router(findings.router, prefix="/api", tags=["Findings"])
app.include_router(files.router, prefix="/api", tags=["Files"])
app.include_router(settings.router, prefix="/api", tags=["Settings"])
app.include_router(audit.router, prefix="/api", tags=["Audit"])
app.include_router(skills.router, prefix="/api", tags=["Skills"])
app.include_router(agents.router, prefix="/api", tags=["Agents"])
app.include_router(metrics.router, prefix="/api", tags=["Metrics"])
app.include_router(ws_router)


@app.get("/api/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {"status": "healthy", "service": "reclaw"}


@app.get("/api/skill-registry")
async def list_registered_skills():
    """List all registered skills from the runtime registry."""
    from app.skills.registry import registry
    return registry.to_dict()
