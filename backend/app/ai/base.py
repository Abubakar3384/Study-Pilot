"""Provider abstraction. A provider turns an LLMRequest into raw text; it knows nothing
about parsing or validation (that is app.ai.runner's job)."""

from dataclasses import dataclass, field, replace
from typing import Any, Protocol


class Task:
    SUMMARY = "summary"
    NOTES = "notes"
    QUIZ = "quiz"
    FLASHCARDS = "flashcards"
    CHAT = "chat"
    CONCEPTS = "concepts"


@dataclass(frozen=True)
class LLMRequest:
    task: str
    system: str
    prompt: str
    # Structured view of the inputs. Real providers ignore it; the mock provider builds its
    # deterministic output from it so tests don't depend on prompt wording.
    payload: dict[str, Any] = field(default_factory=dict)
    max_tokens: int = 4096

    def with_feedback(self, feedback: str) -> "LLMRequest":
        return replace(
            self,
            prompt=(
                f"{self.prompt}\n\nYour previous reply was rejected because: {feedback}\n"
                "Reply again with corrected JSON only."
            ),
        )


class ProviderError(Exception):
    def __init__(self, message: str, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable


class ProviderAuthError(ProviderError):
    def __init__(self, message: str = "AI provider rejected the credentials"):
        super().__init__(message, retryable=False)


class LLMProvider(Protocol):
    name: str

    def complete(self, request: LLMRequest) -> str: ...
