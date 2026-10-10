from fastapi import APIRouter, Body, Depends, status
from sqlalchemy.orm import Session

from app.ai.runner import AIRunner
from app.api.deps import get_db, get_runner, get_study
from app.db.models import GeneratedContent, Quiz, QuizAttempt
from app.errors import RequestValidationAppError
from app.ai.schemas import NotesOutput
from app.schemas import (
    AnswerCheckIn, AnswerCheckOut, AttemptCreate, AttemptList, AttemptOut, ConceptMapOut, FlashcardList,
    FlashcardOut, FlashcardsCreate, NotesEdit, NotesOut, QuizCreate, QuizList, QuizOut, ReviewCreate, SummaryOut,
)
from app.services.documents import get_document, get_ready_document
from app.services.scoring import QuestionKey, score_quiz
from app.services.study import StudyService

router = APIRouter(prefix="/api", tags=["study"])

AI_ERRORS = {
    409: {"description": "Document not ready (processing or failed)"},
    502: {"description": "AI output failed validation after retries (`ai_invalid_output`)"},
    503: {"description": "AI provider unavailable or misconfigured (`ai_unavailable`, `ai_not_configured`)"},
}


def _generated(row: GeneratedContent) -> dict:
    return {"id": row.id, "document_id": row.document_id, "created_at": row.created_at, **row.payload}


def _attempt_out(quiz: Quiz, attempt: QuizAttempt) -> dict:
    keys = [QuestionKey(q.id, q.correct_index, len(q.options)) for q in quiz.questions]
    result = score_quiz(keys, attempt.answers)
    by_id = {q.id: q for q in quiz.questions}
    return {
        "id": attempt.id, "quiz_id": quiz.id, "score": attempt.score, "total": attempt.total,
        "percentage": result.percentage, "created_at": attempt.created_at,
        "results": [
            {
                "question_id": r.question_id, "selected_index": r.selected_index,
                "correct_index": r.correct_index, "is_correct": r.is_correct,
                "explanation": by_id[r.question_id].explanation,
                "page_number": by_id[r.question_id].page_number,
            }
            for r in result.results
        ],
    }


# -------------------------------------------------------------- stop

