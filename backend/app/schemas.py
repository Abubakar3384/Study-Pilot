"""HTTP request/response schemas. These are the frontend contract; see /docs for OpenAPI."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.ai.schemas import ConceptOutput, ConceptRelation, KeyPoint, NoteSection, ShortText


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody


# ---------------------------------------------------------------- documents

class DocumentOut(ORM):
    id: str
    filename: str
    size_bytes: int
    status: Literal["processing", "ready", "failed"]
    error: str | None
    page_count: int
    starred: bool = False
    created_at: datetime
    updated_at: datetime


class DocumentList(BaseModel):
    items: list[DocumentOut]


class PageOut(ORM):
    document_id: str
    page_number: int
    text: str


# ------------------------------------------------------------ summary/notes

class SummaryOut(BaseModel):
    id: str
    document_id: str
    created_at: datetime
    overview: str
    key_points: list[KeyPoint]


class NotesOut(BaseModel):
    id: str
    document_id: str
    created_at: datetime
    title: str
    sections: list[NoteSection]
    source: Literal["ai", "user"] = Field(default="ai", description="\"user\" when the student edited these notes")


class NotesEdit(BaseModel):
    title: ShortText
    sections: list[NoteSection] = Field(min_length=1, max_length=60)


class ConceptMapOut(BaseModel):
    id: str
    document_id: str
    created_at: datetime
    concepts: list[ConceptOutput]
    relations: list[ConceptRelation]
    generator: str | None = Field(
        default=None, description='Provider that built the map, e.g. "mock" (keyword-based) or "ollama"'
    )


# ------------------------------------------------------------------ quizzes

class QuizCreate(BaseModel):
    num_questions: int = Field(default=5, ge=1, le=20)
    pages: list[Annotated[int, Field(ge=1)]] | None = Field(
        default=None, max_length=50,
        description="Focus the quiz on these pages (and their immediate neighbours), e.g. one concept's pages.",
    )


class QuizQuestionOut(ORM):
    """Public view: the correct answer and explanation are revealed only by an attempt."""

    id: str
    position: int
    question: str
    options: list[str]
    page_number: int


class QuizOut(ORM):
    id: str
    document_id: str
    title: str
    created_at: datetime
    questions: list[QuizQuestionOut]


class AnswerCheckIn(BaseModel):
    selected_index: int | None = Field(default=None, ge=0, description="null = skipped")


class AnswerCheckOut(BaseModel):
    question_id: str
    selected_index: int | None
    is_correct: bool
    correct_index: int
    explanation: str
    page_number: int


class QuizList(BaseModel):
    items: list[QuizOut]


class AnswerIn(BaseModel):
    question_id: str
    selected_index: int | None = Field(default=None, ge=0, description="null = skipped")


class AttemptCreate(BaseModel):
    answers: list[AnswerIn] = Field(max_length=100)


class QuestionResultOut(BaseModel):
    question_id: str
    selected_index: int | None
    correct_index: int
    is_correct: bool
    explanation: str
    page_number: int


class AttemptOut(BaseModel):
    id: str
    quiz_id: str
    score: int
    total: int
    percentage: float
    created_at: datetime
    results: list[QuestionResultOut]


class AttemptList(BaseModel):
    items: list[AttemptOut]


# --------------------------------------------------------------- flashcards

class FlashcardsCreate(BaseModel):
    count: int = Field(default=10, ge=1, le=50)


class FlashcardOut(ORM):
    id: str
    document_id: str
    front: str
    back: str
    page_number: int
    created_at: datetime
    ease: float
    interval_days: int
    repetitions: int
    due_at: datetime
    last_reviewed_at: datetime | None
    last_rating: str | None


class FlashcardList(BaseModel):
    items: list[FlashcardOut]


class ReviewCreate(BaseModel):
    rating: Literal["again", "hard", "good", "easy"]


# --------------------------------------------------------------------- chat

class ChatCreate(BaseModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
    conversation_id: str | None = None


class Citation(BaseModel):
    page_number: int
    snippet: str


class MessageOut(ORM):
    id: str
    role: Literal["user", "assistant"]
    content: str
    citations: list[Citation]
    created_at: datetime


class ChatResponse(BaseModel):
    conversation_id: str
    message: MessageOut


class ConversationSummaryOut(ORM):
    id: str
    document_id: str
    title: str
    created_at: datetime


class ConversationList(BaseModel):
    items: list[ConversationSummaryOut]


class ConversationOut(ConversationSummaryOut):
    messages: list[MessageOut]


# ----------------------------------------------------------------- activity

ActivityType = Literal["document_uploaded", "quiz_attempt", "conversation", "flashcard_review"]


class ActivityItem(BaseModel):
    type: ActivityType
    at: datetime
    document_id: str
    document_filename: str
    summary: str
    quiz_id: str | None = None
    attempt_id: str | None = None
    conversation_id: str | None = None
    score: int | None = None
    total: int | None = None
    count: int | None = None


class ActivityList(BaseModel):
    items: list[ActivityItem]

