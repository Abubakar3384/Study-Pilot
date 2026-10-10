"""Application settings, loaded from environment variables (and an optional .env file).

Secrets such as ANTHROPIC_API_KEY live only here on the server; no route ever returns them.
"""

from functools import cached_property
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Storage
    database_url: str = "sqlite:///./data/studypilot.db"
    upload_dir: Path = Path("./data/uploads")
    max_upload_mb: int = Field(default=25, ge=1)
    max_pages: int = Field(default=500, ge=1)
    min_extracted_chars: int = Field(default=20, ge=0)

    # AI provider
    # "mock" is the default, so a deployment without a .env runs offline at no cost.
    ai_provider: Literal["mock", "anthropic", "ollama"] = "mock"
    anthropic_api_key: SecretStr | None = None
    anthropic_model: str = "claude-sonnet-5-5"
    anthropic_base_url: str = "https://api.anthropic.com"
    # Ollama (local models): `ollama run llama3.1:8b` on the same machine as the backend
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"
    ollama_num_ctx: int = Field(default=8192, ge=2048)
    # Local models run on a laptop: smaller prompts and replies keep each request to a few minutes.
    ollama_max_context_chars: int = Field(default=8_000, ge=2_000)
    ollama_num_predict: int = Field(default=2048, ge=256)
    # Longest silence tolerated from Ollama (the reply is streamed), separate from the cloud timeout.
    ollama_timeout_seconds: float = Field(default=600.0, gt=0)
    # Who builds concept maps: "auto" = the offline mock when AI_PROVIDER=ollama (fast, keeps the local
    # model free for notes/quizzes), otherwise the main provider; "mock" or "main" force one.
    ai_concepts_provider: Literal["auto", "mock", "main"] = "auto"
    ai_timeout_seconds: float = Field(default=60.0, gt=0)
    ai_max_attempts: int = Field(default=3, ge=1, le=10)
    ai_retry_backoff_seconds: float = Field(default=1.0, ge=0)
    ai_max_tokens: int = Field(default=4096, ge=256)
    ai_max_context_chars: int = Field(default=60_000, ge=2_000)

    # Mock provider behaviour (see app/ai/mock.py for the modes)
    mock_mode: str = "ok"
    mock_fail_times: int = Field(default=2, ge=0)

    # Retrieval
    retrieval_top_k: int = Field(default=5, ge=1, le=20)
    chat_history_messages: int = Field(default=6, ge=0, le=50)

    # HTTP
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    @cached_property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def context_chars(self) -> int:
        """Document characters sent per generation request.

        For Ollama the prompt and the reply must both fit in the model's context window (num_ctx tokens),
        so the document budget is what's left after the reply and the instructions (~3.5 chars per token).
        """
        if self.ai_provider == "ollama":
            fits = int((self.ollama_num_ctx - self.ollama_num_predict - 800) * 3.5)
            return max(2_000, min(self.ollama_max_context_chars, fits))
        return self.ai_max_context_chars

    @property
    def concepts_use_mock(self) -> bool:
        if self.ai_concepts_provider == "auto":
            return self.ai_provider == "ollama"
        return self.ai_concepts_provider == "mock"

    @property
    def concepts_context_chars(self) -> int:
        """The mock is instant and free, so a mock-built concept map can read the whole budget."""
        return self.ai_max_context_chars if self.concepts_use_mock else self.context_chars

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024
