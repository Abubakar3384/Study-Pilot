"""Summary, notes, quiz and flashcard generation, plus attempts and reviews."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import prompts
from app.ai.base import LLMRequest, Task
from app.ai.runner import AIRunner
from app.ai.schemas import ConceptMapOutput, FlashcardsOutput, NotesOutput, QuizOutput, SummaryOutput
from app.db.database import utcnow
from app.db.models import Document, Flashcard, GeneratedContent, Quiz, QuizAttempt, QuizQuestion
from app.errors import NotFoundError, RequestValidationAppError
from app.services.scheduling import Rating, ReviewState, schedule
from app.services.scoring import QuestionKey, ScoreResult, score_quiz

MIN_PAGE_SHARE = 500


def select_context(doc: Document, max_chars: int) -> list[dict]:
    """Pages to send to the model. Short documents go in whole; long ones are trimmed
    evenly so every part of the document is represented within the character budget."""
    pages = [{"page_number": p.page_number, "text": p.text} for p in doc.pages if p.text.strip()]
    if sum(len(p["text"]) for p in pages) <= max_chars:
        return pages
    max_pages = max(1, max_chars // MIN_PAGE_SHARE)
    if len(pages) > max_pages:
        step = len(pages) / max_pages
        pages = [pages[int(i * step)] for i in range(max_pages)]
    share = max_chars // len(pages)
    return [{**p, "text": p["text"][:share]} for p in pages]


def _pages_of(context: list[dict]) -> set[int]:
    return {p["page_number"] for p in context}


class StudyService:
    def __init__(
        self,
        db: Session,
        runner: AIRunner,
        max_context_chars: int,
        max_tokens: int = 4096,
        concepts_context_chars: int | None = None,
    ):
        self.db = db
        self.runner = runner
        self.max_context_chars = max_context_chars
        self.max_tokens = max_tokens
        self.concepts_context_chars = concepts_context_chars or max_context_chars

    def _request(self, task: str, prompt: str, payload: dict) -> LLMRequest:
        return LLMRequest(task, prompts.BASE_SYSTEM, prompt, payload, self.max_tokens)

    # --------------------------------------------------------------- summary/notes

    def generate_summary(self, doc: Document) -> GeneratedContent:
        ctx = select_context(doc, self.max_context_chars)
        out = self.runner.generate(
            self._request(Task.SUMMARY, prompts.summary_prompt(ctx), {"pages": ctx}),
            SummaryOutput, _pages_of(ctx),
        )
        return self._store_generated(doc, "summary", out.model_dump())

    def generate_notes(self, doc: Document) -> GeneratedContent:
        ctx = select_context(doc, self.max_context_chars)
        out = self.runner.generate(
            self._request(Task.NOTES, prompts.notes_prompt(ctx), {"pages": ctx}),
            NotesOutput, _pages_of(ctx),
        )
        return self._store_generated(doc, "notes", out.model_dump())

    def generate_concepts(self, doc: Document) -> GeneratedContent:
        ctx = select_context(doc, self.concepts_context_chars)
        out = self.runner.generate(
            self._request(Task.CONCEPTS, prompts.concepts_prompt(ctx), {"pages": ctx}),
            ConceptMapOutput, _pages_of(ctx),
        )
        # Record what built it, so the UI can say "keyword map" rather than imply an AI made it.
        provider = self.runner.provider
        generator = provider.provider_for(Task.CONCEPTS).name if hasattr(provider, "provider_for") else provider.name
        return self._store_generated(doc, "concepts", {**out.model_dump(), "generator": generator})

    def save_notes(self, doc: Document, notes: NotesOutput) -> GeneratedContent:
        """Store a student's edited notes as the newest version; earlier versions are kept."""
        bad = sorted({s.page_number for s in notes.sections if s.page_number > doc.page_count})
        if bad:
            raise RequestValidationAppError(
                f"page_number {bad} is outside this document (it has {doc.page_count} pages)."
            )
        return self._store_generated(doc, "notes", {**notes.model_dump(), "source": "user"})

    def _store_generated(self, doc: Document, kind: str, payload: dict) -> GeneratedContent:
        row = GeneratedContent(document_id=doc.id, kind=kind, payload=payload)
        self.db.add(row)
        self.db.commit()
        return row

    def latest_generated(self, doc: Document, kind: str) -> GeneratedContent:
        row = self.db.scalar(
            select(GeneratedContent)
            .where(GeneratedContent.document_id == doc.id, GeneratedContent.kind == kind)
            .order_by(GeneratedContent.created_at.desc())
            .limit(1)
        )
        if row is None:
            raise NotFoundError(f"No {kind} has been generated for this document yet.")
        return row

    # ---------------------------------------------------------------------- quizzes

    def generate_quiz(self, doc: Document, num_questions: int, pages: list[int] | None = None) -> Quiz:
        ctx = select_context(doc, self.max_context_chars)
        if pages:
            # Focused quiz: the requested pages plus their neighbours, for enough surrounding context.
            wanted = {n for p in pages for n in (p - 1, p, p + 1)}
            ctx = [p for p in ctx if p["page_number"] in wanted]
            if not ctx:
                raise RequestValidationAppError("None of the requested pages contain text to quiz on.")
        out = self.runner.generate(
            self._request(
                Task.QUIZ, prompts.quiz_prompt(ctx, num_questions),
                {"pages": ctx, "num_questions": num_questions},
            ),
            QuizOutput, _pages_of(ctx),
        )
        quiz = Quiz(document_id=doc.id, title=out.title)
        quiz.questions = [
            QuizQuestion(
                position=i, question=q.question, options=q.options, correct_index=q.correct_index,
                explanation=q.explanation, page_number=q.page_number,
            )
            for i, q in enumerate(out.questions[:num_questions])
        ]
        self.db.add(quiz)
        self.db.commit()
        return quiz

    def get_quiz(self, quiz_id: str) -> Quiz:
        quiz = self.db.get(Quiz, quiz_id)
        if quiz is None:
            raise NotFoundError(f"Quiz {quiz_id} not found.")
        return quiz

    def check_answer(self, quiz: Quiz, question_id: str, selected_index: int | None) -> dict:
        """Practice-mode feedback for one question. Nothing is recorded; attempts are separate."""
        question = next((q for q in quiz.questions if q.id == question_id), None)
        if question is None:
            raise NotFoundError(f"Question {question_id} is not part of quiz {quiz.id}.")
        if selected_index is not None and selected_index >= len(question.options):
            raise RequestValidationAppError(
                f"selected_index must be between 0 and {len(question.options) - 1}."
            )
        return {
            "question_id": question.id,
            "selected_index": selected_index,
            "is_correct": selected_index == question.correct_index,
            "correct_index": question.correct_index,
            "explanation": question.explanation,
            "page_number": question.page_number,
        }

    def list_quizzes(self, doc: Document) -> list[Quiz]:
        return list(
            self.db.scalars(select(Quiz).where(Quiz.document_id == doc.id).order_by(Quiz.created_at.desc()))
        )

    def submit_attempt(self, quiz: Quiz, answers: dict[str, int | None]) -> tuple[QuizAttempt, ScoreResult]:
        keys = [QuestionKey(q.id, q.correct_index, len(q.options)) for q in quiz.questions]
        result = score_quiz(keys, answers)
        attempt = QuizAttempt(
            quiz_id=quiz.id, score=result.score, total=result.total,
            answers={r.question_id: r.selected_index for r in result.results},
        )
        self.db.add(attempt)
        self.db.commit()
        return attempt, result

    # ------------------------------------------------------------------- flashcards

    def generate_flashcards(self, doc: Document, count: int) -> list[Flashcard]:
        ctx = select_context(doc, self.max_context_chars)
        out = self.runner.generate(
            self._request(
                Task.FLASHCARDS, prompts.flashcards_prompt(ctx, count), {"pages": ctx, "count": count}
            ),
            FlashcardsOutput, _pages_of(ctx),
        )
        cards = [
            Flashcard(document_id=doc.id, front=c.front, back=c.back, page_number=c.page_number)
            for c in out.cards[:count]
        ]
        self.db.add_all(cards)
        self.db.commit()
        return cards

    def list_flashcards(self, doc: Document, due_only: bool = False) -> list[Flashcard]:
        stmt = select(Flashcard).where(Flashcard.document_id == doc.id)
        if due_only:
            stmt = stmt.where(Flashcard.due_at <= utcnow())
        return list(self.db.scalars(stmt.order_by(Flashcard.due_at, Flashcard.created_at)))

    def review_flashcard(self, card_id: str, rating: Rating, now: datetime | None = None) -> Flashcard:
        card = self.db.get(Flashcard, card_id)
        if card is None:
            raise NotFoundError(f"Flashcard {card_id} not found.")
        now = now or utcnow()
        state, due = schedule(ReviewState(card.ease, card.interval_days, card.repetitions), rating, now)
        card.ease, card.interval_days, card.repetitions = state.ease, state.interval_days, state.repetitions
        card.due_at, card.last_reviewed_at, card.last_rating = due, now, rating
        self.db.commit()
        return card
