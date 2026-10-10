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
    """A streamed /api/chat reply: NDJSON lines with partial content, then a final done line."""
    half = len(content) // 2
    lines = [
        {"model": "llama3.1:8b", "message": {"role": "assistant", "content": content[:half]}, "done": False},
        {"model": "llama3.1:8b", "message": {"role": "assistant", "content": content[half:]}, "done": False},
        {"model": "llama3.1:8b", "message": {"role": "assistant", "content": ""}, "done": True},
    ]
    return httpx.Response(200, content="\n".join(json.dumps(x) for x in lines).encode())


def test_sends_json_mode_context_window_and_system_prompt():
    seen = {}

    def handler(req: httpx.Request):
        seen["url"] = str(req.url)
        seen["body"] = json.loads(req.content)
        return chat_reply('{"ok": true}')

    assert provider_with(handler, num_ctx=16384).complete(request()) == '{"ok": true}'
    body = seen["body"]
    assert seen["url"] == "http://localhost:11434/api/chat"
    assert body["model"] == "llama3.1:8b" and body["stream"] is True and body["format"] == "json"
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
    assert not e.value.retryable and "OLLAMA_TIMEOUT_SECONDS" in str(e.value)


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
    router = build_provider(s)
    p = router.default
    assert isinstance(p, OllamaProvider) and p.model == "llama3.1:8b" and p.num_ctx == 8192
    assert p.num_predict == 2048 and p.timeout == 600
    # Local models get a small document budget by default...
    assert s.context_chars == 8_000
    # ...which never exceeds what fits in the window next to the reply...
    tight = Settings(_env_file=None, ai_provider="ollama", ollama_num_ctx=4096, ollama_max_context_chars=20_000)
    assert tight.context_chars == int((4096 - 2048 - 800) * 3.5)
    # ...and other providers keep the configured budget.
    assert Settings(_env_file=None, ai_provider="mock").context_chars == 60_000


def test_requests_are_sent_one_at_a_time():
    import threading
    import time

    active = {"now": 0, "max": 0}
    guard = threading.Lock()

    def handler(req):
        with guard:
            active["now"] += 1
            active["max"] = max(active["max"], active["now"])
        time.sleep(0.05)
        with guard:
            active["now"] -= 1
        return chat_reply('{"ok": true}')

    p = provider_with(handler)
    threads = [threading.Thread(target=p.complete, args=(request(),)) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert active["max"] == 1


def test_error_inside_the_stream_is_reported():
    line = json.dumps({"error": "model ran out of memory"}).encode()
    with pytest.raises(ProviderError) as e:
        provider_with(lambda r: httpx.Response(200, content=line)).complete(request())
    assert "out of memory" in str(e.value)


def test_health_reports_provider_and_model(make_client):
    p = provider_with(lambda r: chat_reply("{}"))
    client = make_client(provider=p)
    assert client.get("/api/health").json() == {"status": "ok", "ai_provider": "ollama", "ai_model": "llama3.1:8b"}


# ------------------------------------------------- concept maps from the mock, the rest from Ollama

def test_ollama_routes_concept_maps_to_the_mock_by_default(tmp_path):
    from app.ai.mock import MockProvider
    from app.ai.router import TaskRouter

    s = Settings(_env_file=None, ai_provider="ollama")
    router = build_provider(s)
    assert isinstance(router, TaskRouter)
    assert isinstance(router.provider_for(Task.CONCEPTS), MockProvider)
    assert isinstance(router.provider_for(Task.NOTES), OllamaProvider)
    assert isinstance(router.provider_for(Task.QUIZ), OllamaProvider)
    # The mock is free and instant, so the concept map may read the whole document budget.
    assert s.concepts_context_chars == s.ai_max_context_chars > s.context_chars
    # "main" keeps concept maps on Ollama; the mock provider never routes.
    assert isinstance(build_provider(Settings(_env_file=None, ai_provider="ollama", ai_concepts_provider="main")), OllamaProvider)
    assert isinstance(build_provider(Settings(_env_file=None, ai_provider="mock")), MockProvider)


def test_routed_app_uses_ollama_for_notes_and_mock_for_the_map(make_client, sample_pdf):
    from app.ai.mock import MockProvider
    from app.ai.router import TaskRouter
    from tests.conftest import upload

    tasks = []

    def handler(req):
        tasks.append(json.loads(req.content)["messages"][1]["content"][:40])
        notes = {"title": "Cells", "sections": [{"heading": "Mitochondria", "paragraphs": ["**Mitochondria** make ATP."], "page_number": 3}]}
        return chat_reply(json.dumps(notes))

    client = make_client(provider=TaskRouter(provider_with(handler), {Task.CONCEPTS: MockProvider()}))
    doc = upload(client, sample_pdf).json()

    concepts = client.post(f"/api/documents/{doc['id']}/concepts").json()
    assert concepts["generator"] == "mock" and tasks == []  # Ollama was not called for the map

    notes = client.post(f"/api/documents/{doc['id']}/notes").json()
    assert notes["sections"][0]["paragraphs"] == ["**Mitochondria** make ATP."]
    assert len(tasks) == 1  # ...but was for the notes

    health = client.get("/api/health").json()
    assert health["ai_provider"] == "ollama" and health["concepts_provider"] == "mock"
