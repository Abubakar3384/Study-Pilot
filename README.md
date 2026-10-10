# StudyPilot

Students upload PDFs, then generate summaries, study notes, a concept map, quizzes and
flashcards, and chat with the document using answers grounded in cited pages.

- `backend/`: FastAPI service (this document).
- `frontend/`: React + TypeScript app with the 3D knowledge canvas. See `frontend/README.md`.

## Setup

Requires Python 3.11+ (tested on 3.13). Run every command from the `backend/` folder.

**Windows (PowerShell)**

```powershell
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

**macOS / Linux**

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
cp .env.example .env
```

## Run

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:get_app --factory --reload --port 8000
```

(On macOS/Linux, use `.venv/bin/python` instead.)

- API: http://localhost:8000/api
- Interactive docs (OpenAPI / Swagger): http://localhost:8000/docs
- Health check: `GET /api/health`

By default `AI_PROVIDER=mock`, so everything works offline at no cost. To use Claude, set these
in `.env` (never in frontend code):

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-key-here
```

With `AI_PROVIDER=anthropic` and no key, the server refuses to start and gives a clear error.

## Test

```powershell
.\.venv\Scripts\python.exe -m pytest
```

The tests use a temporary SQLite file and the mock provider. No network access or API key is needed.

## Project layout

```
backend/
  app/
    main.py              app factory, CORS, error envelope, router wiring
    config.py            settings from environment / .env
    errors.py            AppError hierarchy -> HTTP status + error code
    schemas.py           HTTP request/response models (the frontend contract)
    api/                 routes only: documents.py, study.py, chat.py, deps.py
    services/            business logic
      pdf_extraction.py  PyMuPDF page-aware extraction + validation
      documents.py       upload, status tracking, reprocess, delete
      study.py           summary/notes/quiz/flashcard generation, attempts, reviews
      chat.py            grounded chat + server-built citations
      retrieval.py       BM25 passage search (passages never span pages)
      scoring.py         quiz scoring (pure)
      scheduling.py      flashcard spaced repetition, simplified SM-2 (pure)
      activity.py        recent activity feed for the dashboard
    ai/
      base.py            LLMProvider protocol, LLMRequest, provider errors
      runner.py          parse -> validate -> check pages -> retry/backoff
      schemas.py         Pydantic schemas the model output must satisfy
      prompts.py         prompt builders (document text is treated as data)
      mock.py            configurable offline provider
      anthropic.py       Anthropic Messages API over httpx
      factory.py         picks a provider from settings
    db/
      database.py        engine/session, SQLite pragmas, UTC datetimes
      models.py          SQLAlchemy models
  tests/                 pytest suite
```

## How the reliability rules are enforced

- **Upload validation.** The server checks the `%PDF-` signature (it does not trust the
  filename or content type), rejects empty files, and enforces the size limit (`MAX_UPLOAD_MB`)
  while streaming the upload.
- **Extraction failures.** A file that has a PDF header but can't be read (corrupt,
  password-protected, scanned with no text, over `MAX_PAGES`) is stored with
  `status: "failed"` and a readable `error`. `POST /reprocess` retries extraction. Generation
  routes return `409 document_not_ready` until the document is `ready`.
- **Page numbers.** Pages are stored 1-based, one row per PDF page. Blank pages are kept, so
  numbering always matches the PDF viewer.
- **Model-output validation.** Every AI response is parsed as JSON and validated against a
  strict Pydantic schema. Quizzes need exactly 4 distinct options, a valid `correct_index` and a
  non-empty explanation. Every `page_number` must be one of the pages actually sent to the model
  for *this* document. Output that fails is never stored. The model is asked again with the
  validation error, up to `AI_MAX_ATTEMPTS`.
- **Citations.** For chat, the model only names which retrieved pages it used. The server builds
  each citation (`page_number` + `snippet`) from the retrieved passage text, so a citation always
  points to a real page of the right document, with text that really appears there. If retrieval
  finds nothing relevant, the API answers "not found" without calling the model.
