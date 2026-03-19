"""Settings and system info API routes."""

import logging
from pathlib import Path

from fastapi import APIRouter

from app.config import settings
from app.core.hardware import detect_hardware, recommend_model
from app.core.ollama import ollama

router = APIRouter()
logger = logging.getLogger(__name__)


def _persist_env(key: str, value: str) -> None:
    """Update a key in the .env file so the setting survives restarts.

    Creates the key if it doesn't exist, updates it in-place if it does.
    """
    env_path = Path(".env")
    if not env_path.exists():
        env_path.write_text(f"{key}={value}\n")
        return

    lines = env_path.read_text().splitlines(keepends=True)
    found = False
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(f"{key}=") or stripped.startswith(f"{key} ="):
            new_lines.append(f"{key}={value}\n")
            found = True
        else:
            new_lines.append(line)
    if not found:
        # Ensure trailing newline before appending
        if new_lines and not new_lines[-1].endswith("\n"):
            new_lines[-1] += "\n"
        new_lines.append(f"{key}={value}\n")
    env_path.write_text("".join(new_lines))


def _active_model() -> str:
    if settings.llm_provider == "lmstudio":
        return settings.lmstudio_model
    return settings.ollama_model


def _embed_model() -> str:
    if settings.llm_provider == "lmstudio":
        return settings.lmstudio_embed_model
    return settings.ollama_embed_model


@router.get("/settings/hardware")
async def get_hardware_info():
    """Get hardware detection results and model recommendation."""
    try:
        profile = detect_hardware()
        recommendation = recommend_model(profile)

        return {
            "hardware": {
                "total_ram_gb": profile.total_ram_gb,
                "available_ram_gb": profile.available_ram_gb,
                "reclaw_ram_budget_gb": profile.reclaw_ram_budget_gb,
                "cpu_cores": profile.cpu_cores,
                "cpu_arch": profile.cpu_arch,
                "reclaw_cpu_budget_cores": profile.reclaw_cpu_budget_cores,
                "gpu": {
                    "vendor": profile.gpu.vendor,
                    "name": profile.gpu.name,
                    "vram_mb": profile.gpu.vram_mb,
                } if profile.gpu else None,
                "os": f"{profile.os_name} {profile.os_version}",
            },
            "recommendation": {
                "model_name": recommendation.model_name,
                "quantization": recommendation.quantization,
                "context_length": recommendation.context_length,
                "gpu_layers": recommendation.gpu_layers,
                "reason": recommendation.reason,
            },
        }
    except Exception as e:
        return {
            "hardware": None,
            "recommendation": None,
            "error": f"Hardware detection failed: {e}",
        }


@router.get("/settings/models")
async def get_models():
    """Get available and active models.

    For LM Studio, probes the actually loaded model via a minimal chat request
    since /v1/models returns all downloaded (not just loaded) models.
    """
    healthy = await ollama.health()
    if not healthy:
        return {
            "status": "offline",
            "models": [],
            "active_model": _active_model(),
        }

    models = await ollama.list_models()
    active = _active_model()

    # For LM Studio, detect the actually loaded model
    if settings.llm_provider == "lmstudio":
        from app.core.lmstudio import LMStudioClient
        if isinstance(ollama, LMStudioClient):
            loaded = await ollama.detect_loaded_model()
            if loaded and loaded != active:
                settings.lmstudio_model = loaded
                active = loaded
                # Persist so config stays in sync
                try:
                    _persist_env("LMSTUDIO_MODEL", loaded)
                except Exception:
                    pass

    return {
        "status": "online",
        "models": models,
        "active_model": active,
        "embed_model": _embed_model(),
    }


@router.post("/settings/model")
async def switch_model(model_name: str):
    """Switch the active model at runtime (pulls if using Ollama and not available)."""
    models = await ollama.list_models()
    model_names = [m.get("name", "") for m in models]

    if model_name not in model_names and settings.llm_provider == "ollama":
        try:
            async for _progress in ollama.pull_model(model_name):
                pass
        except Exception as e:
            return {
                "status": "error",
                "model": model_name,
                "message": f"Failed to pull model: {e}",
            }

    # Update runtime settings so all subsequent LLM calls use the new model
    if settings.llm_provider == "lmstudio":
        settings.lmstudio_model = model_name
        env_var = "LMSTUDIO_MODEL"
    else:
        settings.ollama_model = model_name
        env_var = "OLLAMA_MODEL"

    # Persist to .env so the choice survives server restarts
    try:
        _persist_env(env_var, model_name)
        logger.info(f"Persisted {env_var}={model_name} to .env")
        persisted = True
    except Exception as e:
        logger.warning(f"Could not persist model to .env: {e}")
        persisted = False

    return {
        "status": "switched",
        "model": model_name,
        "persisted": persisted,
        "message": f"Model switched to {model_name}." + ("" if persisted else f" Update {env_var} in .env to persist."),
    }


@router.post("/settings/provider")
async def switch_provider(provider: str):
    """Switch the LLM provider at runtime (ollama or lmstudio)."""
    from fastapi import HTTPException
    if provider not in ("ollama", "lmstudio"):
        raise HTTPException(status_code=400, detail="Provider must be 'ollama' or 'lmstudio'")

    settings.llm_provider = provider

    # Recreate the LLM client singleton for the new provider
    import app.core.ollama as ollama_module
    ollama_module.ollama = ollama_module._create_llm_client()

    # Persist to .env
    try:
        _persist_env("LLM_PROVIDER", provider)
        persisted = True
    except Exception:
        persisted = False

    return {
        "status": "switched",
        "provider": provider,
        "model": _active_model(),
        "persisted": persisted,
        "message": f"Provider switched to {provider}." + ("" if persisted else " Update LLM_PROVIDER in .env to persist."),
    }


@router.get("/settings/vector-health")
async def vector_health():
    """Check embedding dimension consistency across vector stores."""
    from app.core.vector_health import check_embedding_dimensions
    return await check_embedding_dimensions()


@router.get("/settings/status")
async def system_status():
    """Get overall system status.

    Auto-detects provider if the current one is unreachable.
    """
    from app.core.ollama import auto_detect_provider
    import app.core.ollama as ollama_mod

    llm_healthy = await ollama.health()

    # If current provider is down, try auto-detecting the other
    if not llm_healthy:
        await auto_detect_provider()
        llm_healthy = await ollama_mod.ollama.health()

    active = _active_model()

    # For LM Studio, detect the actually loaded model (not just config)
    if llm_healthy and settings.llm_provider == "lmstudio":
        import app.core.ollama as ollama_mod
        from app.core.lmstudio import LMStudioClient
        client = ollama_mod.ollama
        if isinstance(client, LMStudioClient):
            loaded = await client.detect_loaded_model()
            if loaded and loaded != active:
                settings.lmstudio_model = loaded
                active = loaded
                try:
                    _persist_env("LMSTUDIO_MODEL", loaded)
                except Exception:
                    pass

    return {
        "status": "healthy" if llm_healthy else "degraded",
        "provider": settings.llm_provider,
        "services": {
            "backend": "running",
            "llm": "connected" if llm_healthy else "disconnected",
        },
        "config": {
            "model": active,
            "embed_model": _embed_model(),
            "rag_chunk_size": settings.rag_chunk_size,
            "rag_top_k": settings.rag_top_k,
        },
    }
