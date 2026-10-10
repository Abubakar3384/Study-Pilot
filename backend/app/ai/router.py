"""Per-task provider routing, e.g. concept maps from the mock while everything else uses Ollama."""

from app.ai.base import LLMProvider, LLMRequest


class TaskRouter:
    """Looks like a single provider to the runner; picks the real one by request.task."""

    def __init__(self, default: LLMProvider, overrides: dict[str, LLMProvider]):
        self.default = default
        self.overrides = overrides
        self.name = default.name
        self.model = getattr(default, "model", None)

    def provider_for(self, task: str) -> LLMProvider:
        return self.overrides.get(task, self.default)

    def complete(self, request: LLMRequest) -> str:
        return self.provider_for(request.task).complete(request)
