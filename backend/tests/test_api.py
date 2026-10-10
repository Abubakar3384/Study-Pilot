"""End-to-end API tests against a real SQLite file and the mock AI provider."""

from pathlib import Path

from tests.conftest import SAMPLE_PAGES, make_pdf, upload

VALID_PAGES = {1, 3, 4}  # pages of SAMPLE_PAGES that have text


# ------------------------------------------------------------------ documents

def test_upload_list_get_and_page(client, ready_doc):
    assert ready_doc["page_count"] == 4 and ready_doc["filename"] == "biology.pdf"
    assert "stored_path" not in ready_doc and "sha256" not in ready_doc

    items = client.get("/api/documents").json()["items"]
    assert [d["id"] for d in items] == [ready_doc["id"]]
    assert client.get(f"/api/documents/{ready_doc['id']}").json()["status"] == "ready"

    page = client.get(f"/api/documents/{ready_doc['id']}/pages/3").json()
    assert page["page_number"] == 3 and "powerhouse" in page["text"]


def test_page_out_of_range_is_404(client, ready_doc):
    resp = client.get(f"/api/documents/{ready_doc['id']}/pages/5")
    assert resp.status_code == 404 and resp.json()["error"]["code"] == "not_found"


def test_non_pdf_upload_rejected_and_not_stored(client, settings):
    resp = upload(client, b"just text", name="notes.pdf")
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "invalid_pdf"
    assert client.get("/api/documents").json()["items"] == []
    assert not any(settings.upload_dir.glob("*.pdf")) if settings.upload_dir.exists() else True


def test_empty_upload_rejected(client):
    assert upload(client, b"").json()["error"]["code"] == "invalid_pdf"


def test_oversized_upload_rejected(client):
    resp = upload(client, b"%PDF-1.7\n" + b"x" * (1024 * 1024 + 1))
    assert resp.status_code == 413 and resp.json()["error"]["code"] == "file_too_large"


def test_unextractable_pdf_stored_as_failed_and_blocks_generation(client):
    resp = upload(client, make_pdf(SAMPLE_PAGES, password="pw"))
    assert resp.status_code == 201
    doc = resp.json()
    assert doc["status"] == "failed" and "password" in doc["error"]

    gen = client.post(f"/api/documents/{doc['id']}/summary")
    assert gen.status_code == 409 and gen.json()["error"]["code"] == "document_not_ready"

    again = client.post(f"/api/documents/{doc['id']}/reprocess").json()
    assert again["status"] == "failed"


def test_reprocess_succeeds_for_good_file(client, ready_doc):
    resp = client.post(f"/api/documents/{ready_doc['id']}/reprocess")
    assert resp.json()["status"] == "ready" and resp.json()["page_count"] == 4


def test_delete_removes_document_file_and_children(client, ready_doc, settings):
    doc_id = ready_doc["id"]
    client.post(f"/api/documents/{doc_id}/quizzes", json={"num_questions": 2})
    client.post(f"/api/documents/{doc_id}/chat", json={"message": "What do mitochondria produce?"})
    assert (settings.upload_dir / f"{doc_id}.pdf").exists()

    assert client.delete(f"/api/documents/{doc_id}").status_code == 204
    assert client.get(f"/api/documents/{doc_id}").status_code == 404
    assert not (settings.upload_dir / f"{doc_id}.pdf").exists()
    with client.app.state.engine.connect() as conn:
        for table in ("pages", "quizzes", "quiz_questions", "conversations", "messages"):
            assert conn.exec_driver_sql(f"select count(*) from {table}").scalar() == 0


def test_request_validation_uses_error_envelope(client, ready_doc):
    resp = client.post(f"/api/documents/{ready_doc['id']}/quizzes", json={"num_questions": 0})
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "invalid_request"


# ----------------------------------------------------------- summary / notes

def test_summary_generated_with_valid_pages_and_retrievable(client, ready_doc):
    doc_id = ready_doc["id"]
    assert client.get(f"/api/documents/{doc_id}/summary").status_code == 404
    resp = client.post(f"/api/documents/{doc_id}/summary")
    assert resp.status_code == 201
    body = resp.json()
    assert body["overview"] and body["key_points"]
    assert {k["page_number"] for k in body["key_points"]} <= VALID_PAGES
    assert client.get(f"/api/documents/{doc_id}/summary").json() == body


def test_notes_generated(client, ready_doc):
    body = client.post(f"/api/documents/{ready_doc['id']}/notes").json()
    assert body["sections"] and {s["page_number"] for s in body["sections"]} <= VALID_PAGES


