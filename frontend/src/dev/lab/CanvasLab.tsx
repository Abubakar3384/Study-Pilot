import { useEffect, useMemo, useState } from 'react'
import type { SceneInput } from '../../domain/types'
import { sampleGraph } from '../../fixtures/sample-graph'
import { defaultViewMode, detectCapability } from '../../graph/capability'
import { getGraphStore } from '../../graph/graphStore'
import { KnowledgeView } from '../../graph/KnowledgeView'
import { Button } from '../../ui/Button'
import { toast } from '../../ui/toast'

/**
 * DEV-only harness for the signature sequence. Each button simulates one real backend event, so the
 * choreography can be checked against fast, slow, failing and out-of-order timings in isolation.
 */
export default function CanvasLab() {
  const store = useMemo(() => getGraphStore('lab', defaultViewMode()), [])
  const [input, setInput] = useState<SceneInput>({ kind: 'empty' })
  const [stats, setStats] = useState('')
  const cap = detectCapability()

  useEffect(() => {
    const id = window.setInterval(() => {
      const c = window.__sp_debug?.canvas
      if (!c) return setStats('3D canvas not mounted')
      const f = c.frames()
      const i = c.info()
      setStats(
        `frames ${f.frames} · p50 ${f.p50}ms · p95 ${f.p95}ms · max ${f.max}ms · >33ms ${f.over33ms} | ` +
          `calls ${i.calls} · tris ${i.triangles} · geo ${i.geometries} · tex ${i.textures} · programs ${i.programs}`,
      )
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  const run = async (steps: Array<[number, SceneInput]>) => {
    for (const [delay, next] of steps) {
      await new Promise((r) => setTimeout(r, delay))
      setInput(next)
    }
  }

  const pages = (working: boolean, failed = false): SceneInput => ({ kind: 'pages', pageCount: sampleGraph.pageCount, working, failed })
  const graph = (animate: boolean): SceneInput => ({ kind: 'graph', graph: sampleGraph, animate })

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Dev lab · not shipped in production builds</p>
          <h1 className="mt-1 text-2xl font-semibold">Knowledge canvas</h1>
          <p className="mt-1 font-mono text-xs text-text-3">
            tier {cap.tier} {cap.reasons.length ? `(${cap.reasons.join(', ')})` : ''} · input {input.kind}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setInput({ kind: 'empty' })}>Empty</Button>
          <Button size="sm" onClick={() => setInput({ kind: 'ingesting' })}>File chosen</Button>
          <Button size="sm" onClick={() => setInput(pages(true))}>Pages read</Button>
          <Button size="sm" onClick={() => setInput(graph(true))}>Concepts ready</Button>
          <Button size="sm" onClick={() => setInput(pages(false, true))}>Generation failed</Button>
          <Button size="sm" onClick={() => setInput(graph(false))}>Returning user</Button>
          <Button size="sm" variant="primary" onClick={() => run([[0, { kind: 'empty' }], [50, { kind: 'ingesting' }], [900, pages(true)], [1500, graph(true)]])}>
            Play fast
          </Button>
          <Button size="sm" onClick={() => run([[0, { kind: 'empty' }], [50, { kind: 'ingesting' }], [3000, pages(true)], [8000, graph(true)]])}>
            Play slow
          </Button>
          <Button size="sm" onClick={() => run([[0, { kind: 'empty' }], [50, graph(true)]])}>Late join</Button>
          <Button size="sm" variant="ghost" onClick={() => toast.info('Toast check', { label: 'Action', onClick: () => {} })}>
            Toast
          </Button>
        </div>
      </header>
      <KnowledgeView
        input={input}
        store={store}
        onPageClick={(p) => toast.info(`Page ${p} clicked`)}
        actions={{ onOpenNotes: (c) => toast.info(`Open notes: ${c.title}`), onQuiz: (c) => toast.info(`Quiz: ${c.title}`) }}
        aside={<p className="p-4 text-base text-text-2">The concept list appears once concepts are ready.</p>}
      />
      <p className="font-mono text-xs text-text-3 tabular" data-testid="lab-stats">
        {stats}
      </p>
    </div>
  )
}
