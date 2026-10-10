"""Schemas the model's JSON output must satisfy before anything is stored or returned.

Each model exposes `cited_pages()` so the runner can check every page reference against
the pages that were actually given to the model for this document.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
PageNumber = Annotated[int, Field(ge=1)]


class _Out(BaseModel):
    model_config = ConfigDict(extra="ignore")

    def cited_pages(self) -> set[int]:
        raise NotImplementedError


class KeyPoint(BaseModel):
    text: Text
    page_number: PageNumber


class SummaryOutput(_Out):
    overview: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=6000)]
    key_points: list[KeyPoint] = Field(min_length=1, max_length=15)

    def cited_pages(self) -> set[int]:
        return {k.page_number for k in self.key_points}


class NoteSection(BaseModel):
    heading: ShortText
    bullets: list[Text] = Field(min_length=1, max_length=15)
    page_number: PageNumber


class NotesOutput(_Out):
    title: ShortText
    sections: list[NoteSection] = Field(min_length=1, max_length=30)

    def cited_pages(self) -> set[int]:
        return {s.page_number for s in self.sections}


class QuizQuestionOutput(BaseModel):
    question: Text
    options: list[ShortText] = Field(min_length=4, max_length=4)
    correct_index: int = Field(ge=0, le=3)
    explanation: Text
    page_number: PageNumber

    @field_validator("options")
    @classmethod
    def _distinct_options(cls, v: list[str]) -> list[str]:
        if len({o.casefold() for o in v}) != len(v):
            raise ValueError("options must be distinct")
        return v


class QuizOutput(_Out):
    title: ShortText
    questions: list[QuizQuestionOutput] = Field(min_length=1, max_length=20)

    def cited_pages(self) -> set[int]:
        return {q.page_number for q in self.questions}


class FlashcardOutput(BaseModel):
    front: Text
    back: Text
    page_number: PageNumber


class FlashcardsOutput(_Out):
    cards: list[FlashcardOutput] = Field(min_length=1, max_length=50)

    def cited_pages(self) -> set[int]:
        return {c.page_number for c in self.cards}


class ChatOutput(_Out):
    answer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=6000)]
    answerable: bool
    cited_pages_: list[PageNumber] = Field(default_factory=list, alias="cited_pages", max_length=10)

    @model_validator(mode="after")
    def _citations_required(self) -> "ChatOutput":
        if self.answerable and not self.cited_pages_:
            raise ValueError("an answerable reply must cite at least one page")
        if not self.answerable:
            self.cited_pages_ = []
        return self

    def cited_pages(self) -> set[int]:
        return set(self.cited_pages_)


ConceptId = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[a-z0-9][a-z0-9-]{0,47}$")]


class ConceptOutput(BaseModel):
    id: ConceptId
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    explanation: Text
    page_numbers: list[PageNumber] = Field(min_length=1, max_length=10)
    importance: int = Field(ge=1, le=3)

    @field_validator("page_numbers")
    @classmethod
    def _sorted_unique(cls, v: list[int]) -> list[int]:
        return sorted(set(v))


class ConceptRelation(BaseModel):
    source: ConceptId
    target: ConceptId
    kind: Literal["related", "prerequisite", "part_of"] = "related"


class ConceptMapOutput(_Out):
    concepts: list[ConceptOutput] = Field(min_length=3, max_length=40)
    relations: list[ConceptRelation] = Field(default_factory=list, max_length=120)

    @model_validator(mode="after")
    def _consistent(self) -> "ConceptMapOutput":
        ids = [c.id for c in self.concepts]
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        if dupes:
            raise ValueError(f"concept ids must be unique; duplicated: {dupes}")
        known = set(ids)
        unknown = sorted({x for r in self.relations for x in (r.source, r.target) if x not in known})
        if unknown:
            raise ValueError(f"relations reference unknown concept ids: {unknown}")
        if any(r.source == r.target for r in self.relations):
            raise ValueError("a relation cannot connect a concept to itself")
        seen: set[tuple[str, str]] = set()
        unique = []
        for r in self.relations:
            key = tuple(sorted((r.source, r.target)))
            if key not in seen:
                seen.add(key)
                unique.append(r)
        self.relations = unique
        return self

    def cited_pages(self) -> set[int]:
        return {p for c in self.concepts for p in c.page_numbers}

