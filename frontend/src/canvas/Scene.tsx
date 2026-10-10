import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { KnowledgeGraph, SceneInput } from '../domain/types'
import type { GraphStore } from '../graph/graphStore'
import { layoutGraph, layoutPages, MAX_PAGE_SURFACES, surfaceForPage, type GraphLayout } from '../graph/layout'
import { SceneSequence } from '../graph/sequence'
import { ActiveConcept } from './ActiveConcept'
import { CameraRig } from './CameraRig'
import { ConceptNodes } from './ConceptNodes'
import { ConnectionLines } from './ConnectionLines'
import { DocumentObject } from './DocumentObject'
import { DocumentPages } from './DocumentPages'
import { createFrameState, POSE_STRIDE, type FrameState } from './frame'
import type { FrameStats } from './frameStats'
import { Projector } from './Projector'
import { C } from './palette'

export interface SceneProps {
  input: SceneInput
  store: GraphStore
  tier: 'high' | 'low'
  reducedMotion: boolean
  frame: React.RefObject<FrameState | null>
  stats: FrameStats
  onProjected: () => void
  onLayout: (layout: GraphLayout, graph: KnowledgeGraph | null) => void
}

const SLAB = { x: 0, y: 0.05, z: 1.4, rotX: 0, rotY: 0, rotZ: 0, scale: 1.25 }

function emptyLayout(pageCount: number, maxSurfaces: number): GraphLayout {
  return {
    version: `pages-${pageCount}`,
    nodes: [],
    byId: new Map(),
    edges: [],
    nodeOrder: [],
    edgeRank: [],
    pages: layoutPages(pageCount, maxSurfaces),
    pageCount,
  }
}

/** Index lookups for the current selection; recomputed only when the store changes. */
function syncSelection(f: FrameState, selectedId: string | null, hoveredId: string | null) {
  const { layout, graph } = f
  f.selected = selectedId ? (layout.byId.get(selectedId) ?? -1) : -1
  f.hovered = hoveredId ? (layout.byId.get(hoveredId) ?? -1) : -1
  f.neighbor.fill(0)
  f.citedSurface.fill(0)
  if (f.selected >= 0) {
    for (const [a, b] of layout.edges) {
      if (a === f.selected) f.neighbor[b] = 1
      if (b === f.selected) f.neighbor[a] = 1
    }
  }
  const cite = f.selected >= 0 ? f.selected : f.hovered
  const concept = cite >= 0 ? graph?.concepts[cite] : undefined
  if (concept) {
    for (const page of concept.pages) f.citedSurface[surfaceForPage(page, layout.pageCount, layout.pages.length)] = 1
  }
}

