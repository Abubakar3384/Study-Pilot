/**
 * Design tokens shared by the DOM (via styles/index.css) and the 3D canvas.
 * Keep the hex values in sync with the @theme block in styles/index.css; tokens.test.ts checks both.
 */

export const color = {
  ink: '#0C0F14',
  surface1: '#12161D',
  surface2: '#181D26',
  line: '#252C37',
  lineStrong: '#343D4B',
  text: '#E7EAEE',
  text2: '#A3ACB9',
  text3: '#7D8796',
  signal: '#6CC4DC',
  amber: '#E9B44C',
  correct: '#5DBB8A',
  incorrect: '#E4705F',
} as const

export type ColorToken = keyof typeof color

/** Durations in seconds (Motion's unit). */
export const duration = {
  micro: 0.12,
  fast: 0.2,
  base: 0.28,
  panel: 0.42,
  flip: 0.45,
} as const

/** Cubic-bezier control points, used by Motion and by the canvas easing evaluator. */
export const ease = {
  standard: [0.2, 0, 0, 1],
  enter: [0.05, 0.7, 0.1, 1],
  exit: [0.3, 0, 0.8, 0.15],
} as const satisfies Record<string, readonly [number, number, number, number]>

/** Durations (ms) of the document-to-knowledge sequence; see canvas/sequence.ts. */
export const scene = {
  enter: 700,
  paging: 900,
  pageStagger: 40,
  forming: 1200,
  nodeStagger: 30,
  linking: 900,
  resolve: 300,
  scanPeriod: 2400,
} as const

/** Light theme (the default). Mirrors the `:root:not([data-theme='dark'])` block in styles/index.css. */
export const lightColor = {
  ink: '#F4F6FB',
  surface1: '#FFFFFF',
  surface2: '#EEF2F8',
  line: '#E2E7F0',
  lineStrong: '#CBD3E1',
  text: '#172033',
  text2: '#475167',
  text3: '#5B6479',
  signal: '#08718B',
  amber: '#A15C07',
  correct: '#157F3D',
  incorrect: '#C0392B',
} as const
