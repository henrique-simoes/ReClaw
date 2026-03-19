"""Async Ollama client for model management and inference."""

import json
from typing import AsyncGenerator

import httpx

from app.config import settings


class OllamaClient:
    """Async client for the Ollama API."""

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or settings.ollama_host).rstrip("/")
        self._client: httpx.AsyncClient | None = None

    @staticmethod
    def _sanitize_messages(messages: list[dict]) -> list[dict]:
        """Sanitize messages for the Ollama/LM Studio API.

        Filters invalid messages, merges consecutive system messages,
        and ensures all fields are properly formatted.
        """
        sanitized = []
        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content")
            if role not in ("system", "user", "assistant"):
                continue
            if content is None or (isinstance(content, str) and not content.strip()):
                continue
            sanitized.append({"role": role, "content": str(content)})

        # Merge consecutive system messages to avoid duplicates
        merged: list[dict] = []
        for msg in sanitized:
            if merged and msg["role"] == "system" and merged[-1]["role"] == "system":
                merged[-1]["content"] += "\n\n" + msg["content"]
            else:
                merged.append(msg)
        return merged

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(base_url=self.base_url, timeout=300.0)
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def health(self) -> bool:
        """Check if Ollama is reachable."""
        try:
            client = await self._get_client()
            resp = await client.get("/api/tags")
            return resp.status_code == 200
        except httpx.RequestError:
            return False

    async def list_models(self) -> list[dict]:
        """List all locally available models."""
        client = await self._get_client()
        resp = await client.get("/api/tags")
        resp.raise_for_status()
        data = resp.json()
        return data.get("models", [])

    async def pull_model(self, model_name: str) -> AsyncGenerator[dict, None]:
        """Pull a model, yielding progress updates."""
        client = await self._get_client()
        async with client.stream(
            "POST",
            "/api/pull",
            json={"name": model_name},
            timeout=None,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.strip():
                    yield json.loads(line)

    async def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> dict:
        """Non-streaming chat completion."""
        msgs = list(messages)
        if system:
            msgs = [{"role": "system", "content": system}, *msgs]
        msgs = self._sanitize_messages(msgs)

        options: dict = {"temperature": temperature}
        if max_tokens:
            options["num_predict"] = max_tokens

        payload: dict = {
            "model": model or settings.ollama_model,
            "messages": msgs,
            "stream": False,
            "options": options,
        }

        client = await self._get_client()
        resp = await client.post("/api/chat", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def chat_stream(
        self,
        messages: list[dict],
        model: str | None = None,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[str, None]:
        """Streaming chat completion — yields content chunks."""
        msgs = list(messages)
        if system:
            msgs = [{"role": "system", "content": system}, *msgs]
        msgs = self._sanitize_messages(msgs)

        options: dict = {"temperature": temperature}
        if max_tokens:
            options["num_predict"] = max_tokens

        payload: dict = {
            "model": model or settings.ollama_model,
            "messages": msgs,
            "stream": True,
            "options": options,
        }

        client = await self._get_client()
        async with client.stream("POST", "/api/chat", json=payload, timeout=None) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.strip():
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done", False):
                        return

    async def embed(self, text: str, model: str | None = None) -> list[float]:
        """Generate embedding for a single text."""
        client = await self._get_client()
        resp = await client.post(
            "/api/embed",
            json={
                "model": model or settings.ollama_embed_model,
                "input": text,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        embeddings = data.get("embeddings", [])
        if embeddings:
            return embeddings[0]
        return []

    async def embed_batch(self, texts: list[str], model: str | None = None) -> list[list[float]]:
        """Generate embeddings for multiple texts."""
        client = await self._get_client()
        resp = await client.post(
            "/api/embed",
            json={
                "model": model or settings.ollama_embed_model,
                "input": texts,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("embeddings", [])

    async def ensure_model(self, model_name: str) -> bool:
        """Ensure a model is available locally, pull if not."""
        models = await self.list_models()
        model_names = [m.get("name", "") for m in models]

        # Check if already present (exact match or tag match)
        for name in model_names:
            if name == model_name or name.startswith(model_name.split(":")[0]):
                return True

        # Pull the model
        async for _progress in self.pull_model(model_name):
            pass  # Could broadcast progress via WebSocket
        return True


def _create_llm_client():
    """Create the LLM client based on config."""
    if settings.llm_provider == "lmstudio":
        from app.core.lmstudio import LMStudioClient
        return LMStudioClient()
    return OllamaClient()


async def auto_detect_provider() -> None:
    """Auto-detect and switch to whichever LLM provider is reachable.

    Tries the configured provider first, then falls back to the other.
    Updates settings.llm_provider and recreates the global client singleton.
    """
    import app.core.ollama as self_module
    from app.core.lmstudio import LMStudioClient

    # Try configured provider first
    if await self_module.ollama.health():
        return  # Already working

    # Try the other provider
    if settings.llm_provider == "lmstudio":
        fallback = OllamaClient()
        fallback_name = "ollama"
    else:
        fallback = LMStudioClient()
        fallback_name = "lmstudio"

    if await fallback.health():
        settings.llm_provider = fallback_name
        self_module.ollama = fallback
        # Persist the auto-detected provider so it survives restarts
        try:
            from app.api.routes.settings import _persist_env
            _persist_env("LLM_PROVIDER", fallback_name)
        except Exception:
            pass
        print(f"Auto-detected LLM provider: {fallback_name}")
    else:
        await fallback.close()


# Singleton instance — provider chosen by LLM_PROVIDER env var
ollama = _create_llm_client()
