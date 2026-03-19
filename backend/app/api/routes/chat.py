"""Chat API route — streaming LLM responses with RAG augmentation.

Now with full agent identity integration: when a session has an assigned
agent, the agent's persona (CORE.md, SKILLS.md, PROTOCOLS.md, MEMORY.md)
is loaded and injected into the system prompt, giving each agent a distinct
personality, expertise, and behavioral patterns.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.agent import agent
from app.core.agent_identity import load_agent_identity, get_agent_display_name
from app.core.prompt_rag import compose_dynamic_prompt, compose_keyword_prompt
from app.core.context_summarizer import context_summarizer
from app.core.ollama import ollama
from app.core.rag import build_augmented_prompt, retrieve_context
from app.core.token_counter import context_guard
from app.models.database import get_db, async_session
from app.models.agent import Agent
from app.models.message import Message
from app.models.project import Project
from app.models.session import ChatSession, INFERENCE_PRESETS
from app.skills.registry import registry

_chat_log = logging.getLogger(__name__)

router = APIRouter()


def _detect_skill_intent(message: str) -> str | None:
    """Detect if the user wants to run a specific skill from their message.

    Returns skill name if detected, None otherwise.
    """
    msg = message.lower()

    # Explicit triggers: "run X", "execute X", "analyze with X", "use X skill"
    explicit = re.search(
        r"(?:run|execute|use|start|do|perform|conduct)\s+(?:the\s+)?(?:a\s+)?(.+?)(?:\s+skill|\s+analysis|\s+on|\s+for|$)",
        msg,
    )

    # Map common phrases to skill names
    intent_map = {
        "interview": "user-interviews",
        "transcript": "user-interviews",
        "analyze interview": "user-interviews",
        "analyze transcript": "user-interviews",
        "competitive analysis": "competitive-analysis",
        "competitor": "competitive-analysis",
        "survey design": "survey-design",
        "create survey": "survey-generator",
        "generate survey": "survey-generator",
        "generate interview": "interview-question-generator",
        "create interview guide": "interview-question-generator",
        "affinity map": "affinity-mapping",
        "cluster": "affinity-mapping",
        "persona": "persona-creation",
        "create persona": "persona-creation",
        "journey map": "journey-mapping",
        "empathy map": "empathy-mapping",
        "jobs to be done": "jtbd-analysis",
        "jtbd": "jtbd-analysis",
        "how might we": "hmw-statements",
        "hmw": "hmw-statements",
        "user flow": "user-flow-mapping",
        "thematic analysis": "thematic-analysis",
        "code the data": "thematic-analysis",
        "synthesize": "research-synthesis",
        "synthesis report": "research-synthesis",
        "prioritize": "prioritization-matrix",
        "prioritization": "prioritization-matrix",
        "usability test": "usability-testing",
        "heuristic eval": "heuristic-evaluation",
        "heuristic review": "heuristic-evaluation",
        "a/b test": "ab-test-analysis",
        "card sort": "card-sorting",
        "tree test": "tree-testing",
        "concept test": "concept-testing",
        "cognitive walkthrough": "cognitive-walkthrough",
        "design critique": "design-critique",
        "expert review": "design-critique",
        "prototype feedback": "prototype-feedback",
        "workshop": "workshop-facilitation",
        "sus score": "sus-umux-scoring",
        "umux": "sus-umux-scoring",
        "nps": "nps-analysis",
        "task analysis": "task-analysis-quant",
        "impact analysis": "regression-impact",
        "design system audit": "design-system-audit",
        "handoff": "handoff-documentation",
        "presentation": "stakeholder-presentation",
        "retro": "research-retro",
        "retrospective": "research-retro",
        "longitudinal": "longitudinal-tracking",
        "taxonomy": "taxonomy-generator",
        "kappa": "kappa-thematic-analysis",
        "intercoder": "kappa-thematic-analysis",
        "detect ai": "survey-ai-detection",
        "bot detection": "survey-ai-detection",
        "ai response": "survey-ai-detection",
        "diary stud": "diary-studies",
        "field stud": "field-studies",
        "ethnograph": "field-studies",
        "accessibility audit": "accessibility-audit",
        "wcag": "accessibility-audit",
        "desk research": "desk-research",
        "literature review": "desk-research",
        "stakeholder interview": "stakeholder-interviews",
        "analytics review": "analytics-review",
        "repository curation": "repository-curation",
    }

    for phrase, skill_name in intent_map.items():
        if phrase in msg:
            # Verify skill exists in registry
            if registry.get(skill_name):
                return skill_name

    return None


class ChatRequest(BaseModel):
    """Chat request body."""

    message: str
    project_id: str
    session_id: str | None = None
    include_history: bool = True
    max_history: int = 20


class ChatMessage(BaseModel):
    """Chat message response."""

    id: str
    role: str
    content: str
    created_at: datetime


@router.post("/chat")
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    """Send a message and get a streaming response with RAG augmentation.

    The response is streamed as Server-Sent Events (SSE).
    """
    # Verify project exists
    result = await db.execute(select(Project).where(Project.id == request.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Save user message
    user_msg = Message(
        id=str(uuid.uuid4()),
        project_id=request.project_id,
        session_id=request.session_id,
        role="user",
        content=request.message,
    )
    db.add(user_msg)
    await db.commit()

    # Check if the user is asking to run a specific skill
    skill_intent = _detect_skill_intent(request.message)
    if skill_intent:
        # Execute the skill and return results as a chat message
        output = await agent.execute_skill(
            skill_name=skill_intent,
            project_id=request.project_id,
            user_context=request.message,
        )
        skill_response = (
            f"🧩 **Ran {skill_intent}**\n\n"
            f"{output.summary}\n\n"
            f"📊 Results: {len(output.nuggets)} nuggets, {len(output.facts)} facts, "
            f"{len(output.insights)} insights, {len(output.recommendations)} recommendations"
        )
        if output.suggestions:
            skill_response += "\n\n💡 Suggestions:\n" + "\n".join(f"- {s}" for s in output.suggestions[:3])
        if output.errors:
            skill_response += "\n\n⚠️ Issues:\n" + "\n".join(f"- {e}" for e in output.errors)

        # Save as assistant message
        assistant_msg = Message(
            id=str(uuid.uuid4()),
            project_id=request.project_id,
            session_id=request.session_id,
            role="assistant",
            content=skill_response,
        )
        db.add(assistant_msg)
        await db.commit()

        async def skill_stream():
            event_data = json.dumps({"type": "chunk", "content": skill_response})
            yield f"data: {event_data}\n\n"
            done_data = json.dumps({"type": "done", "message_id": assistant_msg.id, "sources": []})
            yield f"data: {done_data}\n\n"

        return StreamingResponse(skill_stream(), media_type="text/event-stream",
                                  headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})

    # --- Resolve session-specific inference settings ---
    llm_temperature = 0.7
    llm_max_tokens: int | None = None
    llm_model: str | None = None
    session_agent_id: str | None = None
    agent_identity_prompt: str = ""

    if request.session_id:
        sess_result = await db.execute(
            select(ChatSession).where(ChatSession.id == request.session_id)
        )
        session = sess_result.scalar_one_or_none()
        if session:
            preset_key = session.inference_preset.value if session.inference_preset else "medium"
            preset = INFERENCE_PRESETS.get(preset_key, INFERENCE_PRESETS["medium"])

            if preset_key == "custom":
                llm_temperature = session.custom_temperature if session.custom_temperature is not None else 0.7
                llm_max_tokens = session.custom_max_tokens
            else:
                llm_temperature = preset["temperature"] if preset["temperature"] is not None else 0.7
                llm_max_tokens = preset["max_tokens"]

            if session.model_override:
                llm_model = session.model_override

            # Load agent identity for this session
            # Use Prompt RAG for query-aware identity (retrieves relevant
            # persona sections based on the user's message)
            session_agent_id = session.agent_id
            if session_agent_id:
                try:
                    agent_identity_prompt = await compose_dynamic_prompt(
                        session_agent_id,
                        query=request.message,
                        use_embeddings=True,
                    )
                except Exception:
                    # Fall back to full identity load
                    agent_identity_prompt = load_agent_identity(session_agent_id)

                if agent_identity_prompt:
                    _chat_log.info(
                        f"Loaded agent identity for {session_agent_id} "
                        f"({len(agent_identity_prompt)} chars, prompt-rag)"
                    )
                else:
                    # Fallback: load system_prompt from DB agent record
                    agent_result = await db.execute(
                        select(Agent).where(Agent.id == session_agent_id)
                    )
                    db_agent = agent_result.scalar_one_or_none()
                    if db_agent and db_agent.system_prompt:
                        agent_identity_prompt = db_agent.system_prompt

            # Update session message count and last_message_at
            session.message_count = (session.message_count or 0) + 1
            session.last_message_at = user_msg.created_at
            await db.commit()

    # If no agent identity loaded yet, default to reclaw-main
    if not agent_identity_prompt:
        try:
            agent_identity_prompt = await compose_dynamic_prompt(
                "reclaw-main",
                query=request.message,
                use_embeddings=True,
            )
        except Exception:
            agent_identity_prompt = load_agent_identity("reclaw-main")

    # Retrieve context via RAG
    rag_context = await retrieve_context(request.project_id, request.message)

    # Build system prompt with context layers + agent identity
    system_prompt = build_augmented_prompt(
        query=request.message,
        rag_context=rag_context,
        project_context=project.project_context or None,
        company_context=project.company_context or None,
    )

    # Inject agent identity at the top of the system prompt
    if agent_identity_prompt:
        system_prompt = agent_identity_prompt + "\n\n---\n\n" + system_prompt

    # Inject project folder file awareness
    upload_dir = Path(settings.upload_dir) / request.project_id
    if upload_dir.exists():
        project_files = [
            f.name for f in upload_dir.iterdir()
            if f.is_file() and not f.name.startswith(".")
        ]
        if project_files:
            files_context = (
                f"\n\n## Project Files Available\n"
                f"The following files are in this project's scope and can be "
                f"referenced without the user needing to upload them again:\n"
                + "\n".join(f"- {name}" for name in project_files[:50])
            )
            system_prompt += files_context

    # Build message history (scoped to session if provided)
    messages = []
    if request.include_history:
        history_query = select(Message).where(Message.project_id == request.project_id)
        if request.session_id:
            history_query = history_query.where(Message.session_id == request.session_id)
        history_result = await db.execute(
            history_query.order_by(Message.created_at.desc()).limit(request.max_history)
        )
        history = list(reversed(history_result.scalars().all()))

        for msg in history:
            if msg.role in ("user", "assistant"):
                messages.append({"role": msg.role, "content": msg.content})

    # Add current message if not already in history
    if not messages or messages[-1]["content"] != request.message:
        messages.append({"role": "user", "content": request.message})

    # --- DAG-based context summarization: summarize older messages ----------
    try:
        messages, ctx_summary = await context_summarizer.apply_summarization(
            system_prompt, messages, session_id=request.session_id
        )
        if ctx_summary:
            import logging as _log
            _log.getLogger(__name__).info(
                "Context summarized: %d msgs, %d -> %d tokens",
                ctx_summary.messages_summarized,
                ctx_summary.original_token_count,
                ctx_summary.summary_token_count,
            )
    except Exception:
        pass  # Fall through to hard trim on summarization failure

    # --- Context window guard: trim history if it would overflow ----------
    messages, trim_summary = context_guard.summarize_if_needed(
        system_prompt, messages
    )
    if trim_summary:
        # Prepend the trim note so the model knows history was truncated
        messages.insert(0, {"role": "system", "content": trim_summary})

    # Prepend the system prompt into the messages list directly so the LLM
    # client doesn't receive a separate `system=` param that would create
    # duplicate system messages (root cause of LM Studio 400 errors).
    messages = [{"role": "system", "content": system_prompt}, *messages]

    async def generate():
        """Stream the LLM response as SSE events.

        Uses its own DB session to avoid leak when client disconnects mid-stream.
        """
        full_response = []

        try:
            async for chunk in ollama.chat_stream(
                messages=messages,
                model=llm_model,
                temperature=llm_temperature,
                max_tokens=llm_max_tokens,
            ):
                full_response.append(chunk)
                event_data = json.dumps({"type": "chunk", "content": chunk})
                yield f"data: {event_data}\n\n"

            # Save assistant response in a fresh session (avoids leak)
            async with async_session() as save_db:
                assistant_content = "".join(full_response)
                assistant_msg = Message(
                    id=str(uuid.uuid4()),
                    project_id=request.project_id,
                    session_id=request.session_id,
                    role="assistant",
                    content=assistant_content,
                )
                save_db.add(assistant_msg)
                await save_db.commit()

                # Trigger DAG compaction asynchronously
                if settings.dag_enabled and request.session_id:
                    try:
                        from app.core.context_dag import context_dag
                        import asyncio as _asyncio
                        _asyncio.create_task(context_dag.compact_if_needed(request.session_id))
                    except Exception:
                        pass

                sources = [
                    {"source": r.source, "score": r.score, "page": r.page}
                    for r in rag_context.retrieved
                ]
                done_data = json.dumps({
                    "type": "done",
                    "message_id": assistant_msg.id,
                    "sources": sources,
                })
                yield f"data: {done_data}\n\n"

        except GeneratorExit:
            # Client disconnected mid-stream — save what we have
            if full_response:
                try:
                    async with async_session() as save_db:
                        msg = Message(
                            id=str(uuid.uuid4()),
                            project_id=request.project_id,
                            session_id=request.session_id,
                            role="assistant",
                            content="".join(full_response) + "\n\n[Response interrupted]",
                        )
                        save_db.add(msg)
                        await save_db.commit()
                except Exception:
                    pass
        except Exception as e:
            error_data = json.dumps({"type": "error", "message": str(e)})
            yield f"data: {error_data}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/chat/history/{project_id}")
async def get_chat_history(
    project_id: str,
    session_id: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> list[ChatMessage]:
    """Get chat history for a project, optionally scoped to a session."""
    query = select(Message).where(Message.project_id == project_id)
    if session_id:
        query = query.where(Message.session_id == session_id)
    result = await db.execute(query.order_by(Message.created_at.asc()).limit(limit))
    messages = result.scalars().all()

    return [
        ChatMessage(
            id=msg.id,
            role=msg.role,
            content=msg.content,
            created_at=msg.created_at,
        )
        for msg in messages
    ]
