from collections.abc import Iterator

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.ai.runner import AIRunner
from app.config import Settings
from app.services.chat import ChatService
from app.services.study import StudyService


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request) -> Iterator[Session]:
    db = request.app.state.session_factory()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_runner(request: Request) -> AIRunner:
    return request.app.state.runner


def get_study(
    db: Session = Depends(get_db),
    runner: AIRunner = Depends(get_runner),
    settings: Settings = Depends(get_settings),
) -> StudyService:
    return StudyService(db, runner, settings.context_chars, settings.ai_max_tokens)


def get_chat(
    db: Session = Depends(get_db),
    runner: AIRunner = Depends(get_runner),
    settings: Settings = Depends(get_settings),
) -> ChatService:
    return ChatService(
        db, runner, settings.retrieval_top_k, settings.chat_history_messages, settings.ai_max_tokens
    )
