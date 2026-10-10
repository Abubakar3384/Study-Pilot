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
    ai_provider: Literal["mock", "anthropic"] = "mock"
    anthropic_api_key: SecretStr | None = None
    anthropic_model: str = "claude-sonnet-5-5"
    anthropic_base_url: str = "https://api.anthropic.com"
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
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024