@router.post("/ai/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel_generation(runner: AIRunner = Depends(get_runner)):
    """Stop the AI generation in progress (the request that started it answers `409 ai_cancelled`)."""
    runner.cancel()


# -------------------------------------------------------------- summary/notes

@router.post("/documents/{document_id}/summary", response_model=SummaryOut,
             status_code=status.HTTP_201_CREATED, responses=AI_ERRORS,
             summary="Generate (or regenerate) a structured summary")
def create_summary(document_id: str, db: Session = Depends(get_db), study: StudyService = Depends(get_study)):
    return _generated(study.generate_summary(get_ready_document(db, document_id)))


@router.get("/documents/{document_id}/summary", response_model=SummaryOut, summary="Latest summary")
def latest_summary(document_id: str, db: Session = Depends(get_db), study: StudyService = Depends(get_study)):
    return _generated(study.latest_generated(get_document(db, document_id), "summary"))


@router.post("/documents/{document_id}/notes", response_model=NotesOut,
             status_code=status.HTTP_201_CREATED, responses=AI_ERRORS,
             summary="Generate (or regenerate) study notes")
def create_notes(document_id: str, db: Session = Depends(get_db), study: StudyService = Depends(get_study)):
    return _generated(study.generate_notes(get_ready_document(db, document_id)))


@router.get("/documents/{document_id}/notes", response_model=NotesOut, summary="Latest study notes")
def latest_notes(document_id: str, db: Session = Depends(get_db), study: StudyService = Depends(get_study)):
    return _generated(study.latest_generated(get_document(db, document_id), "notes"))


@router.put("/documents/{document_id}/notes", response_model=NotesOut,
            summary="Save edited notes as the newest version (earlier versions are kept)")
def save_notes(document_id: str, body: NotesEdit, db: Session = Depends(get_db),
               study: StudyService = Depends(get_study)):
    notes = NotesOutput(title=body.title, sections=body.sections)
    return _generated(study.save_notes(get_ready_document(db, document_id), notes))


# ------------------------------------------------------------------- concepts

@router.post("/documents/{document_id}/concepts", response_model=ConceptMapOut,
             status_code=status.HTTP_201_CREATED, responses=AI_ERRORS,
             summary="Generate (or regenerate) the document's concept map")
def create_concepts(document_id: str, db: Session = Depends(get_db), study: StudyService = Depends(get_study)):
    return _generated(study.generate_concepts(get_ready_document(db, document_id)))


@router.get("/documents/{document_id}/concepts", response_model=ConceptMapOut, summary="Latest concept map")
def latest_concepts(document_id: str, db: Session = Depends(get_db), study: StudyService = Depends(get_study)):
    return _generated(study.latest_generated(get_document(db, document_id), "concepts"))


# -------------------------------------------------------------------- quizzes

@router.post("/documents/{document_id}/quizzes", response_model=QuizOut,
             status_code=status.HTTP_201_CREATED, responses=AI_ERRORS,
             summary="Generate a multiple-choice quiz (answers hidden until an attempt)")
def create_quiz(document_id: str, body: QuizCreate = Body(default_factory=QuizCreate),
                db: Session = Depends(get_db), study: StudyService = Depends(get_study)):
    return study.generate_quiz(get_ready_document(db, document_id), body.num_questions, body.pages)


@router.get("/documents/{document_id}/quizzes", response_model=QuizList)
def list_quizzes(document_id: str, db: Session = Depends(get_db), study: StudyService = Depends(get_study)):
    return {"items": study.list_quizzes(get_document(db, document_id))}


@router.get("/quizzes/{quiz_id}", response_model=QuizOut)
def get_quiz(quiz_id: str, study: StudyService = Depends(get_study)):
    return study.get_quiz(quiz_id)


@router.post("/quizzes/{quiz_id}/attempts", response_model=AttemptOut, status_code=status.HTTP_201_CREATED,
             summary="Submit answers; returns score, correct answers and explanations")
def submit_attempt(quiz_id: str, body: AttemptCreate, study: StudyService = Depends(get_study)):
    quiz = study.get_quiz(quiz_id)
    ids = [a.question_id for a in body.answers]
    if len(ids) != len(set(ids)):
        raise RequestValidationAppError("Each question may be answered at most once.")
    attempt, _ = study.submit_attempt(quiz, {a.question_id: a.selected_index for a in body.answers})
    return _attempt_out(quiz, attempt)


@router.post("/quizzes/{quiz_id}/questions/{question_id}/check", response_model=AnswerCheckOut,
             summary="Practice feedback for one answer (reveals the correct option; records nothing)")
def check_answer(quiz_id: str, question_id: str, body: AnswerCheckIn, study: StudyService = Depends(get_study)):
    return study.check_answer(study.get_quiz(quiz_id), question_id, body.selected_index)


@router.get("/quizzes/{quiz_id}/attempts", response_model=AttemptList)
def list_attempts(quiz_id: str, study: StudyService = Depends(get_study)):
    quiz = study.get_quiz(quiz_id)
    return {"items": [_attempt_out(quiz, a) for a in quiz.attempts]}


# ----------------------------------------------------------------- flashcards

@router.post("/documents/{document_id}/flashcards", response_model=FlashcardList,
             status_code=status.HTTP_201_CREATED, responses=AI_ERRORS,
             summary="Generate flashcards and add them to the document's deck")
def create_flashcards(document_id: str, body: FlashcardsCreate = Body(default_factory=FlashcardsCreate),
                      db: Session = Depends(get_db), study: StudyService = Depends(get_study)):
    return {"items": study.generate_flashcards(get_ready_document(db, document_id), body.count)}


@router.get("/documents/{document_id}/flashcards", response_model=FlashcardList,
            summary="List flashcards, ordered by due date; `due=true` for only cards due now")
def list_flashcards(document_id: str, due: bool = False, db: Session = Depends(get_db),
                    study: StudyService = Depends(get_study)):
    return {"items": study.list_flashcards(get_document(db, document_id), due_only=due)}


@router.post("/flashcards/{flashcard_id}/reviews", response_model=FlashcardOut,
             summary="Record a review (again/hard/good/easy) and reschedule the card")
def review_flashcard(flashcard_id: str, body: ReviewCreate, study: StudyService = Depends(get_study)):
    return study.review_flashcard(flashcard_id, body.rating)
