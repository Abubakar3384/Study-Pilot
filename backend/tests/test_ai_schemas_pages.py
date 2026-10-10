import pytest
from pydantic import ValidationError

from app.ai.schemas import NotesOutput


def _notes(page):
    return {"title": "T", "sections": [{"heading": "H", "paragraphs": ["p"], "page_number": page}]}


@pytest.mark.parametrize("page", [3, "3", "Page 3", "p. 3", "3-4", "pages 3, 4"])
def test_page_numbers_written_as_text_are_accepted(page):
    assert NotesOutput.model_validate(_notes(page)).sections[0].page_number == 3


@pytest.mark.parametrize("page", ["", "none", 0, "page 0"])
def test_missing_or_invalid_pages_are_still_rejected(page):
    with pytest.raises(ValidationError):
        NotesOutput.model_validate(_notes(page))