- **Provider failures.** Timeouts, 429 and 5xx responses are retried with exponential backoff.
  Auth errors and bad requests are not retried. When all attempts fail, the API returns
  `503 ai_unavailable`, `503 ai_not_configured` or `502 ai_invalid_output`, and nothing partial
  is saved, including half a chat turn.
- **Secrets.** API keys are read only from the environment (`.env` is git-ignored) and sent only
  to the provider. No response or log line includes them.

## API reference

All error responses use one shape:

```json
{ "error": { "code": "document_not_ready", "message": "Document is failed (PDF is password-protected...)" } }
```

| Code | Status | When |
|---|---|---|
| `invalid_request` | 422 | Request body or query failed validation |
| `invalid_pdf` | 422 | Upload is empty or not a PDF |
| `file_too_large` | 413 | Upload exceeds `MAX_UPLOAD_MB` |
| `not_found` | 404 | Unknown document, page, quiz, flashcard or conversation |
| `document_not_ready` | 409 | Generation requested on a processing/failed document |
| `ai_invalid_output` | 502 | Model output failed validation after all attempts |
| `ai_unavailable` | 503 | Provider unreachable or failing after retries |
| `ai_not_configured` | 503 | Provider rejected credentials |

Full machine-readable schemas are at `/docs` and `/openapi.json`. Field shapes are shown below.

### Documents

| Method & path | Body | Response |
|---|---|---|
| `POST /api/documents` | multipart `file` | `201 Document` |
| `GET /api/documents` | — | `{items: Document[]}` (newest first) |
| `GET /api/documents/{id}` | — | `Document` |
| `DELETE /api/documents/{id}` | — | `204`; deletes the file and all generated data |
| `POST /api/documents/{id}/reprocess` | — | `Document` (retries extraction) |
| `GET /api/documents/{id}/pages/{n}` | — | `{document_id, page_number, text}` |
| `GET /api/documents/{id}/file` | — | The original PDF (`application/pdf`, `inline`) |
| `PUT /api/documents/{id}/star` | — | `Document` with `starred: true` (idempotent) |
| `DELETE /api/documents/{id}/star` | — | `Document` with `starred: false` (idempotent) |

`Document = {id, filename, size_bytes, status: "processing"|"ready"|"failed", error, page_count, starred, created_at, updated_at}`

### Summary and notes

| Method & path | Response |
|---|---|
| `POST /api/documents/{id}/summary` | `201 {id, document_id, created_at, overview, key_points: [{text, page_number}]}` |
| `GET /api/documents/{id}/summary` | Latest summary, or `404` |
| `POST /api/documents/{id}/notes` | `201 {id, document_id, created_at, title, sections: [{heading, bullets: string[], page_number}]}` |
| `GET /api/documents/{id}/notes` | Latest notes, or `404` |
| `PUT /api/documents/{id}/notes` | Body `{title, sections}`; saves the student's edit as the newest version (`source: "user"`) |
| `POST /api/documents/{id}/concepts` | `201 {id, document_id, created_at, concepts: [{id, title, explanation, page_numbers, importance}], relations: [{source, target, kind}]}` |
| `GET /api/documents/{id}/concepts` | Latest concept map, or `404` |

Each POST generates a new version. The GET routes return the most recent one. Notes carry
`source: "ai" | "user"`; saving an edit never deletes earlier versions.

The concept map is validated like every other AI output: 3-40 concepts with unique slug ids,
`importance` 1-3, page numbers from the pages sent to the model, and relations
(`part_of | prerequisite | related`) that only reference known concepts. Self-links are
rejected and duplicate pairs are dropped.

### Quizzes