# -------------------------------------------------------------------- quizzes

def test_quiz_hides_answers_then_attempt_scores_and_explains(client, ready_doc):
    quiz = client.post(f"/api/documents/{ready_doc['id']}/quizzes", json={"num_questions": 4}).json()
    assert len(quiz["questions"]) == 4
    for q in quiz["questions"]:
        assert len(q["options"]) == 4 and q["page_number"] in VALID_PAGES
        assert "correct_index" not in q and "explanation" not in q

    # Answer every question with option 0; the mock rotates the correct index 0,1,2,3.
    answers = [{"question_id": q["id"], "selected_index": 0} for q in quiz["questions"]]
    resp = client.post(f"/api/quizzes/{quiz['id']}/attempts", json={"answers": answers})
    assert resp.status_code == 201
    attempt = resp.json()
    assert (attempt["score"], attempt["total"], attempt["percentage"]) == (1, 4, 25.0)
    assert all(r["explanation"] for r in attempt["results"])
    assert [r["correct_index"] for r in attempt["results"]] == [0, 1, 2, 3]

    perfect = [{"question_id": r["question_id"], "selected_index": r["correct_index"]} for r in attempt["results"]]
    assert client.post(f"/api/quizzes/{quiz['id']}/attempts", json={"answers": perfect}).json()["score"] == 4

    history = client.get(f"/api/quizzes/{quiz['id']}/attempts").json()["items"]
    assert [a["score"] for a in history] == [1, 4]
    assert len(client.get(f"/api/documents/{ready_doc['id']}/quizzes").json()["items"]) == 1


def test_attempt_rejects_foreign_or_duplicate_questions(client, ready_doc):
    quiz = client.post(f"/api/documents/{ready_doc['id']}/quizzes", json={"num_questions": 2}).json()
    qid = quiz["questions"][0]["id"]
    url = f"/api/quizzes/{quiz['id']}/attempts"
    assert client.post(url, json={"answers": [{"question_id": "other", "selected_index": 0}]}).status_code == 422
    dup = [{"question_id": qid, "selected_index": 0}, {"question_id": qid, "selected_index": 1}]
    assert client.post(url, json={"answers": dup}).status_code == 422
    assert client.post(url, json={"answers": [{"question_id": qid, "selected_index": 9}]}).status_code == 422
    assert client.post("/api/quizzes/missing/attempts", json={"answers": []}).status_code == 404


# ----------------------------------------------------------------- flashcards

def test_flashcards_generate_list_and_review(client, ready_doc):
    doc_id = ready_doc["id"]
    cards = client.post(f"/api/documents/{doc_id}/flashcards", json={"count": 3}).json()["items"]
    assert len(cards) == 3 and {c["page_number"] for c in cards} <= VALID_PAGES
    assert len(client.get(f"/api/documents/{doc_id}/flashcards?due=true").json()["items"]) == 3

    reviewed = client.post(f"/api/flashcards/{cards[0]['id']}/reviews", json={"rating": "good"}).json()
    assert reviewed["repetitions"] == 1 and reviewed["interval_days"] == 1
    assert reviewed["last_rating"] == "good" and reviewed["last_reviewed_at"]

    due_now = client.get(f"/api/documents/{doc_id}/flashcards?due=true").json()["items"]
    assert cards[0]["id"] not in {c["id"] for c in due_now} and len(due_now) == 2

    assert client.post(f"/api/flashcards/{cards[0]['id']}/reviews", json={"rating": "meh"}).status_code == 422


# ----------------------------------------------------------------------- chat

def test_chat_answers_with_citations_from_this_document(client, ready_doc):
    doc_id = ready_doc["id"]
    resp = client.post(f"/api/documents/{doc_id}/chat", json={"message": "What do mitochondria produce?"})
    assert resp.status_code == 200
    body = resp.json()
    msg = body["message"]
    assert msg["role"] == "assistant" and msg["citations"]
    for cite in msg["citations"]:
        page = client.get(f"/api/documents/{doc_id}/pages/{cite['page_number']}").json()
        assert cite["snippet"].rstrip("…") in " ".join(page["text"].split())
    assert msg["citations"][0]["page_number"] == 3

    # follow-up in the same conversation; history is sent to the model
    follow = client.post(
        f"/api/documents/{doc_id}/chat",
        json={"message": "Where does the Krebs cycle run?", "conversation_id": body["conversation_id"]},
    ).json()
    assert follow["conversation_id"] == body["conversation_id"]
    assert client.provider.requests[-1].payload["history"][0]["content"] == "What do mitochondria produce?"

    convo = client.get(f"/api/documents/{doc_id}/conversations/{body['conversation_id']}").json()
    assert [m["role"] for m in convo["messages"]] == ["user", "assistant", "user", "assistant"]
    assert len(client.get(f"/api/documents/{doc_id}/conversations").json()["items"]) == 1


