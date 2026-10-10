from pathlib import Path

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_settings
from app.config import Settings
from app.db.models import DocumentStar
from app.errors import FileTooLargeError, NotFoundError
from app.schemas import DocumentList, DocumentOut, PageOut
from app.services import documents as svc

router = APIRouter(prefix="/api/documents", tags=["documents"])

CHUNK = 1024 * 1024


async def _read_limited(upload: UploadFile, limit: int) -> bytes:
    data = bytearray()
    while chunk := await upload.read(CHUNK):
        data.extend(chunk)
        if len(data) > limit:
            raise FileTooLargeError(f"File exceeds the {limit // (1024 * 1024)} MB limit.")
    return bytes(data)


@router.post(
    "",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a PDF",
    description=(
        "multipart/form-data with a `file` field. Non-PDF or empty files return 422 `invalid_pdf`; "
        "oversized files return 413. A PDF whose text cannot be extracted (corrupt, encrypted, "
        "scanned) is still stored, with `status: \"failed\"` and an `error` message."
    ),
)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    data = await _read_limited(file, settings.max_upload_bytes)
    return svc.create_document(db, settings, file.filename, data)


@router.get("", response_model=DocumentList, summary="List documents (newest first)")
def list_documents(db: Session = Depends(get_db)):
    return {"items": svc.list_documents(db)}


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: str, db: Session = Depends(get_db)):
    return svc.get_document(db, document_id)


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a document and everything generated from it",
)
def delete_document(document_id: str, db: Session = Depends(get_db)):
    svc.delete_document(db, document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{document_id}/reprocess",
    response_model=DocumentOut,
    summary="Retry text extraction from the stored file",
)
def reprocess_document(
    document_id: str, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)
):
    return svc.process_document(db, settings, svc.get_document(db, document_id))


@router.get("/{document_id}/pages/{page_number}", response_model=PageOut, summary="Text of one page (1-based)")
def get_page(document_id: str, page_number: int, db: Session = Depends(get_db)):
    return svc.get_page(db, document_id, page_number)


@router.get(
    "/{document_id}/file",
    response_class=FileResponse,
    summary="The original PDF, for the browser's built-in viewer",
    responses={200: {"content": {"application/pdf": {}}}},
)
def get_file(document_id: str, db: Session = Depends(get_db)):
    doc = svc.get_document(db, document_id)
    path = Path(doc.stored_path)
    if not path.is_file():
        raise NotFoundError("The stored PDF file is missing.")
    return FileResponse(path, media_type="application/pdf", filename=doc.filename, content_disposition_type="inline")


@router.put("/{document_id}/star", response_model=DocumentOut, summary="Star a document")
def star_document(document_id: str, db: Session = Depends(get_db)):
    doc = svc.get_document(db, document_id)
    if doc.star is None:
        doc.star = DocumentStar(document_id=doc.id)
        db.commit()
    return doc


@router.delete("/{document_id}/star", response_model=DocumentOut, summary="Remove a document's star")
def unstar_document(document_id: str, db: Session = Depends(get_db)):
    doc = svc.get_document(db, document_id)
    if doc.star is not None:
        doc.star = None
        db.commit()
    return doc

