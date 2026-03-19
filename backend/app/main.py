"""ReClaw — Local-first AI agent for UX Research."""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import agents, audit, channels, chat, codebooks, context_dag as context_dag_routes, files, findings, memory, metrics, projects, scheduler as scheduler_routes, sessions, settings, skills, tasks
from app.api.websocket import router as ws_router
from app.channels.base import channel_router
from app.channels.slack import SlackAdapter
from app.channels.telegram import TelegramAdapter
from app.agents.devops_agent import devops_agent
from app.agents.ui_audit_agent import ui_audit_agent
from app.agents.ux_eval_agent import ux_eval_agent
from app.agents.user_sim_agent import user_sim_agent
from app.agents.orchestrator import meta_orchestrator
from app.agents.custom_worker import load_custom_agents_from_db, stop_custom_agent as stop_custom_worker
from app.config import settings as app_settings
from app.core.agent import agent as agent_orchestrator
from app.core.file_watcher import FileWatcher
from app.core.scheduler import scheduler
from app.models.database import async_session, init_db
from app.services.agent_service import seed_system_agents
from app.services.heartbeat import heartbeat_manager
from app.skills.registry import load_default_skills
from app.skills.skill_manager import skill_manager


def _persist_env_startup(key: str, value: str, logger=None) -> None:
    """Persist a key to .env during startup (reuses settings.py logic)."""
    try:
        from app.api.routes.settings import _persist_env
        _persist_env(key, value)
        if logger:
            logger.info(f"Auto-persisted {key}={value} to .env")
    except Exception as e:
        if logger:
            logger.warning(f"Could not persist {key} to .env: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application startup and shutdown lifecycle."""
    # Startup
    app_settings.ensure_dirs()
    await init_db()
    load_default_skills()

    # Seed default system agents
    async with async_session() as db:
        await seed_system_agents(db)
    skill_manager.load_all()

    # Startup cleanup: remove orphaned sessions/messages whose project no longer exists
    import logging as _startup_log
    _cleanup_log = _startup_log.getLogger("startup.cleanup")
    try:
        from sqlalchemy import delete as sa_delete, select as sa_select
        from app.models.session import ChatSession
        from app.models.message import Message
        from app.models.project import Project

        async with async_session() as db:
            # Find all project IDs that actually exist
            existing_result = await db.execute(sa_select(Project.id))
            existing_ids = {row[0] for row in existing_result.fetchall()}

            # Find orphaned sessions (project_id not in existing projects)
            all_sessions_result = await db.execute(sa_select(ChatSession))
            all_sessions = all_sessions_result.scalars().all()
            orphaned_session_ids = [
                s.id for s in all_sessions if s.project_id not in existing_ids
            ]

            # Find orphaned messages (session not in any existing session)
            if orphaned_session_ids:
                from app.models.context_dag import ContextDAGNode
                await db.execute(
                    sa_delete(ContextDAGNode).where(
                        ContextDAGNode.session_id.in_(orphaned_session_ids)
                    )
                )
                await db.execute(
                    sa_delete(Message).where(
                        Message.session_id.in_(orphaned_session_ids)
                    )
                )
                await db.execute(
                    sa_delete(ChatSession).where(
                        ChatSession.id.in_(orphaned_session_ids)
                    )
                )
                await db.commit()
                _cleanup_log.info(
                    f"Startup cleanup: removed {len(orphaned_session_ids)} orphaned session(s)"
                )
            else:
                _cleanup_log.info("Startup cleanup: no orphaned records found")
    except Exception as e:
        _cleanup_log.warning(f"Startup cleanup skipped: {e}")

    # Register channel adapters (opt-in — not auto-started)
    channel_router.register(SlackAdapter())
    channel_router.register(TelegramAdapter())

    # Auto-detect LLM provider: try configured first, fall back to the other
    import logging
    _log = logging.getLogger(__name__)
    from app.core.ollama import ollama, auto_detect_provider
    try:
        await auto_detect_provider()
        # Re-import after potential provider switch
        from app.core import ollama as ollama_mod
        current_client = ollama_mod.ollama
        if await current_client.health():
            _log.info(f"LLM provider ({app_settings.llm_provider}) is online.")
            models = await current_client.list_models()
            model_names = [m.get("name", "") for m in models]

            if app_settings.llm_provider == "ollama":
                if not any(app_settings.ollama_model in n for n in model_names):
                    _log.info(f"Pulling default model: {app_settings.ollama_model}")
                    async for _ in current_client.pull_model(app_settings.ollama_model):
                        pass
                # Auto-detect if configured model is "default" or not loaded
                active = app_settings.ollama_model
                if active == "default" or not any(active in n for n in model_names):
                    non_embed = [n for n in model_names if "embed" not in n.lower()]
                    if non_embed:
                        resolved = non_embed[0]
                        app_settings.ollama_model = resolved
                        _log.info(f"Ollama active model resolved to: {resolved}")
                        _persist_env_startup("OLLAMA_MODEL", resolved, _log)
            elif app_settings.llm_provider == "lmstudio":
                # Detect the ACTUALLY loaded model by probing LM Studio.
                # /v1/models lists all downloaded models, not just loaded ones.
                # The only reliable detection is a minimal chat probe — the
                # response's 'model' field reveals which model is serving.
                from app.core.lmstudio import LMStudioClient
                lms_client = current_client if isinstance(current_client, LMStudioClient) else LMStudioClient()
                loaded = await lms_client.detect_loaded_model(force=True)
                if loaded and loaded != app_settings.lmstudio_model:
                    app_settings.lmstudio_model = loaded
                    _log.info(f"LM Studio active model detected: {loaded}")
                    _persist_env_startup("LMSTUDIO_MODEL", loaded, _log)
                elif loaded:
                    _log.info(f"LM Studio model confirmed: {loaded}")
                elif not loaded:
                    # Fallback: pick from model list if probe fails
                    active = app_settings.lmstudio_model
                    non_embed = [n for n in model_names if "embed" not in n.lower()]
                    if active == "default" or (active and active not in model_names):
                        if non_embed:
                            resolved = non_embed[0]
                            app_settings.lmstudio_model = resolved
                            _log.info(f"LM Studio model fallback to: {resolved}")
                            _persist_env_startup("LMSTUDIO_MODEL", resolved, _log)
                        elif model_names:
                            app_settings.lmstudio_model = model_names[0]
                            _persist_env_startup("LMSTUDIO_MODEL", model_names[0], _log)
        else:
            _log.warning(f"LLM provider ({app_settings.llm_provider}) is not reachable.")
    except Exception:
        pass  # Don't block startup if provider check fails

    # Vector store dimension health check
    try:
        from app.core.vector_health import check_embedding_dimensions
        dim_check = await check_embedding_dimensions()
        if dim_check["status"] == "mismatch":
            _log.warning(f"Embedding dimension mismatch: {dim_check['message']}")
        elif dim_check["status"] == "ok":
            _log.info(f"Vector dimensions OK ({dim_check['model_dim']}d)")
    except Exception as e:
        _log.warning(f"Dimension check skipped: {e}")

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
        asyncio.create_task(heartbeat_manager.start()),
        asyncio.create_task(scheduler.start()),
    ]

    # Start custom agent workers from DB
    await load_custom_agents_from_db()

    yield

    # Shutdown
    await channel_router.stop_all()
    watcher.stop()
    devops_agent.stop()
    ui_audit_agent.stop()
    ux_eval_agent.stop()
    user_sim_agent.stop()
    agent_orchestrator.stop()
    meta_orchestrator.stop()
    heartbeat_manager.stop()
    scheduler.stop()

    # Stop custom agent workers
    from app.agents.custom_worker import get_active_workers
    for worker_id in list(get_active_workers().keys()):
        await stop_custom_worker(worker_id)

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
app.include_router(codebooks.router, prefix="/api", tags=["Codebooks"])
app.include_router(files.router, prefix="/api", tags=["Files"])
app.include_router(settings.router, prefix="/api", tags=["Settings"])
app.include_router(audit.router, prefix="/api", tags=["Audit"])
app.include_router(skills.router, prefix="/api", tags=["Skills"])
app.include_router(agents.router, prefix="/api", tags=["Agents"])
app.include_router(metrics.router, prefix="/api", tags=["Metrics"])
app.include_router(scheduler_routes.router, prefix="/api", tags=["Schedules"])
app.include_router(channels.router, prefix="/api", tags=["Channels"])
app.include_router(sessions.router, prefix="/api", tags=["Sessions"])
app.include_router(memory.router, prefix="/api", tags=["Memory"])
app.include_router(context_dag_routes.router, prefix="/api", tags=["Context DAG"])
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