def test_chat_without_matching_passages_skips_ai_and_cites_nothing(client, ready_doc):
    calls_before = client.provider.calls
    msg = client.post(
        f"/api/documents/{ready_doc['id']}/chat", json={"message": "Explain quantum chromodynamics"}
    ).json()["message"]
    assert msg["citations"] == [] and "couldn't find" in msg["content"]
    assert client.provider.calls == calls_before


def test_conversation_cannot_be_used_with_another_document(client, ready_doc, sample_pdf):
    other = upload(client, sample_pdf, name="copy.pdf").json()
    convo_id = client.post(
        f"/api/documents/{ready_doc['id']}/chat", json={"message": "What is photosynthesis?"}
    ).json()["conversation_id"]
    resp = client.post(
        f"/api/documents/{other['id']}/chat",
        json={"message": "What is photosynthesis?", "conversation_id": convo_id},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------- AI failures

def test_provider_outage_returns_503_and_stores_nothing(make_client, sample_pdf):
    client = make_client(mode="provider_error")
    doc = upload(client, sample_pdf).json()
    resp = client.post(f"/api/documents/{doc['id']}/quizzes", json={"num_questions": 2})
    assert resp.status_code == 503 and resp.json()["error"]["code"] == "ai_unavailable"
    assert client.get(f"/api/documents/{doc['id']}/quizzes").json()["items"] == []
    assert client.provider.calls == 3  # retried up to AI_MAX_ATTEMPTS


def test_invalid_citations_return_502(make_client, sample_pdf):
    client = make_client(mode="bad_page")
    doc = upload(client, sample_pdf).json()
    resp = client.post(f"/api/documents/{doc['id']}/summary")
    assert resp.status_code == 502 and resp.json()["error"]["code"] == "ai_invalid_output"
    assert client.get(f"/api/documents/{doc['id']}/summary").status_code == 404


def test_failed_chat_does_not_persist_a_half_turn(make_client, sample_pdf):
    client = make_client(mode="bad_page")
    doc = upload(client, sample_pdf).json()
    resp = client.post(f"/api/documents/{doc['id']}/chat", json={"message": "What do mitochondria produce?"})
    assert resp.status_code == 502
    assert client.get(f"/api/documents/{doc['id']}/conversations").json()["items"] == []


def test_auth_failure_returns_503_not_configured(make_client, sample_pdf):
    client = make_client(mode="auth_error")
    doc = upload(client, sample_pdf).json()
    resp = client.post(f"/api/documents/{doc['id']}/notes")
    assert resp.status_code == 503 and resp.json()["error"]["code"] == "ai_not_configured"
    assert "key" not in resp.json()["error"]["message"].lower()


def test_transient_failures_recover_transparently(make_client, sample_pdf):
    client = make_client(mode="flaky", fail_times=2)
    doc = upload(client, sample_pdf).json()
    assert client.post(f"/api/documents/{doc['id']}/summary").status_code == 201


# ---------------------------------------------------------------- persistence

def test_data_survives_app_restart(make_client, sample_pdf):
    first = make_client()
    doc = upload(first, sample_pdf).json()
    quiz = first.post(f"/api/documents/{doc['id']}/quizzes", json={"num_questions": 2}).json()
    q = quiz["questions"][0]
    first.post(f"/api/quizzes/{quiz['id']}/attempts", json={"answers": [{"question_id": q["id"], "selected_index": 0}]})
    first.post(f"/api/documents/{doc['id']}/summary")
    first.app.state.engine.dispose()

    second = make_client()  # new app + engine over the same SQLite file
    assert second.get(f"/api/documents/{doc['id']}").json()["page_count"] == 4
    assert second.get(f"/api/quizzes/{quiz['id']}").json()["questions"][0]["options"] == q["options"]
    assert len(second.get(f"/api/quizzes/{quiz['id']}/attempts").json()["items"]) == 1
    assert second.get(f"/api/documents/{doc['id']}/summary").status_code == 200


def test_health_reports_provider_without_secrets(client):
    body = client.get("/api/health").json()
    assert body == {"status": "ok", "ai_provider": "mock"}


def test_env_example_has_no_real_key():
    env_example = Path(__file__).resolve().parents[1] / ".env.example"
    text = env_example.read_text()
    assert "ANTHROPIC_API_KEY=" in text and "sk-ant-" not in text
