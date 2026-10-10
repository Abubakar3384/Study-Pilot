"""Ollama provider (local models), exercised against a fake HTTP server: no real Ollama needed."""

import json

import httpx
import pytest

from app.ai.base import LLMRequest, ProviderError, Task
from app.ai.factory import build_provider
from app.ai.ollama import OllamaProvider
from app.ai.runner import AIRunner
from app.ai.schemas import SummaryOutput
from app.config import Settings
from app.errors import AIUnavailableError


def request() -> LLMRequest:
    return LLMRequest(Task.SUMMARY, "system rules", "summarise this", {}, max_tokens=1000)


def provider_with(handler, **kw) -> OllamaProvider:
    return OllamaProvider("llama3.1:8b", client=httpx.Client(transport=httpx.MockTransport(handler)), **kw)


def chat_reply(content: str) -> httpx.Response:
    return httpx.Response(200, json={"model": "llama3.1:8b", "message": {"role": "assistant", "content": content}, "done": True})


def test_sends_json_mode_context_window_and_system_prompt():
    seen = {}

    def handler(req: httpx.Request):
        seen["url"] = str(req.url)
        seen["body"] = json.loads(req.content)
        return chat_reply('{"ok": true}')

    assert provider_with(handler, num_ctx=16384).complete(request()) == '{"ok": true}'
    body = seen["body"]
    assert seen["url"] == "http://localhost:11434/api/chat"
    assert body["model"] == "llama3.1:8b" and body["stream"] is False and body["format"] == "json"
    assert body["options"]["num_ctx"] == 16384 and body["options"]["num_predict"] == 1000
    assert body["messages"][0] == {"role": "system", "content": "system rules"}
    assert body["messages"][1]["content"] == "summarise this"


def test_not_running_is_retryable_with_a_clear_message():
    def handler(req):
        raise httpx.ConnectError("connection refused")

    with pytest.raises(ProviderError) as e:
        provider_with(handler).complete(request())
    assert e.value.retryable and "ollama serve" in str(e.value)


def test_missing_model_tells_you_to_pull_it():
    p = provider_with(lambda r: httpx.Response(404, json={"error": "model 'llama3.1:8b' not found"}))
    with pytest.raises(ProviderError) as e:
        p.complete(request())
    assert not e.value.retryable and "ollama pull llama3.1:8b" in str(e.value)


def test_timeout_fails_fast_instead_of_retrying():
    def handler(req):
        raise httpx.ReadTimeout("slow")

    with pytest.raises(ProviderError) as e:
        provider_with(handler).complete(request())
    assert not e.value.retryable and "AI_TIMEOUT_SECONDS" in str(e.value)


def test_empty_reply_and_server_errors_are_retryable():
    with pytest.raises(ProviderError) as e:
        provider_with(lambda r: chat_reply("  ")).complete(request())
    assert e.value.retryable
    with pytest.raises(ProviderError) as e:
        provider_with(lambda r: httpx.Response(500, json={"error": "out of memory"})).complete(request())
    assert e.value.retryable and "out of memory" in str(e.value)


def test_invalid_json_from_the_model_is_reasked_then_accepted():
    replies = iter(["not json at all", '{"overview": "Cells.", "key_points": [{"text": "Cells", "page_number": 1}]}'])
    p = provider_with(lambda r: chat_reply(next(replies)))
    out = AIRunner(p, max_attempts=3, backoff_seconds=0).generate(request(), SummaryOutput, {1})
    assert out.overview == "Cells."


def test_runner_reports_unreachable_ollama_as_ai_unavailable():
    def handler(req):
        raise httpx.ConnectError("refused")

    with pytest.raises(AIUnavailableError):
        AIRunner(provider_with(handler), max_attempts=2, backoff_seconds=0).generate(request(), SummaryOutput, {1})


def test_factory_and_context_budget(tmp_path):
    s = Settings(_env_file=None, ai_provider="ollama", database_url=f"sqlite:///{tmp_path.as_posix()}/x.db")
    p = build_provider(s)
    assert isinstance(p, OllamaProvider) and p.model == "llama3.1:8b" and p.num_ctx == 8192
    # Prompt + reply must fit in num_ctx; the document budget shrinks accordingly...
    assert s.context_chars == int((8192 - 4096 - 800) * 3.5)
    # ...grows with a bigger window, and other providers keep the configured budget.
    assert Settings(_env_file=None, ai_provider="ollama", ollama_num_ctx=32768).context_chars == 60_000
    assert Settings(_env_file=None, ai_provider="mock").context_chars == 60_000


def test_health_reports_provider_and_model(make_client):
    p = provider_with(lambda r: chat_reply("{}"))
    client = make_client(provider=p)
    assert client.get("/api/health").json() == {"status": "ok", "ai_provider": "ollama", "ai_model": "llama3.1:8b"}
