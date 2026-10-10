/**
 * Frame-time sampler for the formation sequence. Samples only while something animates, so idle
 * time (0 fps in demand mode) doesn't dilute the numbers. Exposed on window.__sp_debug in dev
 * builds and with ?debug=perf, and read by the e2e/perf scripts.
 */
export class FrameStats {
  private samples: number[] = []
  private readonly max = 2000

  push(ms: number) {
    if (this.samples.length >= this.max) this.samples.shift()
    this.samples.push(ms)
  }

  reset() {
    this.samples = []
  }

  summary() {
    const s = [...this.samples].sort((a, b) => a - b)
    const q = (p: number) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : 0)
    return {
      frames: s.length,
      p50: round(q(0.5)),
      p95: round(q(0.95)),
      max: round(s.at(-1) ?? 0),
      over33ms: s.filter((x) => x > 33.4).length,
    }
  }
}

const round = (n: number) => Math.round(n * 10) / 10

export const debugEnabled =
  import.meta.env.DEV || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'perf')
