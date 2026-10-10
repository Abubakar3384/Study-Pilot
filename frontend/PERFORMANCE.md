# Performance log

Measured values only. Anything not measured is listed as not measured. Re-run with:

```bash
npm run build                    # also enforces the bundle budgets below
node scripts/measure-perf.mjs    # load / 3D / interaction / memory; writes perf-results.json
npx playwright test              # includes leak, chunk-isolation and fallback checks
```

## Conditions (2026-10-10)

| | |
|---|---|
| Machine | Windows 11 laptop, 12 logical cores, **Intel Iris Xe** integrated GPU (ANGLE / Direct3D 11) |
| Browser | Chromium 156 (Playwright), headless with the real GPU (`--use-angle=d3d11 --enable-gpu`) |
| Build | Production (`vite build` + `vite preview`), HTTP cache disabled (cold load every time) |
| Backend | Real FastAPI backend, mock AI provider, local SQLite |
| Profiles | **laptop**: no throttling. **phone-approx**: 4× CPU slowdown + Fast 4G (9 Mbps, 150 ms RTT) |

The phone profile approximates a mid-range phone's CPU and network only. **It cannot emulate a phone GPU,**
so its frame times are optimistic for the GPU side. No physical phone was measured. That needs a device
over Chrome remote debugging (`chrome://inspect`) running the same production build.

## Bundle (gzip, enforced by `scripts/check-bundle.mjs` on every build)

| Chunk | Size | Budget | Loaded when |
|---|---|---|---|
| Initial JS (entry + preloads) | **135 KB** | ≤ 160 KB | always |
| Initial CSS | **8.7 KB** | ≤ 20 KB | always |
| Motion animation features | 28 KB | ≤ 40 KB | right after first paint |
| 3D canvas (three + R3F + scene) | **197 KB** | ≤ 240 KB | dashboard / overview only, at idle or on intent |
| Largest screen chunk (Dashboard) | 5.7 KB | ≤ 40 KB | on navigation / hover |
| KaTeX (formulas) | 75 KB | ≤ 80 KB | only if a document contains `$…$` maths |

Notable decision: R3F's `<Canvas>` registers the whole `THREE` namespace, which defeats tree-shaking
(253 KB). `src/canvas/ThreeCanvas.tsx` uses R3F's `createRoot` and registers only the four classes the
scene declares, bringing the chunk to 197 KB.

## Load (median of 3 cold loads of a document overview)

| Milestone | laptop | phone-approx |
|---|---|---|
| First contentful paint | 352 ms | 2532 ms |
| Shell interactive (`sp:shell-interactive`: nav, tabs, upload, concept list usable) | 425 ms | 3465 ms |
| 3D chunk loaded (`sp:canvas-chunk-loaded`) | 613 ms | 4948 ms |
| First 3D frame (`sp:canvas-first-frame`) | 836 ms | 5648 ms |
| JS transferred (incl. 3D chunk) | 400 KB | 400 KB |

Until the first 3D frame, the 2D SVG map of the same layout fills the canvas area (never blank), and every
control works. The e2e test "navigation and upload are usable before the 3D chunk arrives" holds the
chunk back indefinitely and verifies this.

Run-to-run spread on the laptop was large because the machine was also running dev servers: shell
interactive ranged 381–730 ms over six runs. Phone-approx runs were consistent (±50 ms).

## Formation sequence (upload → pages → concepts → links), real GPU

| | laptop | phone-approx |
|---|---|---|
| Frames sampled (only while animating) | 233 | 189 |
| Frame time p50 / p95 | **16.8 / 18.2 ms** | **16.8 / 33.2 ms** |
| Frames over 33 ms | 4 | 9 |
| Worst frame | 80 ms | 124 ms |
| Slowest input during the sequence (Event Timing) | 40 ms | 128 ms |
| Draw calls / triangles at rest | 3 / 3.2k | 3 / 3.2k |

At rest the canvas renders **0 fps** (`frameloop="demand"`), and it stops entirely when offscreen, on a
hidden tab, or on screens without a map.

## Memory and resource cleanup

* 20 cycles of Overview ↔ Notes, plus Home → Library → back → back: JS heap 9.5 → 9.5 MB after GC.
  Geometries 5 → 5, textures 1 → 1, exactly one `<canvas>`.
* Shader programs 6 → 7: one extra program variant is compiled the first time the dashboard shows a
  different document. It is cached and does not grow with further navigation. The e2e leak test asserts
  program count stays constant across repeated tab switches.

## Against the plan's targets

| Target | Result |
|---|---|
| Shell interactive before the 3D chunk finishes | **Met** in both profiles (425 vs 613 ms, 3465 vs 4948 ms) |
| Laptop formation p95 ≤ 20 ms | **Met** (18.2 ms) |
| Laptop interaction < 200 ms during animation | **Met** (40 ms) |
| Phone-approx formation p95 ≤ 33 ms | **Borderline**: 33.2 ms at the high tier. Real low-end phones get the low tier (DPR 1, no AA, shorter sequence), which wasn't measured here because this machine always detects as high tier. |
| Phone-approx shell < 2.0 s | **Not met**: 3.5 s. FCP is 2.5 s. |
| No leaks across navigation | **Met** |
| Study screens never download the 3D chunk | **Met** (e2e, with WebGL available) |

## Known issues and next steps

1. **Throttled start-up time.** Under 4× CPU the initial ~390 KB of minified JS (135 KB gzip) dominates.
   * I tried prefetching route data in React Router loaders. A/B: FCP got about 1.5 s *worse* on the
     throttled profile and no better on the laptop, so it was removed.
   * The next candidates are a prerendered static shell, trimming `react-router` (50 KB of the initial
     bundle), and preloading the UI font.
2. **Occasional long frames at the start of a phase** (4 of 233 on the laptop). Likely the label layer
   measuring label widths (`offsetWidth`) inside the first frames, plus the first instanced draw.
   Measuring widths once outside the frame loop should remove most of them.
3. Not measured: a physical mid-range phone, Safari/WebKit rendering performance, and the low-tier
   rendering path on real low-end hardware.
