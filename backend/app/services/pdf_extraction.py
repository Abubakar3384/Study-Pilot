"""Page-aware PDF text extraction with PyMuPDF. Page numbers are 1-based."""

import re
from dataclasses import dataclass

import pymupdf

PDF_MAGIC = b"%PDF-"


class ExtractionError(Exception):
    """The file looked like a PDF but its text could not be extracted."""


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str


def looks_like_pdf(data: bytes) -> bool:
    # The spec allows the header anywhere in the first 1024 bytes.
    return PDF_MAGIC in data[:1024]


def _clean(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"-\n(?=[a-z])", "", text)  # re-join hyphenated line breaks
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pages(data: bytes, max_pages: int = 500, min_chars: int = 20) -> list[ExtractedPage]:
    if not looks_like_pdf(data):
        raise ExtractionError("File is not a PDF.")
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:  # PyMuPDF raises several types for corrupt input
        raise ExtractionError(f"PDF could not be opened (it may be corrupt): {exc}") from exc

    with doc:
        if doc.needs_pass:
            raise ExtractionError("PDF is password-protected; upload an unlocked copy.")
        if doc.page_count == 0:
            raise ExtractionError("PDF has no pages.")
        if doc.page_count > max_pages:
            raise ExtractionError(f"PDF has {doc.page_count} pages; the limit is {max_pages}.")
        pages = []
        try:
            for index, page in enumerate(doc):
                pages.append(ExtractedPage(page_number=index + 1, text=_clean(page.get_text("text"))))
        except Exception as exc:
            raise ExtractionError(f"Text extraction failed on page {len(pages) + 1}: {exc}") from exc

    if sum(len(p.text) for p in pages) < min_chars:
        raise ExtractionError(
            "No extractable text found. The PDF may be scanned images; OCR is not supported yet."
        )
    return pages
