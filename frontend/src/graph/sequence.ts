import { ease, scene } from '../design/tokens'
import { clamp01, cubicBezier } from '../motion/easing'
import type { SceneInput } from '../domain/types'

/**
 * The document-to-knowledge timeline. Each phase starts only when the matching real event arrives
 * (file chosen → pages read → concepts returned), so the animation never runs ahead of the backend.
 * Pure and allocation-free per frame, so it is unit-tested without WebGL and sampled every frame.
 */

export type ScenePhase =
  | 'idle'
  | 'entering'
  | 'reading'
  | 'paging'
  | 'waiting'
  | 'forming'
  | 'linking'
  | 'resolving'
  | 'resolved'
  | 'failed'

const easeEnter = cubicBezier(...ease.enter)
const easeStandard = cubicBezier(...ease.standard)

export interface SequenceSnapshot {
  /** Document slab: 0 hidden → 1 in place. */
  slabIn: number
  /** Slab fades as pages leave it: 0 → 1. */
  slabOut: number
  /** Per page surface: 0 on the slab → 1 fanned out. */
  pages: Float32Array
  /** Pages move from the fan to the source strip as concepts form: 0 → 1. */
  recede: number
  /** Per node (layout index): 0 at its page → 1 at its layout position. */
  nodes: Float32Array
  /** Per edge (layout index): drawn fraction 0 → 1. */
  edges: Float32Array
  /** Final settle (key concepts turn amber): 0 → 1. */
  resolve: number
  /** Indeterminate "server is working" signal; only true while a request is really pending. */
  scanning: boolean
  /** Something will still change without new input; the render loop keeps requesting frames. */
  active: boolean
}

export interface SequenceShape {
  pageCount: number
  /** Node layout indices in spawn order. */
  nodeOrder: number[]
  /** Per-edge draw rank. */
  edgeRank: number[]
}

export class SceneSequence {
  private enterAt: number | null = null
  private pagingAt: number | null = null
  private formingAt: number | null = null
  private working = false
  private failed = false
  private skipped = false
  private readonly d: { [K in keyof typeof scene]: number }
  private readonly reduced: boolean

  constructor(opts: { reducedMotion?: boolean; speed?: number } = {}) {
    this.reduced = !!opts.reducedMotion
    const speed = opts.speed ?? 1
    this.d = Object.fromEntries(Object.entries(scene).map(([k, v]) => [k, v * speed])) as typeof this.d
  }

  /** Feed the latest real state. Idempotent: calling it every render with the same input changes nothing. */
  apply(input: SceneInput, now: number, pageSurfaces: number): void {
    const d = this.d
    switch (input.kind) {
      case 'empty':
        this.enterAt = this.pagingAt = this.formingAt = null
        this.working = this.failed = this.skipped = false
        return
      case 'ingesting':
        this.enterAt ??= now
        this.pagingAt = this.formingAt = null
        this.failed = false
        return
      case 'pages':
        this.enterAt ??= now - d.enter
        this.pagingAt ??= Math.max(now, this.enterAt + d.enter * 0.6)
        this.formingAt = null
        this.working = input.working
        this.failed = !!input.failed
        return
      case 'graph':
        this.working = false
        this.failed = false
        if (!input.animate) {
          this.enterAt = this.pagingAt = this.formingAt = -Infinity
          return
        }
        if (this.formingAt !== null) return
        // Late join (e.g. the 3D chunk arrived after the server answered): play pages first.
        this.enterAt ??= now - d.enter
        this.pagingAt ??= now
        this.formingAt = Math.max(now, this.pagingAt + this.pagingTotal(pageSurfaces))
        return
    }
  }

  /** Jump every started phase to its end state. */
  skip(): void {
    this.skipped = true
  }

  private pagingTotal(surfaces: number) {
    return this.d.paging + this.pageStagger(surfaces) * Math.max(0, surfaces - 1)
  }

  private pageStagger(surfaces: number) {
    return Math.min(this.d.pageStagger, (this.d.paging * 0.5) / Math.max(1, surfaces))
  }

  /** Writes the state at `now` into `out` (arrays must match the layout's sizes). */
  sample(now: number, shape: SequenceShape, out: SequenceSnapshot): SequenceSnapshot {
    const d = this.d
    const t = this.skipped || this.reduced ? Infinity : now
    let pending = false
    const prog = (start: number | null, dur: number, easing = easeStandard) => {
      if (start === null) return 0
      const p = dur <= 0 ? 1 : clamp01((t - start) / dur)
      if (p < 1) pending = true
      return easing(p)
    }

    out.slabIn = prog(this.enterAt, d.enter, easeEnter)
    out.slabOut = prog(this.pagingAt, d.paging * 0.5)

    const surfaces = out.pages.length
    const stagger = this.pageStagger(surfaces)
    const pageDur = d.paging * 0.6
    for (let i = 0; i < surfaces; i++) {
      out.pages[i] = prog(this.pagingAt === null ? null : this.pagingAt + i * stagger, pageDur, easeEnter)
    }

    const fa = this.formingAt
    out.recede = prog(fa, d.forming, easeStandard)

    const n = shape.nodeOrder.length
    const nodeStagger = Math.min(d.nodeStagger, (d.forming * 0.4) / Math.max(1, n))
    const nodeDur = d.forming * 0.6
    for (let rank = 0; rank < n; rank++) {
      out.nodes[shape.nodeOrder[rank]!] = prog(fa === null ? null : fa + rank * nodeStagger, nodeDur, easeEnter)
    }

    const linkAt = fa === null ? null : fa + d.forming
    const e = shape.edgeRank.length
    const edgeStep = (d.linking * 0.6) / Math.max(1, e)
    const edgeDur = d.linking * 0.4
    for (let k = 0; k < e; k++) {
      out.edges[k] = prog(linkAt === null ? null : linkAt + shape.edgeRank[k]! * edgeStep, edgeDur)
    }

    out.resolve = prog(linkAt === null ? null : linkAt + d.linking, d.resolve)
    out.scanning = this.working && !this.reduced && this.pagingAt !== null && this.formingAt === null
    out.active = pending || out.scanning
    return out
  }

  phase(now: number, snap: SequenceSnapshot): ScenePhase {
    if (this.failed) return 'failed'
    if (this.enterAt === null) return 'idle'
    if (this.formingAt !== null) {
      if (snap.resolve >= 1) return 'resolved'
      if (snap.resolve > 0) return 'resolving'
      const t = this.skipped || this.reduced ? Infinity : now
      return t >= this.formingAt + this.d.forming ? 'linking' : 'forming'
    }
    if (this.pagingAt !== null) {
      const surfaces = snap.pages.length
      return snap.pages[surfaces - 1]! < 1 ? 'paging' : this.working ? 'waiting' : 'paging'
    }
    return snap.slabIn < 1 ? 'entering' : 'reading'
  }
}

export function createSnapshot(surfaces: number, nodes: number, edges: number): SequenceSnapshot {
  return {
    slabIn: 0,
    slabOut: 0,
    pages: new Float32Array(surfaces),
    recede: 0,
    nodes: new Float32Array(nodes),
    edges: new Float32Array(edges),
    resolve: 0,
    scanning: false,
    active: false,
  }
}
