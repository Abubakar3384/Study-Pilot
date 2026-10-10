"""Model-output validation, retry behaviour and provider failure handling."""

import httpx
import pytest
from pydantic import ValidationError

from app.ai.anthropic import AnthropicProvider
from app.ai.base import LLMRequest, ProviderError, Task
from app.ai.mock import MockProvider
from app.ai.runner import AIRunner, extract_json
from app.ai.schemas import ChatOutput, QuizOutput, SummaryOutput
from app.errors import AINotConfiguredError, AIOutputError, AIUnavailableError

PAGES = [
    {"page_number": 1, "text": "Photosynthesis happens in chloroplasts. Light is absorbed by chlorophyll."},
    {"page_number": 3, "text": "Mitochondria produce ATP. They have their own DNA."},
]


def summary_request() -> LLMRequest:
    return LLMRequest(Task.SUMMARY, "sys", "prompt", {"pages": PAGES})


def runner(provider, attempts=3) -> AIRunner:
    sleeps: list[float] = []
    r = AIRunner(provider, max_attempts=attempts, backoff_seconds=0.5, sleep=sleeps.append)
    r.sleeps = sleeps  # type: ignore[attr-defined]
    return r


# ------------------------------------------------------------- JSON + schema

def test_extract_json_handles_fences_and_chatter():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Here you go: {"a": {"b": 2}} hope it helps') == {"a": {"b": 2}}
    with pytest.raises(ValueError):
        extract_json("no json here")


def _question(**overrides):
    q = {"question": "Q?", "options": ["a", "b", "c", "d"], "correct_index": 1,
         "explanation": "because", "page_number": 1}
    return q | overrides


@pytest.mark.parametrize(
    "bad",
    [
        _question(options=["a", "b", "c"]),            # too few options
        _question(options=["a", "A", "c", "d"]),       # duplicate options
        _question(correct_index=4),                    # answer out of range
        _question(explanation="   "),                  # empty explanation
        _question(page_number=0),                      # pages are 1-based
    ],
)
def test_quiz_schema_rejects_bad_questions(bad):
    with pytest.raises(ValidationError):
        QuizOutput.model_validate({"title": "t", "questions": [bad]})


def test_quiz_schema_accepts_valid_question():
    out = QuizOutput.model_validate({"title": " t ", "questions": [_question()]})
    assert out.title == "t" and out.cited_pages() == {1}


def test_summary_requires_key_points():
    with pytest.raises(ValidationError):
        SummaryOutput.model_validate({"overview": "x", "key_points": []})


def test_chat_answerable_requires_citation_and_unanswerable_drops_them():
    with pytest.raises(ValidationError):
        ChatOutput.model_validate({"answer": "x", "answerable": True, "cited_pages": []})
    out = ChatOutput.model_validate({"answer": "x", "answerable": False, "cited_pages": [2]})
    assert out.cited_pages() == set()


# ------------------------------------------------------------------- runner

def test_runner_returns_validated_output():
    out = runner(MockProvider()).generate(summary_request(), SummaryOutput, {1, 3})
    assert out.cited_pages() <= {1, 3}


def test_runner_rejects_pages_not_supplied_and_retries_with_feedback():
    provider = MockProvider(mode="bad_page")
    with pytest.raises(AIOutputError, match="9999"):
        runner(provider).generate(summary_request(), SummaryOutput, {1, 3})
    assert provider.calls == 3
    assert "rejected because" in provider.requests[-1].prompt


@pytest.mark.parametrize("mode", ["invalid_json", "schema_invalid"])
def test_runner_gives_up_on_persistently_invalid_output(mode):
    provider = MockProvider(mode=mode)
    with pytest.raises(AIOutputError):
        runner(provider).generate(summary_request(), SummaryOutput, {1, 3})
    assert provider.calls == 3


def test_runner_recovers_from_transient_invalid_output():
    provider = MockProvider(mode="flaky_invalid", fail_times=2)
    out = runner(provider).generate(summary_request(), SummaryOutput, {1, 3})
    assert out.key_points and provider.calls == 3


def test_runner_retries_transient_provider_errors_with_backoff():
    provider = MockProvider(mode="flaky", fail_times=2)
    r = runner(provider)
    r.generate(summary_request(), SummaryOutput, {1, 3})
    assert provider.calls == 3
    assert r.sleeps == [0.5, 1.0]


def test_runner_raises_unavailable_after_exhausting_retries():
    provider = MockProvider(mode="provider_error")
    with pytest.raises(AIUnavailableError):
        runner(provider).generate(summary_request(), SummaryOutput, {1, 3})
    assert provider.calls == 3


def test_auth_errors_are_not_retried():
    provider = MockProvider(mode="auth_error")
    with pytest.raises(AINotConfiguredError):
        runner(provider).generate(summary_request(), SummaryOutput, {1, 3})
    assert provider.calls == 1


def test_non_retryable_provider_errors_fail_fast():
    class BadRequest:
        name, calls = "bad", 0

        def complete(self, req):
            self.calls += 1
            raise ProviderError("400 invalid model", retryable=False)

    p = BadRequest()
    with pytest.raises(AIUnavailableError, match="invalid model"):
        runner(p).generate(summary_request(), SummaryOutput, {1, 3})
    assert p.calls == 1


def test_unknown_mock_mode_rejected():
    with pytest.raises(ValueError):
        MockProvider(mode="nonsense")


# ------------------------------------------------------- anthropic provider

def anthropic_with(handler) -> AnthropicProvider:
    return AnthropicProvider("test-key", "claude-test", client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_anthropic_success_sends_key_in_header_and_returns_text():
    seen = {}

    def handler(request: httpx.Request):
        seen["key"] = request.headers["x-api-key"]
        seen["url"] = str(request.url)
        return httpx.Response(200, json={"content": [{"type": "text", "text": '{"ok": true}'}]})

    assert anthropic_with(handler).complete(summary_request()) == '{"ok": true}'
    assert seen == {"key": "test-key", "url": "https://api.anthropic.com/v1/messages"}


@pytest.mark.parametrize(
    "status, exc_type, retryable",
    [(401, "auth", False), (429, "provider", True), (529, "provider", True), (400, "provider", False)],
)
def test_anthropic_error_mapping(status, exc_type, retryable):
    p = anthropic_with(lambda r: httpx.Response(status, json={"error": {"message": "nope"}}))
    with pytest.raises(ProviderError) as info:
        p.complete(summary_request())
    assert info.value.retryable is retryable
    assert (type(info.value).__name__ == "ProviderAuthError") is (exc_type == "auth")


def test_anthropic_timeout_is_retryable():
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(ProviderError) as info:
        anthropic_with(handler).complete(summary_request())
    assert info.value.retryable


def test_anthropic_requires_key():
    with pytest.raises(ValueError):
        AnthropicProvider("", "claude-test")
