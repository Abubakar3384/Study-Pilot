import { scene } from '../design/tokens'
import type { KnowledgeGraph, SceneInput } from '../domain/types'
import { sampleGraph } from '../fixtures/sample-graph'
import { layoutGraph } from './layout'
import { createSnapshot, SceneSequence } from './sequence'

const layout = layoutGraph(sampleGraph)
const S = layout.pages.length
const snap = () => createSnapshot(S, layout.nodes.length, layout.edges.length)
const graphInput = (g: KnowledgeGraph = sampleGraph, animate = true): SceneInput => ({ kind: 'graph', graph: g, animate })
const LONG = 60_000

function run(seq: SceneSequence, now: number) {
  const out = seq.sample(now, layout, snap())
  return { out, phase: seq.phase(now, out) }
}

describe('SceneSequence', () => {
  it('only shows the slab while uploading, however long it takes', () => {
    const seq = new SceneSequence()
    seq.apply({ kind: 'ingesting' }, 0, S)
    const { out, phase } = run(seq, LONG)
    expect(out.slabIn).toBe(1)
    expect(out.pages.every((p) => p === 0)).toBe(true)
    expect(out.nodes.every((p) => p === 0)).toBe(true)
    expect(phase).toBe('reading')
    expect(out.active).toBe(false)
  })

  it('fans pages out when the page count arrives and scans only while work is pending', () => {
    const seq = new SceneSequence()
    seq.apply({ kind: 'ingesting' }, 0, S)
    seq.apply({ kind: 'pages', pageCount: 18, working: true }, 1000, S)
    const mid = run(seq, 1000 + scene.paging / 2)
    expect(mid.phase).toBe('paging')
    const done = run(seq, LONG)
    expect(done.out.pages.every((p) => p === 1)).toBe(true)
    expect(done.out.scanning).toBe(true)
    expect(done.out.active).toBe(true)
    expect(done.phase).toBe('waiting')
    expect(done.out.nodes.every((p) => p === 0)).toBe(true)

    seq.apply({ kind: 'pages', pageCount: 18, working: false, failed: true }, LONG, S)
    const failed = run(seq, LONG + 1)
    expect(failed.out.scanning).toBe(false)
    expect(failed.phase).toBe('failed')
  })

  it('forms nodes, then draws edges, then resolves', () => {
    const seq = new SceneSequence()
    seq.apply({ kind: 'ingesting' }, 0, S)
    seq.apply({ kind: 'pages', pageCount: 18, working: true }, 1000, S)
    seq.apply(graphInput(), 10_000, S)
    const forming = run(seq, 10_000 + scene.forming * 0.3)
    expect(forming.phase).toBe('forming')
    expect(forming.out.edges.every((p) => p === 0)).toBe(true)
    // Key concepts spawn first.
    const first = layout.nodeOrder[0]!
    const last = layout.nodeOrder.at(-1)!
    expect(forming.out.nodes[first]!).toBeGreaterThan(forming.out.nodes[last]!)

    const linking = run(seq, 10_000 + scene.forming + scene.linking * 0.5)
    expect(linking.phase).toBe('linking')
    expect(linking.out.nodes.every((p) => p === 1)).toBe(true)

    const end = run(seq, LONG)
    expect(end.phase).toBe('resolved')
    expect(end.out.active).toBe(false)
    expect(end.out.edges.every((p) => p === 1)).toBe(true)
    expect(end.out.recede).toBe(1)
  })

  it('plays pages before forming when it joins late, straight at the graph', () => {
    const seq = new SceneSequence()
    seq.apply(graphInput(), 5000, S)
    const early = run(seq, 5000 + 50)
    expect(early.out.nodes.every((p) => p === 0)).toBe(true)
    expect(early.out.slabIn).toBe(1)
    expect(run(seq, LONG).phase).toBe('resolved')
  })

  it('shows a returning user the resolved graph immediately', () => {
    const seq = new SceneSequence()
    seq.apply(graphInput(sampleGraph, false), 0, S)
    const { out, phase } = run(seq, 0)
    expect(phase).toBe('resolved')
    expect(out.active).toBe(false)
    expect(out.nodes.every((p) => p === 1)).toBe(true)
  })

  it('skip and reduced motion jump to the end of started phases only', () => {
    const seq = new SceneSequence()
    seq.apply({ kind: 'ingesting' }, 0, S)
    seq.apply({ kind: 'pages', pageCount: 18, working: true }, 10, S)
    seq.skip()
    const { out } = run(seq, 11)
    expect(out.pages.every((p) => p === 1)).toBe(true)
    expect(out.nodes.every((p) => p === 0)).toBe(true)

    const reduced = new SceneSequence({ reducedMotion: true })
    reduced.apply({ kind: 'ingesting' }, 0, S)
    reduced.apply({ kind: 'pages', pageCount: 18, working: true }, 0, S)
    reduced.apply(graphInput(), 0, S)
    const r = run(reduced, 1)
    expect(r.phase).toBe('resolved')
    expect(r.out.scanning).toBe(false)
  })

  it('ignores repeated identical input (safe to call every render)', () => {
    const seq = new SceneSequence()
    seq.apply({ kind: 'ingesting' }, 0, S)
    seq.apply({ kind: 'ingesting' }, 500, S)
    expect(run(seq, scene.enter).out.slabIn).toBe(1)
  })
})
