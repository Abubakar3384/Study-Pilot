from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_chat, get_db
from app.api.study import AI_ERRORS
from app.schemas import ChatCreate, ChatResponse, ConversationList, ConversationOut
from app.services.chat import ChatService
from app.services.documents import get_document, get_ready_document

router = APIRouter(prefix="/api/documents/{document_id}", tags=["chat"])


@router.post("/chat", response_model=ChatResponse, responses=AI_ERRORS,
             summary="Ask a question answered from retrieved passages, with page citations")
def chat(document_id: str, body: ChatCreate, db: Session = Depends(get_db),
         service: ChatService = Depends(get_chat)):
    doc = get_ready_document(db, document_id)
    convo, reply = service.ask(doc, body.message, body.conversation_id)
    return {"conversation_id": convo.id, "message": reply}


@router.get("/conversations", response_model=ConversationList)
def list_conversations(document_id: str, db: Session = Depends(get_db),
                       service: ChatService = Depends(get_chat)):
    return {"items": service.list_conversations(get_document(db, document_id))}


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
def get_conversation(document_id: str, conversation_id: str, db: Session = Depends(get_db),
                     service: ChatService = Depends(get_chat)):
    return service.get_conversation(get_document(db, document_id), conversation_id)
