"""Document lifecycle: validate upload, store file, extract pages, track status, delete."""

import hashlib
import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import Document, DocumentStatus, Page, new_id
from app.errors import DocumentNotReadyError, InvalidPDFError, NotFoundError
from app.services.pdf_extraction import ExtractionError, extract_pages, looks_like_pdf

log = logging.getLogger(__name__)


def _safe_filename(name: str | None) -> str:
    name = Path(name or "document.pdf").name.strip() or "document.pdf"
    return name[:255]


def create_document(db: Session, settings: Settings, filename: str | None, data: bytes) -> Document:
    """Validate and store an upload, then extract it.

    Files that aren't PDFs are rejected outright (InvalidPDFError, nothing stored). PDFs whose
    text can't be extracted are stored with status "failed" and an error message, so the
    client can show the problem and call reprocess later.
    """
    if not data:
        raise InvalidPDFError("The uploaded file is empty.")
    if not looks_like_pdf(data):
        raise InvalidPDFError("The uploaded file is not a PDF.")

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    doc_id = new_id()
    path = settings.upload_dir / f"{doc_id}.pdf"
    path.write_bytes(data)

    doc = Document(
        id=doc_id,
        filename=_safe_filename(filename),
        stored_path=str(path),
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        status=DocumentStatus.PROCESSING,
    )
    db.add(doc)
    db.commit()
    return process_document(db, settings, doc, data)


def process_document(db: Session, settings: Settings, doc: Document, data: bytes | None = None) -> Document:
    if data is None:
        try:
            data = Path(doc.stored_path).read_bytes()
        except OSError as exc:
            doc.status, doc.error = DocumentStatus.FAILED, f"Stored file is missing: {exc}"
            db.commit()
            return doc

    doc.status, doc.error = DocumentStatus.PROCESSING, None
    doc.pages.clear()
    db.flush()
    try:
        pages = extract_pages(data, settings.max_pages, settings.min_extracted_chars)
    except ExtractionError as exc:
        log.info("Extraction failed for %s: %s", doc.id, exc)
        doc.status, doc.error, doc.page_count = DocumentStatus.FAILED, str(exc), 0
        db.commit()
        return doc

    doc.pages.extend(Page(page_number=p.page_number, text=p.text) for p in pages)
    doc.page_count = len(pages)
    doc.status = DocumentStatus.READY
    db.commit()
    return doc


def get_document(db: Session, document_id: str) -> Document:
    doc = db.get(Document, document_id)
    if doc is None:
        raise NotFoundError(f"Document {document_id} not found.")
    return doc


def get_ready_document(db: Session, document_id: str) -> Document:
    doc = get_document(db, document_id)
    if doc.status != DocumentStatus.READY:
        detail = f" ({doc.error})" if doc.error else ""
        raise DocumentNotReadyError(f"Document is {doc.status}{detail}.")
    return doc


def list_documents(db: Session) -> list[Document]:
    return list(db.scalars(select(Document).order_by(Document.created_at.desc())))


def get_page(db: Session, document_id: str, page_number: int) -> Page:
    doc = get_document(db, document_id)
    page = db.scalar(select(Page).where(Page.document_id == doc.id, Page.page_number == page_number))
    if page is None:
        raise NotFoundError(
            f"Page {page_number} not found; document has {doc.page_count} extracted pages."
        )
    return page


def delete_document(db: Session, document_id: str) -> None:
    doc = get_document(db, document_id)
    path = Path(doc.stored_path)
    db.delete(doc)
    db.commit()
    try:
        path.unlink(missing_ok=True)
    except OSError as exc:
        log.warning("Could not delete stored file %s: %s", path, exc)
