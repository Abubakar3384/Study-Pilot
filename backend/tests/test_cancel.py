"""Stopping a generation: the runner gives up without retrying, and Ollama's stream is closed."""

import json
import threading

import httpx
import pytest

from app.ai.base import LLMRequest, ProviderCancelled, Task
from app.ai.ollama import OllamaProvider
from app.ai.runner import AIRunner
from app.ai.schemas import SummaryOutput
from app.errors import AICancelledError


def request() -> LLMRequest:
    return LLMRequest(Task.SUMMARY, "system rules", "summarise this", {}, max_tokens=1000)


class BlockingProvider:
    """Waits until the request is cancelled, like a slow model would."""

    name = "blocking"

    def __init__(self):
        self.calls = 0
        self.started = threading.Event()

    def complete(self, request: LLMRequest) -> str:
        self.calls += 1
        self.started.set()
        assert request.cancel is not None
        request.cancel.wait(5)
        raise ProviderCancelled()


def test_cancel_stops_the_generation_without_retrying():
    provider = BlockingProvider()
    runner = AIRunner(provider, max_attempts=3, sleep=lambda _s: None)
    errors: list[Exception] = []

    def work():
        try:
            runner.generate(request(), SummaryOutput, [1])
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    t = threading.Thread(target=work)
    t.start()
    assert provider.started.wait(5)
    assert runner.cancel() == 1
    t.join(5)
    assert isinstance(errors[0], AICancelledError)
    assert provider.calls == 1
    assert runner.cancel() == 0  # nothing left running


def test_ollama_closes_the_stream_when_cancelled():
    cancel = threading.Event()
    sent: list[int] = []

    def lines():
        for i in range(50):
            sent.append(i)
            if i == 2:
                cancel.set()  # the student presses Stop while tokens are arriving
            yield (json.dumps({"message": {"content": "x"}, "done": False}) + "\n").encode()

    provider = OllamaProvider(
        "llama3.1:8b",
        client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=lines()))),
    )
    with pytest.raises(ProviderCancelled):
        provider.complete(LLMRequest(Task.SUMMARY, "s", "p", {}, cancel=cancel))
    assert len(sent) < 50


def test_ollama_does_not_start_a_cancelled_request():
    called = []
    provider = OllamaProvider(
        "llama3.1:8b",
        client=httpx.Client(transport=httpx.MockTransport(lambda r: called.append(r) or httpx.Response(200))),
    )
    cancel = threading.Event()
    cancel.set()
    with pytest.raises(ProviderCancelled):
        provider.complete(LLMRequest(Task.SUMMARY, "s", "p", {}, cancel=cancel))
    assert called == []


def test_cancel_route(make_client):
    assert make_client().post("/api/ai/cancel").status_code == 204