export function Scene({ input, store, tier, reducedMotion, frame, stats, onProjected, onLayout }: SceneProps) {
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  const threeScene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const graph = input.kind === 'graph' ? input.graph : null
  const pageCount = input.kind === 'pages' ? input.pageCount : (graph?.pageCount ?? 0)
  const maxSurfaces = MAX_PAGE_SURFACES[tier]

  // Keyed by graph version, not object identity: refetches of the same data never rebuild the scene.
  const layout = useMemo(
    () => (graph ? layoutGraph(graph, maxSurfaces) : emptyLayout(pageCount, maxSurfaces)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph?.version, pageCount, maxSurfaces],
  )

  const sequence = useRef<SceneSequence | null>(null)
  const lastDoc = useRef<string | null>(null)

  // Frame state lives exactly as long as the layout; published before the first frame renders.
  const frameState = useMemo(() => {
    const f = createFrameState(layout, graph)
    const { selectedId, hoveredId } = store.getState()
    syncSelection(f, selectedId, hoveredId)
    return f
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, store])
  useLayoutEffect(() => {
    frame.current = frameState
  }, [frame, frameState])

  useEffect(() => {
    onLayout(layout, graph)
    // Compile shaders for the new objects now, not on the first animated frame (avoids a hitch).
    gl.compile(threeScene, camera)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  // A different document (or an empty canvas) starts a fresh sequence; pages → graph continues it.
  useEffect(() => {
    const docId = graph?.documentId ?? null
    const switched = docId !== null && lastDoc.current !== null && docId !== lastDoc.current
    if (!sequence.current || switched || input.kind === 'empty') {
      sequence.current = new SceneSequence({ reducedMotion, speed: tier === 'low' ? 0.65 : 1 })
      stats.reset()
    }
    if (docId) lastDoc.current = docId
    sequence.current.apply(input, performance.now(), layout.pages.length)
    invalidate()
  }, [input, layout, reducedMotion, tier, invalidate, graph, stats])

  useEffect(
    () =>
      store.subscribe((s, prev) => {
        const f = frame.current
        if (!f) return
        if (s.selectedId !== prev.selectedId || s.hoveredId !== prev.hoveredId) {
          syncSelection(f, s.selectedId, s.hoveredId)
          invalidate()
        }
        if (s.skipSignal !== prev.skipSignal) {
          sequence.current?.skip()
          invalidate()
        }
      }),
    [store, frame, invalidate],
  )

  // Orchestrator: runs first each frame; samples the timeline and computes every animated pose.
  useFrame((_, dt) => {
    const f = frame.current
    const seq = sequence.current
    if (!f || !seq) return
    const now = performance.now()
    const snap = seq.sample(now, f.layout, f.snap)
    store.getState().setPhase(seq.phase(now, snap))

    const { pages } = f.layout
    for (let i = 0; i < pages.length; i++) {
      const { fan, strip } = pages[i]!
      const t = snap.pages[i]!
      const r = snap.recede
      const o = i * POSE_STRIDE
      const fx = SLAB.x + (fan.x - SLAB.x) * t
      const fy = SLAB.y + (fan.y - SLAB.y) * t
      const fz = SLAB.z - i * 0.003 + (fan.z - SLAB.z) * t
      f.pagePose[o] = fx + (strip.x - fx) * r
      f.pagePose[o + 1] = fy + (strip.y - fy) * r
      f.pagePose[o + 2] = fz + (strip.z - fz) * r
      f.pagePose[o + 3] = fan.rotX * t + (strip.rotX - fan.rotX * t) * r
      f.pagePose[o + 4] = fan.rotY * t + (strip.rotY - fan.rotY * t) * r
      f.pagePose[o + 5] = fan.rotZ * t + (strip.rotZ - fan.rotZ * t) * r
      const sc = SLAB.scale * 0.98 + (fan.scale - SLAB.scale * 0.98) * t
      f.pagePose[o + 6] = sc + (strip.scale - sc) * r
    }

    // Nodes emerge from the fanned page they were extracted from and travel to their place.
    const { nodes } = f.layout
    for (let i = 0; i < nodes.length; i++) {
      const nd = nodes[i]!
      const t = snap.nodes[i]!
      const spawn = pages[nd.spawnSurface]?.fan ?? SLAB
      f.nodePos[i * 3] = spawn.x + (nd.x - spawn.x) * t
      f.nodePos[i * 3 + 1] = spawn.y + 0.3 + (nd.y - spawn.y - 0.3) * t
      f.nodePos[i * 3 + 2] = spawn.z + 0.05 + (nd.z - spawn.z - 0.05) * t
      f.nodeShown[i] = t <= 0 ? 0 : Math.min(1, t * 2.5)
    }

    if (snap.active) {
      stats.push(dt * 1000)
      invalidate()
    }
  }, -2)

  return (
    <>
      <color attach="background" args={[C.ink.getHex()]} />
      <fog attach="fog" args={[C.ink.getHex(), 9, 24]} />
      <DocumentObject frame={frame} />
      <DocumentPages key={`pages-${layout.pages.length}`} frame={frame} count={layout.pages.length} />
      <ConceptNodes key={`nodes-${layout.version}`} frame={frame} count={layout.nodes.length} version={layout.version} />
      <ConnectionLines key={`edges-${layout.version}`} frame={frame} edgeCount={layout.edges.length} />
      <ActiveConcept frame={frame} />
      <CameraRig frame={frame} store={store} reducedMotion={reducedMotion} />
      <Projector frame={frame} onProjected={onProjected} />
    </>
  )
}
