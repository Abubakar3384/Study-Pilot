import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { invalidate, useFrame } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import type { WebGLRenderer } from 'three'
import type { Concept, KnowledgeGraph, SceneInput } from '../domain/types'
import type { GraphStore } from '../graph/graphStore'
import type { GraphLayout } from '../graph/layout'
import { placeLabels, type LabelCandidate } from '../graph/labelPlacement'
import type { FrameState } from './frame'
import { debugEnabled, FrameStats } from './frameStats'
import { Scene } from './Scene'
import { isDisposing, ThreeCanvas } from './ThreeCanvas'

export interface KnowledgeCanvasProps {
  input: SceneInput
  store: GraphStore
  tier: 'high' | 'low'
  reducedMotion: boolean
  /** False while the canvas is parked (no slot on screen): rendering stops entirely. */
  active: boolean
  onReady?: () => void
  onPageClick?: (page: number) => void
  /** Frame rate stayed low even at the lowest resolution. */
  onPerformanceFallback?: () => void
  onContextLost?: () => void
}

interface DebugInfo {
  geometries: number
  textures: number
  programs: number
  calls: number
  triangles: number
}

declare global {
  interface Window {
    __sp_debug?: { canvas?: { info: () => DebugInfo; frames: () => ReturnType<FrameStats['summary']>; resetFrames: () => void } }
  }
}

const SEQUENCE_PHASES = new Set(['entering', 'paging', 'forming', 'linking', 'resolving'])

function FirstFrame({ onReady }: { onReady?: () => void }) {
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    done.current = true
    performance.mark('sp:canvas-first-frame')
    if (onReady) setTimeout(onReady, 0)
  })
  return null
}