@app.get("/.well-known/agent.json")
async def agent_card():
    """A2A Protocol: Agent Card discovery endpoint."""
    return {
        "name": "ReClaw",
        "description": "Local-first AI agent for UX Research — analyzes interviews, surveys, usability tests and more using 40+ research skills.",
        "url": "http://localhost:8000",
        "version": "0.1.0",
        "protocol_version": "0.1",
        "capabilities": {
            "streaming": False,
            "push_notifications": False,
            "state_transition_history": True,
        },
        "skills": [
            {
                "id": "ux-research",
                "name": "UX Research Analysis",
                "description": "Analyzes user interviews, surveys, usability tests, and field studies to extract insights and recommendations.",
                "tags": ["ux", "research", "analysis", "interviews", "surveys"],
                "examples": [
                    "Analyze these interview transcripts",
                    "Run thematic analysis on survey responses",
                    "Create personas from research data",
                ],
            }
        ],
        "default_input_modes": ["text/plain", "application/json"],
        "default_output_modes": ["application/json"],
    }


@app.post("/a2a")
async def a2a_jsonrpc(request: Request):
    """A2A Protocol: JSON-RPC 2.0 endpoint for agent-to-agent communication."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"jsonrpc": "2.0", "error": {"code": -32700, "message": "Parse error"}, "id": None},
        )

    method = body.get("method", "")
    params = body.get("params", {})
    req_id = body.get("id")

    if method == "tasks/send":
        # Create a task from A2A message
        from app.models.database import async_session as a2a_session
        from app.services import a2a as a2a_svc
        async with a2a_session() as db:
            msg = await a2a_svc.send_message(
                db,
                from_agent_id=params.get("from", "external"),
                to_agent_id=params.get("to", "reclaw-main"),
                message_type="a2a_task",
                content=params.get("message", {}).get("text", ""),
                metadata=params.get("message", {}).get("metadata"),
            )
            return {"jsonrpc": "2.0", "result": {"id": msg["id"], "status": "submitted"}, "id": req_id}

    elif method == "tasks/get":
        task_id = params.get("id")
        from app.models.database import async_session as a2a_session
        from app.services import a2a as a2a_svc
        async with a2a_session() as db:
            messages = await a2a_svc.get_full_log(db, limit=200)
            task = next((m for m in messages if m["id"] == task_id), None)
            if task:
                return {"jsonrpc": "2.0", "result": task, "id": req_id}
            return JSONResponse(
                status_code=404,
                content={"jsonrpc": "2.0", "error": {"code": -32001, "message": "Task not found"}, "id": req_id},
            )

    elif method == "tasks/list":
        from app.models.database import async_session as a2a_session
        from app.services import a2a as a2a_svc
        async with a2a_session() as db:
            messages = await a2a_svc.get_full_log(db, limit=params.get("limit", 50))
            return {"jsonrpc": "2.0", "result": {"tasks": messages}, "id": req_id}

    elif method == "tasks/cancel":
        return {"jsonrpc": "2.0", "result": {"status": "canceled"}, "id": req_id}

    elif method == "agent/discover":
        # Return list of available agents
        from app.models.database import async_session as a2a_session
        from app.services import agent_service
        async with a2a_session() as db:
            agents = await agent_service.list_agents(db)
            return {"jsonrpc": "2.0", "result": {"agents": agents}, "id": req_id}

    else:
        return JSONResponse(
            status_code=400,
            content={"jsonrpc": "2.0", "error": {"code": -32601, "message": f"Method not found: {method}"}, "id": req_id},
        )
