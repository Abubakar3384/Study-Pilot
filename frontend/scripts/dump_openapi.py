"""Print the backend's OpenAPI schema without starting a server (temp DB, mock provider)."""

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

tmp = tempfile.mkdtemp()
settings = Settings(database_url=f"sqlite:///{tmp}/openapi.db", upload_dir=tmp, ai_provider="mock")
print(json.dumps(create_app(settings).openapi(), indent=1))
