"""Routes added for the frontend: concept map, original file, edited notes, stars, activity, answer check."""

import json

import pytest
from pydantic import ValidationError

from app.ai.schemas import ConceptMapOutput
from tests.conftest import upload

VALID_PAGES = {1, 3, 4}


# --------------------------------------------------------------- concept map

def test_concept_map_generated_validated_and_latest_returned(client, ready_doc):
    doc_id = ready_doc["id"]
    assert client.get(f"/api/documents/{doc_id}/concepts").status_code == 404

    resp = client.post(f"/api/documents/{doc_id}/concepts")
    assert resp.status_code == 201, resp.text
    data = resp.json()
    ids = {c["id"] for c in data["concepts"]}
    assert len(data["concepts"]) >= 3
    for c in data["concepts"]:
        assert set(c["page_numbers"]) <= VALID_PAGES and 1 <= c["importance"] <= 3
    for r in data["relations"]:
        assert r["source"] in ids and r["target"] in ids and r["source"] != r["target"]

    assert client.get(f"/api/documents/{doc_id}/concepts").json()["id"] == data["id"]


def test_concept_map_rejects_bad_pages_and_saves_nothing(make_client, sample_pdf):
    client = make_client(mode="bad_page")
    doc_id = upload(client, sample_pdf).json()["id"]
    resp = client.post(f"/api/documents/{doc_id}/concepts")
    assert resp.status_code == 502 and resp.json()["error"]["code"] == "ai_invalid_output"
    assert client.get(f"/api/documents/{doc_id}/concepts").status_code == 404


def test_concept_map_requires_ready_document(client, sample_pdf):
    from tests.conftest import SAMPLE_PAGES, make_pdf

    doc = upload(client, make_pdf(SAMPLE_PAGES, password="pw")).json()
    assert client.post(f"/api/documents/{doc['id']}/concepts").status_code == 409


def _concept(cid, pages=(1,), importance=2):
    return {"id": cid, "title": cid.title(), "explanation": "x", "page_numbers": list(pages), "importance": importance}


def test_concept_map_schema_rules():
    ok = ConceptMapOutput.model_validate({
        "concepts": [_concept("a", (3, 1, 3)), _concept("b"), _concept("c")],
        "relations": [
            {"source": "a", "target": "b", "kind": "part_of"},
            {"source": "b", "target": "a", "kind": "related"},  # duplicate pair, dropped
        ],
    })
    assert ok.concepts[0].page_numbers == [1, 3]
    assert len(ok.relations) == 1 and ok.cited_pages() == {1, 3}

    bad_cases = [
        {"concepts": [_concept("a"), _concept("a"), _concept("c")]},  # duplicate ids
        {"concepts": [_concept("a"), _concept("b"), _concept("c")], "relations": [{"source": "a", "target": "zz"}]},
        {"concepts": [_concept("a"), _concept("b"), _concept("c")], "relations": [{"source": "a", "target": "a"}]},
        {"concepts": [_concept("Not A Slug"), _concept("b"), _concept("c")]},
        {"concepts": [_concept("a"), _concept("b")]},  # too few
    ]
    for case in bad_cases:
        with pytest.raises(ValidationError):
            ConceptMapOutput.model_validate(case)


# ------------------------------------------------------------- original file

def test_original_file_served_inline(client, ready_doc, sample_pdf):
    resp = client.get(f"/api/documents/{ready_doc['id']}/file")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.headers["content-disposition"].startswith("inline")
    assert resp.content == sample_pdf


def test_original_file_missing_is_404(client, ready_doc, settings):
    (settings.upload_dir / f"{ready_doc['id']}.pdf").unlink()
    assert client.get(f"/api/documents/{ready_doc['id']}/file").status_code == 404
    assert client.get("/api/documents/nope/file").status_code == 404


# -------------------------------------------------------------- edited notes

def test_edited_notes_become_latest_version(client, ready_doc):
    doc_id = ready_doc["id"]
    generated = client.post(f"/api/documents/{doc_id}/notes").json()
    assert generated["source"] == "ai"

    edit = {"title": "My notes", "sections": [{"heading": "Cells", "bullets": ["Mitochondria make ATP"], "page_number": 3}]}
    saved = client.put(f"/api/documents/{doc_id}/notes", json=edit)
    assert saved.status_code == 200, saved.text
    assert saved.json()["source"] == "user" and saved.json()["id"] != generated["id"]

    latest = client.get(f"/api/documents/{doc_id}/notes").json()
    assert latest["title"] == "My notes" and latest["sections"][0]["bullets"] == ["Mitochondria make ATP"]