function KnowledgeCanvas({
  input,
  store,
  tier,
  reducedMotion,
  active,
  onReady,
  onPageClick,
  onPerformanceFallback,
  onContextLost,
}: KnowledgeCanvasProps) {
  const wrapper = useRef<HTMLDivElement>(null)
  const frame = useRef<FrameState | null>(null)
  const stats = useMemo(() => new FrameStats(), [])
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, tier === 'low' ? 1 : 1.75))
  const [onScreen, setOnScreen] = useState(true)
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible')
  const [labelInfo, setLabelInfo] = useState<{ version: string; concepts: Concept[] }>({ version: '', concepts: [] })
  const labelEls = useRef<Array<HTMLDivElement | null>>([])
  const labelWidths = useRef<number[]>([])
  const labelShown = useRef<Uint8Array>(new Uint8Array(0))
  const pointer = useRef({ x: 0, y: 0, downX: 0, downY: 0, down: false })

  // Render only while the canvas is attached, on screen and the tab is visible.
  useEffect(() => {
    const el = wrapper.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setOnScreen(!!entry?.isIntersecting), { threshold: 0.01 })
    io.observe(el)
    const onVis = () => setPageVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  const running = active && onScreen && pageVisible
  useEffect(() => {
    if (running) invalidate()
  }, [running])

  const onLayout = useCallback((layout: GraphLayout, graph: KnowledgeGraph | null) => {
    labelWidths.current = []
    labelShown.current = new Uint8Array(layout.nodes.length)
    setLabelInfo({ version: layout.version, concepts: graph?.concepts ?? [] })
  }, [])

  // Re-measure label widths once web fonts are ready.
  useEffect(() => {
    document.fonts?.ready.then(() => {
      labelWidths.current = []
      invalidate()
    })
  }, [])

  /** Called by the Projector at the end of every rendered frame. Pure DOM writes, no React state. */
  const updateLabels = useCallback(() => {
    const f = frame.current
    if (!f) return
    const { selectedId, hoveredId } = store.getState()
    const sel = selectedId ? (f.layout.byId.get(selectedId) ?? -1) : -1
    const hov = hoveredId ? (f.layout.byId.get(hoveredId) ?? -1) : -1
    const n = f.layout.nodes.length
    const cands: LabelCandidate[] = []
    for (let i = 0; i < n; i++) {
      const el = labelEls.current[i]
      if (!el) continue
      if (!labelWidths.current[i]) labelWidths.current[i] = el.offsetWidth
      const node = f.layout.nodes[i]!
      const ready = f.nodeShown[i]! >= 0.95 && f.screen[i * 3 + 2]! < 1
      let priority = -1
      if (ready) {
        if (i === sel) priority = 100
        else if (i === hov) priority = 90
        else if (sel >= 0 && f.neighbor[i]) priority = 70
        else if (node.importance === 3) priority = 50
        else if (node.importance === 2 && (f.zoom < 0.85 || n <= 14)) priority = 30
        else if (f.zoom < 0.65) priority = 10
      }
      cands.push({
        index: i,
        x: f.screen[i * 3]!,
        y: f.screen[i * 3 + 1]!,
        r: f.pxRadius[i]!,
        w: labelWidths.current[i]!,
        h: 22,
        priority,
      })
    }
    const placed = placeLabels(cands, f.viewport.width, f.viewport.height)
    const next = new Uint8Array(n)
    for (const p of placed) {
      next[p.index] = 1
      const el = labelEls.current[p.index]!
      el.style.transform = `translate3d(${Math.round(p.left)}px, ${Math.round(p.top)}px, 0)`
    }
    for (let i = 0; i < n; i++) {
      const el = labelEls.current[i]
      if (!el) continue
      const state = !next[i] ? 'hidden' : i === sel ? 'selected' : sel >= 0 && !f.neighbor[i] && i !== hov ? 'dim' : 'shown'
      if (el.dataset.state !== state) el.dataset.state = state
    }
    labelShown.current = next
  }, [store])

  const pickNode = (x: number, y: number, touch: boolean) => {
    const f = frame.current
    if (!f) return -1
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < f.layout.nodes.length; i++) {
      if (f.nodeShown[i]! < 0.6) continue
      const d = Math.hypot(f.screen[i * 3]! - x, f.screen[i * 3 + 1]! - y)
      const reach = Math.max(f.pxRadius[i]! + 6, touch ? 24 : 14)
      if (d < reach && d < bestD) {
        best = i
        bestD = d
      }
    }
    return best
  }

  const pickPage = (x: number, y: number) => {
    const f = frame.current
    if (!f || (f.snap.recede < 1 && f.layout.nodes.length > 0)) return -1
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < f.layout.pages.length; i++) {
      if (f.snap.pages[i]! < 1 && f.snap.recede < 1) continue
      const r = f.pageScreen[i * 3 + 2]!
      const dx = Math.abs(f.pageScreen[i * 3]! - x)
      const dy = Math.abs(f.pageScreen[i * 3 + 1]! - y)
      if (dx < r * 0.8 && dy < r * 1.1 && dx + dy < bestD) {
        best = i
        bestD = dx + dy
      }
    }
    return best
  }

  const local = (e: ReactPointerEvent) => {
    const rect = wrapper.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (pointer.current.down) return
    const { x, y } = local(e)
    const node = pickNode(x, y, e.pointerType === 'touch')
    const f = frame.current
    store.getState().hover(node >= 0 ? f!.layout.nodes[node]!.id : null)
    const page = node < 0 && onPageClick ? pickPage(x, y) : -1
    if (f && f.hoveredSurface !== page) {
      f.hoveredSurface = page
      invalidate()
    }
    wrapper.current!.style.cursor = node >= 0 || page >= 0 ? 'pointer' : ''
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    const { x, y } = local(e)
    pointer.current = { x, y, downX: x, downY: y, down: true }
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    const p = pointer.current
    p.down = false
    const { x, y } = local(e)
    if (Math.hypot(x - p.downX, y - p.downY) > 6) return
    const s = store.getState()
    if (SEQUENCE_PHASES.has(s.phase)) {
      s.skipAnimation()
      return
    }
    const node = pickNode(x, y, e.pointerType === 'touch')
    const f = frame.current
    if (node >= 0 && f) {
      const id = f.layout.nodes[node]!.id
      s.select(s.selectedId === id ? null : id)
      return
    }
    const page = pickPage(x, y)
    if (page >= 0 && f && onPageClick) {
      onPageClick(f.layout.pages[page]!.fromPage)
      return
    }
    s.select(null)
  }

  const onCreated = useCallback(
    ({ gl }: { gl: WebGLRenderer }) => {
      performance.mark('sp:canvas-created')
      gl.domElement.addEventListener('webglcontextlost', (event) => {
        if (isDisposing(gl.domElement)) return // our own teardown, not a failure
        event.preventDefault()
        onContextLost?.()
      })
      if (debugEnabled) {
        window.__sp_debug = {
          ...window.__sp_debug,
          canvas: {
            info: () => ({
              geometries: gl.info.memory.geometries,
              textures: gl.info.memory.textures,
              programs: gl.info.programs?.length ?? 0,
              calls: gl.info.render.calls,
              triangles: gl.info.render.triangles,
            }),
            frames: () => stats.summary(),
            resetFrames: () => stats.reset(),
          },
        }
      }
    },
    [onContextLost, stats],
  )

  useEffect(
    () => () => {
      if (window.__sp_debug?.canvas) delete window.__sp_debug.canvas
    },
    [],
  )

  return (
    <div
      ref={wrapper}
      className="absolute inset-0 select-none"
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        pointer.current.down = false
        store.getState().hover(null)
      }}
      aria-hidden
    >
      <ThreeCanvas
        frameloop={running ? 'demand' : 'never'}
        dpr={dpr}
        gl={{ antialias: tier === 'high' && dpr < 2, alpha: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 36, near: 0.1, far: 60, position: [0, 1.2, 12] }}
        onCreated={onCreated}
      >
        <PerformanceMonitor
          flipflops={2}
          onDecline={() => setDpr((d) => (d > 1.25 ? 1.25 : 1))}
          onFallback={() => {
            setDpr(1)
            onPerformanceFallback?.()
          }}
        />
        <Scene
          input={input}
          store={store}
          tier={tier}
          reducedMotion={reducedMotion}
          frame={frame}
          stats={stats}
          onProjected={updateLabels}
          onLayout={onLayout}
        />
        <FirstFrame onReady={onReady} />
      </ThreeCanvas>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" key={labelInfo.version}>
        {labelInfo.concepts.map((c, i) => (
          <div
            key={c.id}
            ref={(el) => {
              labelEls.current[i] = el
            }}
            data-state="hidden"
            className="kc-label absolute top-0 left-0 max-w-[220px] truncate rounded-[3px] px-1.5 py-0.5 text-[12.5px] leading-[18px] font-medium whitespace-nowrap"
          >
            {c.title}
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(KnowledgeCanvas)
