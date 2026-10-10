"""Recent study activity across all documents, newest first, for the dashboard.

Built from data that already exists: uploads, quiz attempts, conversations (timed by their latest
message) and flashcard reviews (one entry per document per day, from `last_reviewed_at`).
"""

from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Conversation, Document, Flashcard, Message, Quiz, QuizAttempt


def recent_activity(db: Session, limit: int) -> list[dict]:
    docs = {d.id: d for d in db.scalars(select(Document))}
    items: list[dict] = []

    for d in docs.values():
        items.append({
            "type": "document_uploaded", "at": d.created_at, "document_id": d.id,
            "document_filename": d.filename, "summary": f"Uploaded {d.filename}",
        })

    attempts = db.execute(
        select(QuizAttempt, Quiz.document_id, Quiz.title)
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .order_by(QuizAttempt.created_at.desc())
        .limit(limit)
    )
    for attempt, doc_id, title in attempts:
        items.append({
            "type": "quiz_attempt", "at": attempt.created_at, "document_id": doc_id,
            "document_filename": docs[doc_id].filename,
            "summary": f"Scored {attempt.score}/{attempt.total} on {title}",
            "quiz_id": attempt.quiz_id, "attempt_id": attempt.id,
            "score": attempt.score, "total": attempt.total,
        })

    last_message = (
        select(Message.conversation_id, func.max(Message.created_at).label("at"))
        .group_by(Message.conversation_id)
        .subquery()
    )
    convos = db.execute(
        select(Conversation, last_message.c.at)
        .join(last_message, last_message.c.conversation_id == Conversation.id)
        .order_by(last_message.c.at.desc())
        .limit(limit)
    )
    for convo, at in convos:
        items.append({
            "type": "conversation", "at": _aware(at), "document_id": convo.document_id,
            "document_filename": docs[convo.document_id].filename,
            "summary": f"Asked: {convo.title}", "conversation_id": convo.id,
        })

    reviews: dict[tuple[str, str], list[datetime]] = defaultdict(list)
    for card in db.scalars(select(Flashcard).where(Flashcard.last_reviewed_at.is_not(None))):
        reviews[(card.document_id, card.last_reviewed_at.date().isoformat())].append(card.last_reviewed_at)
    for (doc_id, _day), times in reviews.items():
        n = len(times)
        items.append({
            "type": "flashcard_review", "at": max(times), "document_id": doc_id,
            "document_filename": docs[doc_id].filename,
            "summary": f"Reviewed {n} flashcard{'s' if n != 1 else ''}", "count": n,
        })

    items.sort(key=lambda i: i["at"], reverse=True)
    return items[:limit]


def _aware(value: datetime) -> datetime:
    """Aggregates bypass the UTCDateTime decorator on SQLite, so restore UTC tzinfo."""
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
