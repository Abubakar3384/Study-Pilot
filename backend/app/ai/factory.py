from app.ai.anthropic import AnthropicProvider
from app.ai.base import LLMProvider, Task
from app.ai.mock import MockProvider
from app.ai.ollama import OllamaProvider
from app.ai.router import TaskRouter
from app.config import Settings


def build_provider(settings: Settings) -> LLMProvider:
    main = _build_main(settings)
    if settings.concepts_use_mock and settings.ai_provider != "mock":
        return TaskRouter(main, {Task.CONCEPTS: MockProvider(mode="ok")})
    return main


def _build_main(settings: Settings) -> LLMProvider:
    if settings.ai_provider == "mock":
        return MockProvider(mode=settings.mock_mode, fail_times=settings.mock_fail_times)
    if settings.ai_provider == "anthropic":
        key = settings.anthropic_api_key.get_secret_value() if settings.anthropic_api_key else ""
        if not key:
            raise RuntimeError("AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set")
        return AnthropicProvider(
            api_key=key,
            model=settings.anthropic_model,
            base_url=settings.anthropic_base_url,
            timeout=settings.ai_timeout_seconds,
        )
    if settings.ai_provider == "ollama":
        return OllamaProvider(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            num_ctx=settings.ollama_num_ctx,
            num_predict=settings.ollama_num_predict,
            timeout=settings.ollama_timeout_seconds,
        )
    raise RuntimeError(f"Unsupported AI_PROVIDER {settings.ai_provider!r}")
