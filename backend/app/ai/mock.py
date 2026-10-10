"""Deterministic, offline provider for development and tests.

It builds plausible, schema-valid JSON straight from the document text in
`LLMRequest.payload`. The `mode` setting simulates failures:

    ok              valid output (default)
    provider_error  every call raises a retryable provider error (outage / 5xx / 429)
    auth_error      every call raises an authentication error
    invalid_json    every reply is not JSON
    schema_invalid  every reply is JSON that does not match the schema
    bad_page        every reply cites a page that does not exist in the document
    flaky           the first `fail_times` calls raise a retryable error, then ok
    flaky_invalid   the first `fail_times` replies are not JSON, then ok
"""

import json
import re
import threading
from typing import Any

from app.ai.base import LLMRequest, ProviderAuthError, ProviderError, Task

MODES = {
    "ok", "provider_error", "auth_error", "invalid_json",
    "schema_invalid", "bad_page", "flaky", "flaky_invalid",
}

_SENTENCE = re.compile(r"(?<=[.!?])\s+|\n+")
_WORD = re.compile(r"[A-Za-z][A-Za-z-]{4,}")
_STOPWORDS = {
    "about", "above", "after", "again", "against", "along", "also", "although", "among", "another",
    "around", "because", "before", "being", "below", "between", "both", "called", "cannot", "could",
    "different", "during", "each", "either", "every", "first", "following", "from", "further", "given",
    "having", "however", "important", "include", "includes", "including", "into", "itself", "known",
    "large", "later", "least", "might", "mostly", "other", "others", "their", "there", "these", "they",
    "thing", "things", "those", "three", "through", "under", "until", "usually", "various", "where",
    "whether", "which", "while", "within", "without", "would", "second", "small", "since", "still",
    "takes", "place", "using", "often", "example", "shown", "figure", "chapter", "section",
}


def _sentences(text: str) -> list[str]:
    out = []
    for s in _SENTENCE.split(text):
        s = " ".join(s.split())
        if len(s) >= 12:
            out.append(s[:280])
    return out