| Method & path | Body | Response |
|---|---|---|
| `POST /api/documents/{id}/quizzes` | `{num_questions?: 1-20 = 5, pages?: int[]}` | `201 Quiz` (`pages` focuses it on those pages ±1) |
| `GET /api/documents/{id}/quizzes` | — | `{items: Quiz[]}` |
| `GET /api/quizzes/{quiz_id}` | — | `Quiz` |
| `POST /api/quizzes/{quiz_id}/attempts` | `{answers: [{question_id, selected_index: int\|null}]}` | `201 Attempt` |
| `GET /api/quizzes/{quiz_id}/attempts` | — | `{items: Attempt[]}` |
| `POST /api/quizzes/{quiz_id}/questions/{question_id}/check` | `{selected_index: int\|null}` | `{question_id, selected_index, is_correct, correct_index, explanation, page_number}` |

- `Quiz = {id, document_id, title, created_at, questions: [{id, position, question, options: string[4], page_number}]}`.
  Correct answers are **not** included, so students can't see them before answering.
- `Attempt = {id, quiz_id, score, total, percentage, created_at, results: [{question_id, selected_index, correct_index, is_correct, explanation, page_number}]}`
- `check` gives practice feedback for one question and records nothing. It reveals that
  question's answer, which is fine for self-study but means quizzes are not exam-proof
  (there is no authentication yet either).
- Unanswered or `null` answers count as wrong. Unknown question ids, duplicate answers or
  out-of-range indexes return `422`.

### Flashcards

| Method & path | Body | Response |
|---|---|---|
| `POST /api/documents/{id}/flashcards` | `{count?: 1-50 = 10}` | `201 {items: Flashcard[]}` (added to the deck) |
| `GET /api/documents/{id}/flashcards?due=true` | — | `{items: Flashcard[]}` ordered by `due_at` |
| `POST /api/flashcards/{flashcard_id}/reviews` | `{rating: "again"\|"hard"\|"good"\|"easy"}` | `Flashcard` (rescheduled) |

`Flashcard = {id, document_id, front, back, page_number, created_at, ease, interval_days, repetitions, due_at, last_reviewed_at, last_rating}`

### Chat

| Method & path | Body | Response |
|---|---|---|
| `POST /api/documents/{id}/chat` | `{message, conversation_id?}` | `{conversation_id, message: Message}` |
| `GET /api/documents/{id}/conversations` | — | `{items: [{id, document_id, title, created_at}]}` |
| `GET /api/documents/{id}/conversations/{cid}` | — | `{id, document_id, title, created_at, messages: Message[]}` |

- `Message = {id, role: "user"|"assistant", content, citations: [{page_number, snippet}], created_at}`
- Leave out `conversation_id` to start a new conversation. A conversation ID from another
  document returns `404`.

### Activity

| Method & path | Response |
|---|---|
| `GET /api/activity?limit=20` | `{items: [{type, at, document_id, document_filename, summary, quiz_id?, attempt_id?, conversation_id?, score?, total?, count?}]}` newest first |

`type` is `document_uploaded`, `quiz_attempt`, `conversation` (timed by its latest message) or
`flashcard_review` (one entry per document per day, with `count`).

## Mock provider modes

Set `MOCK_MODE` in `.env` to see how the UI behaves when AI calls fail:

| Mode | Behaviour |
|---|---|
| `ok` | Valid, deterministic output built from the document text |
| `provider_error` | Every call fails with a retryable error → `503` |
| `auth_error` | Credentials rejected → `503 ai_not_configured` |
| `invalid_json` / `schema_invalid` | Output never validates → `502` |
| `bad_page` | Cites a page that doesn't exist → rejected → `502` |
| `flaky` / `flaky_invalid` | First `MOCK_FAIL_TIMES` calls fail, then succeed (retries recover) |

## Known limitations

- Extraction runs synchronously during upload. That is fine for typical course PDFs. Very large
  files would need a background worker, and the `processing` status already supports that.
- Scanned PDFs (images only) are marked `failed`. OCR is not implemented.
- Retrieval is lexical (BM25). Embeddings would improve recall on paraphrased questions.
- For long documents, generation samples pages evenly within `AI_MAX_CONTEXT_CHARS` instead
  of map-reducing over the whole text.
- Tables are created with `create_all` at startup. Add Alembic before changing the schema
  once real data exists.
- No authentication or multi-user ownership yet. All documents, stars and activity are global.
