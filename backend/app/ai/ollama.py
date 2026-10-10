"""Ollama provider: a model running locally (e.g. `ollama run llama3.1:8b`), called over its HTTP API.

Uses Ollama's native /api/chat with JSON mode (`format: "json"`), which makes small local models far
more likely to return parseable JSON. The output still goes through the same validation and re-asking
as every other provider (app.ai.runner), so a bad reply is never stored.
"""

import httpx

from app.ai.base import LLMRequest, ProviderError


class OllamaProvider:
    name = "ollama"

    def __init__(
        self,
        model: str,
        base_url: str = "http://localhost:11434",
        num_ctx: int = 8192,
        timeout: float = 300.0,
        client: httpx.Client | None = None,
    ):
        self.model = model
        self.num_ctx = num_ctx
        self._base = base_url.rstrip("/")
        self._url = self._base + "/api/chat"
        self._client = client or httpx.Client(timeout=timeout)

    def complete(self, request: LLMRequest) -> str:
        body = {
            "model": self.model,
            "stream": False,
            "format": "json",
            "keep_alive": "10m",  # keep the model in memory between the several calls an upload makes
            "options": {
                "num_ctx": self.num_ctx,  # Ollama's default window is small and silently truncates prompts
                "num_predict": request.max_tokens,
                "temperature": 0.2,
            },
            "messages": [
                {"role": "system", "content": request.system},
                {"role": "user", "content": request.prompt},
            ],
        }
        try:
            resp = self._client.post(self._url, json=body)
        except httpx.TimeoutException as exc:
            # A local model that timed out will very likely time out again; fail fast instead of retrying.
            raise ProviderError(
                f"Ollama ({self.model}) did not answer in time. Raise AI_TIMEOUT_SECONDS or use a smaller model: {exc}",
                retryable=False,
            ) from exc
        except httpx.TransportError as exc:
            raise ProviderError(
                f"Ollama is not reachable at {self._base}. Start it (open the Ollama app or run `ollama serve`): {exc}",
                retryable=True,
            ) from exc

        if resp.status_code == 404:
            raise ProviderError(
                f"Ollama has no model {self.model!r}. Run `ollama pull {self.model}` first. ({_error_message(resp)})",
                retryable=False,
            )
        if resp.status_code >= 500:
            raise ProviderError(f"Ollama returned HTTP {resp.status_code}: {_error_message(resp)}", retryable=True)
        if resp.status_code >= 400:
            raise ProviderError(f"Ollama returned HTTP {resp.status_code}: {_error_message(resp)}", retryable=False)

        try:
            data = resp.json()
        except ValueError as exc:
            raise ProviderError("Ollama returned a non-JSON response", retryable=True) from exc
        text = (data.get("message") or {}).get("content", "")
        if not text.strip():
            raise ProviderError("Ollama returned an empty reply", retryable=True)
        return text


def _error_message(resp: httpx.Response) -> str:
    try:
        return str(resp.json()["error"])
    except Exception:
        return resp.text[:200]