class MockProvider:
    name = "mock"

    def __init__(self, mode: str = "ok", fail_times: int = 2):
        if mode not in MODES:
            raise ValueError(f"unknown mock mode {mode!r}; expected one of {sorted(MODES)}")
        self.mode = mode
        self.fail_times = fail_times
        self.calls = 0
        self.requests: list[LLMRequest] = []
        self._lock = threading.Lock()

    def complete(self, request: LLMRequest) -> str:
        with self._lock:
            self.calls += 1
            call_no = self.calls
            self.requests.append(request)

        mode = self.mode
        if mode == "flaky":
            mode = "provider_error" if call_no <= self.fail_times else "ok"
        elif mode == "flaky_invalid":
            mode = "invalid_json" if call_no <= self.fail_times else "ok"

        if mode == "provider_error":
            raise ProviderError("mock provider: simulated outage", retryable=True)
        if mode == "auth_error":
            raise ProviderAuthError("mock provider: simulated invalid API key")
        if mode == "invalid_json":
            return "Sure! Here is your answer, but not in JSON."
        if mode == "schema_invalid":
            return json.dumps({"unexpected": "shape"})

        data = self._build(request)
        if mode == "bad_page":
            data = _corrupt_pages(data)
        return json.dumps(data)

    # ------------------------------------------------------------------ builders

    def _build(self, req: LLMRequest) -> dict[str, Any]:
        p = req.payload
        if req.task == Task.CHAT:
            return self._chat(p["question"], p["passages"])
        pages = [(pg["page_number"], _sentences(pg["text"])) for pg in p["pages"]]
        pages = [(n, s) for n, s in pages if s] or [(p["pages"][0]["page_number"], ["(no text)"])]
        if req.task == Task.SUMMARY:
            return self._summary(pages)
        if req.task == Task.NOTES:
            return self._notes(pages)
        if req.task == Task.QUIZ:
            return self._quiz(pages, int(p.get("num_questions", 5)))
        if req.task == Task.FLASHCARDS:
            return self._flashcards(pages, int(p.get("count", 10)))
        if req.task == Task.CONCEPTS:
            return self._concepts(pages)
        raise ProviderError(f"mock provider: unknown task {req.task}", retryable=False)

    def _summary(self, pages):
        overview = " ".join(s[0] for _, s in pages[:3])
        return {
            "overview": overview,
            "key_points": [{"text": s[0], "page_number": n} for n, s in pages[:8]],
        }

    def _notes(self, pages):
        return {
            "title": "Study notes",
            "sections": [
                {"heading": f"Page {n}", "bullets": s[:5], "page_number": n} for n, s in pages[:12]
            ],
        }

    def _quiz(self, pages, num_questions):
        pool = [sent for _, s in pages for sent in s]
        questions = []
        for i in range(num_questions):
            n, sents = pages[i % len(pages)]
            correct = sents[(i // len(pages)) % len(sents)]
            distractors = [x for x in pool if x.casefold() != correct.casefold()]
            fillers = [f"This statement is not made in the material (option {k})." for k in range(1, 4)]
            options = [correct] + (distractors[i : i + 3] + fillers)[:3]
            # dedupe while preserving order, then refill from fillers if needed
            seen, uniq = set(), []
            for o in options + fillers:
                if o.casefold() not in seen:
                    seen.add(o.casefold())
                    uniq.append(o)
            options = uniq[:4]
            correct_index = i % 4
            options[0], options[correct_index] = options[correct_index], options[0]
            questions.append(
                {
                    "question": f"Which statement is supported by page {n} of the document?",
                    "options": options,
                    "correct_index": correct_index,
                    "explanation": f"Page {n} states: \"{correct}\"",
                    "page_number": n,
                }
            )
        return {"title": "Practice quiz", "questions": questions}

    def _flashcards(self, pages, count):
        cards = []
        flat = [(n, sent) for n, s in pages for sent in s]
        for n, sent in flat[:count]:
            words = sent.split()
            cards.append(
                {
                    "front": f"Complete the idea from page {n}: {' '.join(words[:5])} …",
                    "back": sent,
                    "page_number": n,
                }
            )
        return {"cards": cards}

    def _concepts(self, pages):
        """Salient words per page become concepts; concepts sharing a page are related."""
        counts: dict[str, int] = {}
        where: dict[str, list[int]] = {}
        for n, sents in pages:
            for word in _WORD.findall(" ".join(sents)):
                w = word.lower()
                if w in _STOPWORDS:
                    continue
                counts[w] = counts.get(w, 0) + 1
                if n not in where.setdefault(w, []):
                    where[w].append(n)

        chosen: list[str] = []
        for n, _ in pages:
            on_page = sorted((w for w in counts if n in where[w] and w not in chosen), key=lambda w: (-counts[w], w))
            chosen.extend(on_page[:2])
            if len(chosen) >= 24:
                break
        if len(chosen) < 3:
            chosen = [f"page-{n}" for n, _ in pages][:3]
            while len(chosen) < 3:
                chosen.append(f"topic-{len(chosen) + 1}")

        ranked = sorted(chosen, key=lambda w: (-counts.get(w, 0), w))
        n_key = max(1, len(ranked) // 5)
        importance = {w: 3 if i < n_key else 2 if i < n_key * 3 else 1 for i, w in enumerate(ranked)}
        first_page = pages[0][0]

        concepts = []
        for w in chosen:
            pgs = where.get(w, [first_page])[:10]
            sentence = next((x for _, sents in pages for x in sents if w in x.lower()), f"{w.title()} appears in the document.")
            concepts.append({
                "id": re.sub(r"[^a-z0-9-]", "-", w)[:48].strip("-") or "concept",
                "title": w.replace("-", " ").capitalize(),
                "explanation": sentence,
                "page_numbers": pgs,
                "importance": importance[w],
            })

        relations = []
        for i, a in enumerate(concepts):
            for b in concepts[i + 1:]:
                if set(a["page_numbers"]) & set(b["page_numbers"]) and len(relations) < 60:
                    kind = "part_of" if a["importance"] > b["importance"] else "related"
                    relations.append({"source": a["id"], "target": b["id"], "kind": kind})
        return {"concepts": concepts, "relations": relations}

    def _chat(self, question, passages):
        if not passages:
            return {"answer": "The document does not cover this.", "answerable": False, "cited_pages": []}
        top = passages[0]
        first = (_sentences(top["text"]) or [top["text"][:280]])[0]
        return {
            "answer": f"According to page {top['page_number']}: {first}",
            "answerable": True,
            "cited_pages": [top["page_number"]],
        }


def _corrupt_pages(obj):
    if isinstance(obj, dict):
        return {
            k: (
                9999 if k == "page_number"
                else [9999] if k in ("cited_pages", "page_numbers")
                else _corrupt_pages(v)
            )
            for k, v in obj.items()
        } | ({"answerable": True} if "cited_pages" in obj else {})
    if isinstance(obj, list):
        return [_corrupt_pages(x) for x in obj]
    return obj
