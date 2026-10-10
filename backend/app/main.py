import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.ai.base import LLMProvider
from app.ai.factory import build_provider
from app.ai.runner import AIRunner
from app.api import activity, chat, documents, study
from app.config import Settings
from app.db.database import init_db, make_engine, make_session_factory
from app.errors import AppError

log = logging.getLogger("studypilot")


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def create_app(settings: Settings | None = None, provider: LLMProvider | None = None) -> FastAPI:
    settings = settings or Settings()
    provider = provider or build_provider(settings)

    engine = make_engine(settings.database_url)
    init_db(engine)

    app = FastAPI(
        title="StudyPilot API",
        version="0.1.0",
        description="Backend for StudyPilot: PDF ingestion, AI study materials and grounded chat.",
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = make_session_factory(engine)
    log.info("AI provider: %s%s", provider.name, f" ({provider.model})" if getattr(provider, "model", None) else "")
    app.state.runner = AIRunner(provider, settings.ai_max_attempts, settings.ai_retry_backoff_seconds)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return _error(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(p) for p in first.get("loc", ()))
        return _error(422, "invalid_request", f"{where}: {first.get('msg', 'invalid request')}")

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("Unhandled error")
        return _error(500, "internal_error", "An unexpected error occurred.")

    @app.get("/api/health", tags=["meta"])
    def health():
        body = {"status": "ok", "ai_provider": provider.name}
        if getattr(provider, "model", None):
            body["ai_model"] = provider.model
        return body

    app.include_router(documents.router)
    app.include_router(study.router)
    app.include_router(chat.router)
    app.include_router(activity.router)
    return app


def get_app() -> FastAPI:
    """Factory for `uvicorn app.main:get_app --factory`."""
    logging.basicConfig(level=logging.INFO)
    return create_app()
