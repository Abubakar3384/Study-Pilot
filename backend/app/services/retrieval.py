"""Lexical passage retrieval (BM25) over one document's pages.

Passages never span pages, so every retrieved passage has exactly one page number.
"""

import math
import re
from collections import Counter
from dataclasses import dataclass

_TOKEN = re.compile(r"[a-z0-9]+")
_SPLIT = re.compile(r"(?<=[.!?])\s+|\n\s*\n")
STOPWORDS = frozenset(
    "a an and are as at be but by can do does for from has have how i if in into is it its of on "
    "or so that the their there these this to was were what when where which who why will with "
    "you your about explain tell me".split()
)


@dataclass(frozen=True)
class Passage:
    page_number: int
    text: str
    score: float = 0.0


def tokenize(text: str) -> list[str]:
    out = []
    for tok in _TOKEN.findall(text.lower()):
        if tok in STOPWORDS:
            continue
        if len(tok) > 4 and tok.endswith("s") and not tok.endswith("ss"):
            tok = tok[:-1]
        out.append(tok)
    return out


def chunk_pages(pages: list[tuple[int, str]], max_chars: int = 700) -> list[Passage]:
    chunks: list[Passage] = []
    for page_number, text in pages:
        buf = ""
        for piece in _SPLIT.split(text):
            piece = " ".join(piece.split())
            if not piece:
                continue
            if buf and len(buf) + len(piece) + 1 > max_chars:
                chunks.append(Passage(page_number, buf))
                buf = ""
            buf = f"{buf} {piece}".strip()
            while len(buf) > max_chars:
                chunks.append(Passage(page_number, buf[:max_chars]))
                buf = buf[max_chars:]
        if buf:
            chunks.append(Passage(page_number, buf))
    return chunks


def search(pages: list[tuple[int, str]], query: str, top_k: int = 5, k1: float = 1.5, b: float = 0.75) -> list[Passage]:
    passages = chunk_pages(pages)
    q_terms = set(tokenize(query))
    if not passages or not q_terms:
        return []
    docs = [Counter(tokenize(p.text)) for p in passages]
    n = len(docs)
    avgdl = sum(sum(d.values()) for d in docs) / n or 1.0
    df = Counter(t for d in docs for t in q_terms if t in d)

    scored = []
    for passage, tf in zip(passages, docs):
        dl = sum(tf.values())
        score = 0.0
        for t in q_terms:
            if t not in tf:
                continue
            idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
            score += idf * tf[t] * (k1 + 1) / (tf[t] + k1 * (1 - b + b * dl / avgdl))
        if score > 0:
            scored.append(Passage(passage.page_number, passage.text, round(score, 4)))
    scored.sort(key=lambda p: (-p.score, p.page_number))
    return scored[:top_k]
