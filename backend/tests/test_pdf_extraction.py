import pytest

from app.services.pdf_extraction import ExtractionError, extract_pages
from tests.conftest import SAMPLE_PAGES, make_pdf


def test_extracts_text_with_one_based_page_numbers(sample_pdf):
    pages = extract_pages(sample_pdf)
    assert [p.page_number for p in pages] == [1, 2, 3, 4]
    assert "chloroplasts" in pages[0].text
    assert pages[1].text == ""  # blank page kept so later page numbers stay correct
    assert "powerhouse" in pages[2].text
    assert "Krebs cycle" in pages[3].text


def test_text_is_not_attributed_to_the_wrong_page(sample_pdf):
    pages = extract_pages(sample_pdf)
    assert "Mitochondria" not in pages[0].text
    assert "Photosynthesis" not in pages[2].text


def test_rejects_non_pdf_bytes():
    with pytest.raises(ExtractionError, match="not a PDF"):
        extract_pages(b"hello, I am a text file")


def test_rejects_corrupt_pdf():
    with pytest.raises(ExtractionError, match="could not be opened|no pages"):
        extract_pages(b"%PDF-1.7\n" + b"\x00garbage" * 50)


def test_rejects_password_protected_pdf():
    with pytest.raises(ExtractionError, match="password"):
        extract_pages(make_pdf(SAMPLE_PAGES, password="secret"))


def test_rejects_pdf_without_extractable_text():
    with pytest.raises(ExtractionError, match="No extractable text"):
        extract_pages(make_pdf(["", ""]))


def test_rejects_pdf_over_page_limit():
    with pytest.raises(ExtractionError, match="limit is 2"):
        extract_pages(make_pdf(["one page of text here", "two", "three"]), max_pages=2)
