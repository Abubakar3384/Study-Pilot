"""Calls a provider, parses + validates its JSON, and retries on failure.

Retry policy (one attempt budget, `max_attempts`, shared by both failure kinds):
- Retryable provider errors (timeouts, 429, 5xx): back off exponentially and try again.
- Non-retryable provider errors (bad request, auth): fail immediately.
- Output that is not JSON, fails the schema, or cites pages that weren't supplied:
  re-ask with the validation error appended to the prompt.
"""

import json
import logging
import re
import time
from collections.abc import Callable, Iterable
from typing import TypeVar

from pydantic import ValidationError

from app.ai.base import LLMProvider, LLMRequest, ProviderAuthError, ProviderError
from app.ai.schemas import _Out
from app.errors import AINotConfiguredError, AIOutputError, AIUnavailableError

log = logging.getLogger(__name__)

T = TypeVar("T", bound=_Out)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def extract_json(raw: str) -> object:
    text = _FENCE.sub("", raw.strip())
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("reply did not contain a JSON object") from None
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise ValueError(f"reply was not valid JSON: {exc.msg}") from None


def _describe(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        parts = [
            f"{'.'.join(str(p) for p in e['loc']) or '<root>'}: {e['msg']}" for e in exc.errors()[:8]
        ]
        return "; ".join(parts)
    return str(exc)


class AIRunner:
    def __init__(
        self,
        provider: LLMProvider,
        max_attempts: int = 3,
        backoff_seconds: float = 1.0,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.provider = provider
        self.max_attempts = max_attempts
        self.backoff_seconds = backoff_seconds
        self._sleep = sleep

    def generate(self, request: LLMRequest, output_model: type[T], valid_pages: Iterable[int]) -> T:
        allowed = set(valid_pages)
        last_problem = "unknown error"
        last_was_output_problem = False
        for attempt in range(1, self.max_attempts + 1):
            try:
                raw = self.provider.complete(request)
            except ProviderAuthError as exc:
                log.error("AI provider auth failure: %s", exc)
                raise AINotConfiguredError("The AI provider is not configured correctly.") from exc
            except ProviderError as exc:
                last_problem, last_was_output_problem = str(exc), False
                log.warning("AI provider error (attempt %d/%d): %s", attempt, self.max_attempts, exc)
                if not exc.retryable:
                    raise AIUnavailableError(f"The AI provider rejected the request: {exc}") from exc
                if attempt < self.max_attempts:
                    self._sleep(self.backoff_seconds * 2 ** (attempt - 1))
                continue

            try:
                result = output_model.model_validate(extract_json(raw))
                bad = sorted(result.cited_pages() - allowed)
                if bad:
                    raise ValueError(
                        f"page_number values {bad} are not among the supplied pages {sorted(allowed)}"
                    )
                return result
            except ValueError as exc:  # includes pydantic.ValidationError
                last_problem, last_was_output_problem = _describe(exc), True
                log.warning("Invalid AI output (attempt %d/%d): %s", attempt, self.max_attempts, last_problem)
                request = request.with_feedback(last_problem)

        if last_was_output_problem:
            raise AIOutputError(
                f"AI output failed validation after {self.max_attempts} attempts: {last_problem}"
            )
        raise AIUnavailableError(f"AI provider failed after {self.max_attempts} attempts: {last_problem}")
