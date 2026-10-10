"""Ollama provider: a model running locally (e.g. `ollama run llama3.1:8b`), called over its HTTP API.

Uses Ollama's native /api/chat with JSON mode (`format: "json"`), which makes small local models far
more likely to return parseable JSON. The output still goes through the same validation and re-asking
as every other provider (app.ai.runner), so a bad reply is never stored.

Local models are slow, so two things keep long generations from "timing out" while they are working:
- The reply is streamed. The read timeout only fires if Ollama goes silent, not because a long answer
  is still being written.
- Requests are sent one at a time. Ollama typically runs one generation at a time, and a request
  waiting in its queue receives no bytes, so concurrent calls (an upload asks for a summary and a
  concept map together) would otherwise time out while queued. Waiting for our lock doesn't count.

Stop: when the request's cancel event is set, the stream is closed. Ollama stops generating as soon
as its client disconnects, so the model is free for the next request right away.
"""

import json
import threading

import httpx

from app.ai.base import LLMRequest, ProviderCancelled, ProviderError


class OllamaProvider:
    name = "ollama"

    def __init__(
        self,
        model: str,
        base_url: str = "http://localhost:11434",
        num_ctx: int = 8192,
        num_predict: int = 2048,
        timeout: float = 600.0,
        client: httpx.Client | None = None,
    ):
        self.model = model
        self.num_ctx = num_ctx
        self.num_predict = num_predict
        self.timeout = timeout
        self._base = base_url.rstrip("/")
        self._url = self._base + "/api/chat"
        # connect quickly (is Ollama running?), but allow a long silence while it loads the model
        # and reads the prompt before the first token.
        self._client = client or httpx.Client(timeout=httpx.Timeout(timeout, connect=10.0))
        self._lock = threading.Lock()

    def complete(self, request: LLMRequest) -> str:
        body = {
            "model": self.model,
            "stream": True,
            "format": "json",
            "keep_alive": "10m",  # keep the model in memory between the several calls an upload makes
            "options": {
                "num_ctx": self.num_ctx,  # Ollama's default window is small and silently truncates prompts
                "num_predict": min(request.max_tokens, self.num_predict),
                "temperature": 0.2,
            },
            "messages": [
                {"role": "system", "content": request.system},
                {"role": "user", "content": request.prompt},
            ],
        }
        cancel = request.cancel or threading.Event()
        with self._lock:
            if cancel.is_set():
                raise ProviderCancelled()
            return self._stream(body, cancel)

    def _stream(self, body: dict, cancel: threading.Event) -> str:
        parts: list[str] = []
        finished = threading.Event()
        try:
            with self._client.stream("POST", self._url, json=body) as resp:
                # Ollama can think for a long time before its first token; a watcher closes the
                # connection on Stop even while we're blocked waiting for it.
                threading.Thread(target=_close_on_cancel, args=(resp, cancel, finished), daemon=True).start()
                if resp.status_code >= 400:
                    resp.read()
                    self._raise_for_status(resp)
                for line in resp.iter_lines():
                    if cancel.is_set():
                        raise ProviderCancelled()
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                    except ValueError as exc:
                        raise ProviderError("Ollama returned a non-JSON stream line", retryable=True) from exc
                    if chunk.get("error"):
                        raise ProviderError(f"Ollama error: {chunk['error']}", retryable=True)
                    parts.append((chunk.get("message") or {}).get("content", ""))
                    if chunk.get("done"):
                        break
        except ProviderCancelled:
            raise
        except Exception as exc:
            if cancel.is_set():
                raise ProviderCancelled() from exc
            translated = self._translate(exc)
            if translated is None:
                raise
            raise translated from exc
        finally:
            finished.set()
        if cancel.is_set():
            raise ProviderCancelled()

        text = "".join(parts)
        if not text.strip():
            raise ProviderError("Ollama returned an empty reply", retryable=True)
        return text

    def _translate(self, exc: Exception) -> ProviderError | None:
        if isinstance(exc, httpx.TimeoutException):
            # A local model that went silent this long will very likely do it again; fail fast.
            return ProviderError(
                f"Ollama ({self.model}) went silent for {self.timeout:.0f}s. Raise OLLAMA_TIMEOUT_SECONDS, "
                f"lower OLLAMA_MAX_CONTEXT_CHARS, or use a smaller model: {exc}",
                retryable=False,
            )
        if isinstance(exc, httpx.TransportError):
            return ProviderError(
                f"Ollama is not reachable at {self._base}. Start it (open the Ollama app or run `ollama serve`): {exc}",
                retryable=True,
            )
        return None

    def _raise_for_status(self, resp: httpx.Response) -> None:
        if resp.status_code == 404:
            raise ProviderError(
                f"Ollama has no model {self.model!r}. Run `ollama pull {self.model}` first. ({_error_message(resp)})",
                retryable=False,
            )
        retryable = resp.status_code >= 500
        raise ProviderError(f"Ollama returned HTTP {resp.status_code}: {_error_message(resp)}", retryable=retryable)


def _close_on_cancel(resp: httpx.Response, cancel: threading.Event, finished: threading.Event) -> None:
    while not finished.is_set():
        if cancel.wait(0.2):
            resp.close()
            return


def _error_message(resp: httpx.Response) -> str:
    try:
        return str(resp.json()["error"])
    except Exception:
        return resp.text[:200]