def test_edited_notes_validation(client, ready_doc):
    doc_id = ready_doc["id"]
    out_of_range = {"title": "T", "sections": [{"heading": "H", "bullets": ["b"], "page_number": 99}]}
    resp = client.put(f"/api/documents/{doc_id}/notes", json=out_of_range)
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "invalid_request"

    empty_bullet = {"title": "T", "sections": [{"heading": "H", "bullets": ["  "], "page_number": 1}]}
    assert client.put(f"/api/documents/{doc_id}/notes", json=empty_bullet).status_code == 422
    assert client.put(f"/api/documents/{doc_id}/notes", json={"title": "T", "sections": []}).status_code == 422


# --------------------------------------------------------------------- stars

def test_star_and_unstar_are_idempotent_and_listed(client, ready_doc):
    doc_id = ready_doc["id"]
    assert ready_doc["starred"] is False
    assert client.put(f"/api/documents/{doc_id}/star").json()["starred"] is True
    assert client.put(f"/api/documents/{doc_id}/star").json()["starred"] is True
    assert client.get("/api/documents").json()["items"][0]["starred"] is True
    assert client.delete(f"/api/documents/{doc_id}/star").json()["starred"] is False
    assert client.delete(f"/api/documents/{doc_id}/star").json()["starred"] is False
    assert client.put("/api/documents/nope/star").status_code == 404


def test_deleting_document_removes_its_star(client, ready_doc):
    client.put(f"/api/documents/{ready_doc['id']}/star")
    client.delete(f"/api/documents/{ready_doc['id']}")
    with client.app.state.engine.connect() as conn:
        assert conn.exec_driver_sql("select count(*) from document_stars").scalar() == 0


# ------------------------------------------------------------------ activity

def test_activity_lists_real_events_newest_first(client, ready_doc):
    doc_id = ready_doc["id"]
    quiz = client.post(f"/api/documents/{doc_id}/quizzes", json={"num_questions": 2}).json()
    answers = [{"question_id": q["id"], "selected_index": 0} for q in quiz["questions"]]
    client.post(f"/api/quizzes/{quiz['id']}/attempts", json={"answers": answers})
    client.post(f"/api/documents/{doc_id}/chat", json={"message": "What do mitochondria produce?"})
    cards = client.post(f"/api/documents/{doc_id}/flashcards", json={"count": 3}).json()["items"]
    for card in cards[:2]:
        client.post(f"/api/flashcards/{card['id']}/reviews", json={"rating": "good"})

    items = client.get("/api/activity").json()["items"]
    types = [i["type"] for i in items]
    assert set(types) == {"document_uploaded", "quiz_attempt", "conversation", "flashcard_review"}
    times = [i["at"] for i in items]
    assert times == sorted(times, reverse=True)
    review = next(i for i in items if i["type"] == "flashcard_review")
    assert review["count"] == 2 and review["document_filename"] == "biology.pdf"
    attempt = next(i for i in items if i["type"] == "quiz_attempt")
    assert attempt["total"] == 2 and attempt["quiz_id"] == quiz["id"]

    assert len(client.get("/api/activity?limit=1").json()["items"]) == 1
    assert client.get("/api/activity?limit=0").status_code == 422


# -------------------------------------------------------------- answer check

def test_answer_check_reveals_one_answer_and_records_nothing(client, ready_doc):
    quiz = client.post(f"/api/documents/{ready_doc['id']}/quizzes", json={"num_questions": 2}).json()
    q = quiz["questions"][0]
    resp = client.post(f"/api/quizzes/{quiz['id']}/questions/{q['id']}/check", json={"selected_index": 0})
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_correct"] == (body["correct_index"] == 0)
    assert body["explanation"] and body["page_number"] in VALID_PAGES
    assert client.get(f"/api/quizzes/{quiz['id']}/attempts").json()["items"] == []


def test_answer_check_validation(client, ready_doc):
    quiz = client.post(f"/api/documents/{ready_doc['id']}/quizzes", json={"num_questions": 1}).json()
    q = quiz["questions"][0]
    base = f"/api/quizzes/{quiz['id']}/questions"
    assert client.post(f"{base}/{q['id']}/check", json={"selected_index": 4}).status_code == 422
    assert client.post(f"{base}/nope/check", json={"selected_index": 0}).status_code == 404
    skipped = client.post(f"{base}/{q['id']}/check", json={"selected_index": None}).json()
    assert skipped["is_correct"] is False


def test_focused_quiz_uses_only_requested_pages_and_neighbours(client, ready_doc):
    doc_id = ready_doc["id"]
    quiz = client.post(f"/api/documents/{doc_id}/quizzes", json={"num_questions": 3, "pages": [4]}).json()
    assert {q["page_number"] for q in quiz["questions"]} <= {3, 4}
    resp = client.post(f"/api/documents/{doc_id}/quizzes", json={"num_questions": 2, "pages": [40]})
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "invalid_request"


def test_mock_concepts_are_deterministic(client, ready_doc):
    a = client.post(f"/api/documents/{ready_doc['id']}/concepts").json()
    b = client.post(f"/api/documents/{ready_doc['id']}/concepts").json()
    assert json.dumps(a["concepts"]) == json.dumps(b["concepts"])
