from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas import ActivityList
from app.services.activity import recent_activity

router = APIRouter(prefix="/api", tags=["activity"])


@router.get("/activity", response_model=ActivityList, summary="Recent study activity across documents (newest first)")
def list_activity(limit: int = Query(default=20, ge=1, le=100), db: Session = Depends(get_db)):
    return {"items": recent_activity(db, limit)}
