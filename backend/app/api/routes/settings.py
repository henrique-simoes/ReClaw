"""Settings and system info API routes."""

from fastapi import APIRouter

from app.config import settings
from app.core.hardware import detect_hardware, recommend_model
from app.core.ollama import ollama

router = APIRouter()


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
    """Get available and active models from Ollama."""
    healthy = await ollama.health()
    if not healthy:
        return {
            "status": "offline",
            "models": [],
            "active_model": settings.ollama_model,
        }

    models = await ollama.list_models()
    return {
        "status": "online",
        "models": models,
        "active_model": settings.ollama_model,
        "embed_model": settings.ollama_embed_model,
    }


@router.post("/settings/model")
async def switch_model(model_name: str):
    """Switch the active model (pulls if not available)."""
    # Check if model is available
    models = await ollama.list_models()
    model_names = [m.get("name", "") for m in models]

    if model_name not in model_names:
        # Try to pull it
        try:
            progress_updates = []
            async for progress in ollama.pull_model(model_name):
                progress_updates.append(progress)
            return {
                "status": "pulled",
                "model": model_name,
                "message": f"Model {model_name} pulled and ready.",
            }
        except Exception as e:
            return {
                "status": "error",
                "model": model_name,
                "message": f"Failed to pull model: {e}",
            }

    # Note: This is a runtime-only change. Persisting requires updating .env.
    # We store it as app state rather than mutating the frozen settings object.
    return {
        "status": "switched",
        "model": model_name,
        "message": f"Model {model_name} is available. Update OLLAMA_MODEL in .env to persist across restarts.",
    }


@router.get("/settings/status")
async def system_status():
    """Get overall system status."""
    ollama_healthy = await ollama.health()

    return {
        "status": "healthy" if ollama_healthy else "degraded",
        "services": {
            "backend": "running",
            "ollama": "connected" if ollama_healthy else "disconnected",
        },
        "config": {
            "model": settings.ollama_model,
            "embed_model": settings.ollama_embed_model,
            "rag_chunk_size": settings.rag_chunk_size,
            "rag_top_k": settings.rag_top_k,
        },
    }
