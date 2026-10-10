"""Source-grounded document chat.

Flow: retrieve passages from *this* document -> ask the model to answer from them and name
the pages it used -> reject any page that wasn't retrieved -> build citations server-side
from the retrieved passage text. Citations therefore always point at real pages of the
right document, with a snippet that really appears on that page.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import prompts
from app.ai.base import LLMRequest, Task
from app.ai.runner import AIRunner
from app.ai.schemas import ChatOutput
from app.db.models import Conversation, Document, Message
from app.errors import NotFoundError
from app.services.retrieval import Passage, search

NO_MATCH_ANSWER = (
    "I couldn't find anything about that in this document. Try rephrasing, or ask about a "
    "topic the document covers."
)
SNIPPET_CHARS = 300


def build_citations(cited_pages: list[int], passages: list[Passage]) -> list[dict]:
    best: dict[int, Passage] = {}
    for p in passages:  # passages are sorted best-first
        best.setdefault(p.page_number, p)
    citations = []
    for page in dict.fromkeys(cited_pages):
        if page in best:
            text = best[page].text
            snippet = text if len(text) <= SNIPPET_CHARS else text[: SNIPPET_CHARS - 1].rstrip() + "…"
            citations.append({"page_number": page, "snippet": snippet})
    return citations


class ChatService:
    def __init__(self, db: Session, runner: AIRunner, top_k: int = 5, history_messages: int = 6,
                 max_tokens: int = 4096):
        self.db = db
        self.runner = runner
        self.top_k = top_k
        self.history_messages = history_messages
        self.max_tokens = max_tokens

    def get_conversation(self, doc: Document, conversation_id: str) -> Conversation:
        convo = self.db.get(Conversation, conversation_id)
        if convo is None or convo.document_id != doc.id:
            raise NotFoundError(f"Conversation {conversation_id} not found for this document.")
        return convo

    def list_conversations(self, doc: Document) -> list[Conversation]:
        return list(self.db.scalars(
            select(Conversation).where(Conversation.document_id == doc.id)
            .order_by(Conversation.created_at.desc())
        ))

    def ask(self, doc: Document, question: str, conversation_id: str | None) -> tuple[Conversation, Message]:
        convo = self.get_conversation(doc, conversation_id) if conversation_id else None
        history = [
            {"role": m.role, "content": m.content}
            for m in (convo.messages[-self.history_messages:] if convo and self.history_messages else [])
        ]

        pages = [(p.page_number, p.text) for p in doc.pages if p.text.strip()]
        passages = search(pages, question, self.top_k)

        if not passages:
            answer, citations = NO_MATCH_ANSWER, []
        else:
            ctx = [{"page_number": p.page_number, "text": p.text} for p in passages]
            out = self.runner.generate(
                LLMRequest(
                    Task.CHAT, prompts.BASE_SYSTEM, prompts.chat_prompt(question, ctx, history),
                    {"question": question, "passages": ctx, "history": history}, self.max_tokens,
                ),
                ChatOutput,
                valid_pages={p.page_number for p in passages},
            )
            answer, citations = out.answer, build_citations(out.cited_pages_, passages)

        # Persist only after the AI call succeeded, so a failed call leaves no half-written turn.
        if convo is None:
            convo = Conversation(document_id=doc.id, title=question[:80])
            self.db.add(convo)
        seq = len(convo.messages)
        convo.messages.append(Message(seq=seq, role="user", content=question, citations=[]))
        reply = Message(seq=seq + 1, role="assistant", content=answer, citations=citations)
        convo.messages.append(reply)
        self.db.commit()
        return convo, reply
