"""ASGI entrypoint for Vercel (`main:app`). Locally, run `uvicorn app.main:get_app --factory`."""

from app.main import get_app

app = get_app()
