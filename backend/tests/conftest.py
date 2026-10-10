from collections.abc import Callable

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.ai.mock import MockProvider
from app.config import Settings
from app.main import create_app

SAMPLE_PAGES = [
    "Photosynthesis converts light energy into chemical energy. It takes place in the chloroplasts "
    "of plant cells. Chlorophyll absorbs mostly blue and red light.",
    "",  # a blank page: must still keep page numbering intact
    "Mitochondria are the powerhouse of the cell. They produce ATP through cellular respiration. "
    "Mitochondria have their own DNA, inherited from the mother.",
    "The Krebs cycle runs in the mitochondrial matrix. It releases carbon dioxide and generates "
    "NADH and FADH2 for the electron transport chain.",
]


def make_pdf(pages: list[str], password: str | None = None) -> bytes:
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        if text:
            page.insert_textbox(pymupdf.Rect(50, 50, 545, 790), text, fontsize=11)
    kwargs = {}
    if password:
        kwargs = dict(encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw=password, owner_pw=password)
    data = doc.tobytes(**kwargs)
    doc.close()
    return data


@pytest.fixture
def sample_pdf() -> bytes:
    return make_pdf(SAMPLE_PAGES)


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        _env_file=None,
        database_url=f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
        upload_dir=tmp_path / "uploads",
        ai_provider="mock",
        ai_retry_backoff_seconds=0,
        ai_max_attempts=3,
        max_upload_mb=1,
    )


@pytest.fixture
def make_client(settings) -> Callable[..., TestClient]:
    def _make(mode: str = "ok", fail_times: int = 2, provider=None) -> TestClient:
        provider = provider or MockProvider(mode=mode, fail_times=fail_times)
        client = TestClient(create_app(settings, provider))
        client.provider = provider  # type: ignore[attr-defined]
        return client

    return _make


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()


def upload(client: TestClient, data: bytes, name: str = "biology.pdf"):
    return client.post("/api/documents", files={"file": (name, data, "application/pdf")})


@pytest.fixture
def ready_doc(client, sample_pdf) -> dict:
    resp = upload(client, sample_pdf)
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "ready"
    return resp.json()
