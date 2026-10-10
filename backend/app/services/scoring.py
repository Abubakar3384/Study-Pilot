"""Quiz scoring. Pure functions so they are trivially testable."""

from dataclasses import dataclass

from app.errors import RequestValidationAppError


@dataclass(frozen=True)
class QuestionKey:
    id: str
    correct_index: int
    option_count: int


@dataclass(frozen=True)
class QuestionResult:
    question_id: str
    selected_index: int | None
    correct_index: int
    is_correct: bool


@dataclass(frozen=True)
class ScoreResult:
    score: int
    total: int
    results: list[QuestionResult]

    @property
    def percentage(self) -> float:
        return round(100 * self.score / self.total, 1) if self.total else 0.0


def score_quiz(keys: list[QuestionKey], answers: dict[str, int | None]) -> ScoreResult:
    """Unanswered questions count as incorrect. Unknown question ids or out-of-range
    selections are rejected rather than silently ignored."""
    by_id = {k.id: k for k in keys}
    unknown = sorted(set(answers) - set(by_id))
    if unknown:
        raise RequestValidationAppError(f"Answers reference questions not in this quiz: {unknown}")
    for qid, sel in answers.items():
        if sel is not None and not 0 <= sel < by_id[qid].option_count:
            raise RequestValidationAppError(f"selected_index {sel} is out of range for question {qid}")

    results = []
    for k in keys:
        sel = answers.get(k.id)
        results.append(QuestionResult(k.id, sel, k.correct_index, sel == k.correct_index))
    return ScoreResult(score=sum(r.is_correct for r in results), total=len(keys), results=results)
