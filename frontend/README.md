# StudyPilot frontend

React + TypeScript app for StudyPilot. A student uploads a PDF, watches it become a 3D map of its
concepts, then studies with notes, quizzes, flashcards and cited answers. It talks to the FastAPI
backend in `../backend` over `/api`.

## Setup

Requires Node 20+ and the backend's venv (see `../README.md`).

```bash
npm install
npx playwright install chromium     # only for e2e tests and perf measurements
```

Run the backend (`uvicorn` on :8000, see the root README), then:

```bash
npm run dev          # http://localhost:5173, /api is proxied to :8000
```

`/lab/canvas` (dev only) drives the knowledge canvas with simulated backend events: fast, slow, failure
and late join. It uses bundled example data, which is labelled as such.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck, production build, then **fail if any bundle budget is exceeded** |
| `npm run preview` | Serve the production build |
| `npm test` | Vitest unit and component tests |
| `npm run e2e` | Playwright against the production build plus a throwaway mock-AI backend |
| `npm run lint` | ESLint (also enforces that three.js is imported only inside `src/canvas/`) |
| `npm run gen:api` | Regenerate `src/api/schema.gen.ts` from the backend's OpenAPI schema |
| `npm run analyze` | Build with a bundle treemap at `dist/stats.html` |
| `node scripts/measure-perf.mjs` | Load, 3D, interaction and memory measurements; see `PERFORMANCE.md` |

## Architecture

```
src/
  app/          shell, navigation, routes (all lazy), upload bridge, errors
  api/          typed client, error envelope, endpoints, generated types, DTO → domain mappers
  domain/       pure logic: upload pipeline, topic performance, revision suggestions
  graph/        knowledge-map UI that never imports three: layout, sequence timeline, store,
                capability tiers, canvas host/slot, 2D SVG map, concept list/panel, toolbar
  canvas/       the lazy 3D chunk (three + R3F): scene, nodes, lines, pages, camera, labels
  features/     screens: dashboard, library, upload, document (overview, source drawer),
                notes, quiz, flashcards, ask, review
  ui/ motion/   design-system primitives and the single animation system (Motion)
  design/       tokens shared by CSS, Motion and the 3D scene
```

Key decisions:

* **The backend is the source of truth.** The upload pipeline (`domain/uploadPipeline.ts`) changes
  only on real events: upload bytes, the page count from the server, generation results. The 3D
  sequence (`graph/sequence.ts`) starts each phase only when the matching event arrives. No percentages
  are invented.
* **The 3D work cannot slow the app.** three.js lives only in `src/canvas/` (enforced by ESLint) and loads
  lazily. One persistent canvas (`graph/CanvasHost.tsx`) moves between screens, so it is never rebuilt on
  tab switches. It renders on demand only and pauses when offscreen or hidden.
* **No re-render rebuilds.** Selection and hover live in a zustand store that the scene reads inside
  `useFrame`. Scene components never receive them as props.
* **Everything works without WebGL.** `graph/ConceptMap2D.tsx` draws the same layout in SVG. It is used
  for no-WebGL devices, reduced motion (default), user choice, load failures and as the loading
  placeholder. `graph/ConceptList.tsx` is the accessible equivalent of the map.

## Backend additions made for this frontend

The backend gained additive, tested routes: concept map generation, the original PDF file, saving edited
notes, stars, an activity feed, per-question answer checks, and quizzes focused on given pages. See the
API reference in `../README.md`.

## Design system: "Ink & Signal"

* **Colour:** a flat dark palette (`design/tokens.ts`, `styles/index.css`). Tailwind's default palette,
  shadows and blur are removed, so only these tokens exist. Contrast pairs are unit-tested to WCAG AA.
* **Type:** Instrument Sans (UI), Source Serif 4 (long-form reading, loaded only on reading screens) and
  IBM Plex Mono (page refs, metadata).
* **Rules:** no gradients, no glow, no glassmorphism, no decorative particles or charts. Status is always
  shown with text or shape, never colour alone.

## Testing

* **Unit and component tests** cover layout determinism, the sequence timeline, the upload pipeline,
  topic performance, suggestions, label placement, the API error envelope, token contrast and text helpers.
* **e2e** covers:
  * the full journey (upload → map → sources → notes → quiz → review → flashcards → ask);
  * 3D chunk isolation on study screens;
  * a usable shell while the 3D chunk is held back;
  * a WebGL resource-leak check across navigation;
  * fallback on chunk failure;
  * no WebGL;
  * reduced motion;
  * AI errors with a working retry;
  * the phone layout.

Known gap: the e2e suite renders 3D with software WebGL (headless). Real-GPU numbers come from
`scripts/measure-perf.mjs`.
