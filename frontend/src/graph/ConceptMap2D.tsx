import { useEffect, useMemo, useRef } from 'react'
import type { KnowledgeGraph, SceneInput } from '../domain/types'
import { useReducedMotionPref } from '../motion/useReducedMotionPref'
import { cn } from '../ui/cn'
import { useGraph, type GraphStore } from './graphStore'
import { placeLabels, type LabelCandidate } from './labelPlacement'
import { layoutGraph, layoutPages, MAX_PAGE_SURFACES, surfaceForPage, WORLD, type GraphLayout } from './layout'
import { useElementSize } from './useElementSize'

/**
 * Lightweight SVG rendering of the same layout as the 3D scene. Used when WebGL is unavailable,
 * for reduced motion, when the user picks 2D, and (non-interactive, muted) as the placeholder
 * while the 3D chunk downloads, so the canvas region is never blank.
 */
interface Props {
  input: SceneInput
  store: GraphStore
  interactive?: boolean
  muted?: boolean
  onPageClick?: (page: number) => void
  className?: string
}

// World window shown: graph area plus the source strip below it.
const VIEW = { minX: -WORLD.width / 2 - 0.5, maxX: WORLD.width / 2 + 0.5, minY: -3.05, maxY: 2.45 }
const STRIP_Y = -2.75

export function ConceptMap2D({ input, store, interactive = true, muted = false, onPageClick, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const { width, height } = useElementSize(ref)
  const reduced = useReducedMotionPref()
  const graph = input.kind === 'graph' ? input.graph : null
  const pageCount = input.kind === 'pages' ? input.pageCount : (graph?.pageCount ?? 0)

  const layout = useMemo<GraphLayout | null>(
    () => (graph ? layoutGraph(graph, MAX_PAGE_SURFACES.high) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph?.version],
  )
  const pages = useMemo(() => layout?.pages ?? layoutPages(pageCount, MAX_PAGE_SURFACES.high), [layout, pageCount])

  // Report a coarse phase so shared controls (e.g. Skip) behave the same as with the 3D view.
  useEffect(() => {
    if (!interactive) return
    const set = store.getState().setPhase
    if (input.kind === 'graph') set('resolved')
    else if (input.kind === 'pages') set(input.failed ? 'failed' : input.working ? 'waiting' : 'paging')
    else if (input.kind === 'ingesting') set('reading')
    else set('idle')
  }, [input, interactive, store])

  const scale = Math.max(1, Math.min(width / (VIEW.maxX - VIEW.minX), height / (VIEW.maxY - VIEW.minY)))
  const ox = width / 2 - ((VIEW.minX + VIEW.maxX) / 2) * scale
  const oy = height / 2 + ((VIEW.minY + VIEW.maxY) / 2) * scale
  const sx = (x: number) => ox + x * scale
  const sy = (y: number) => oy - y * scale
  const animate = input.kind === 'graph' && input.animate && !reduced && !muted

  return (
    <div ref={ref} className={cn('absolute inset-0', muted && 'opacity-60', className)} aria-hidden>
      {width > 0 && (
        <svg width={width} height={height} className="block">
          {input.kind === 'ingesting' && <IngestPage x={width / 2} y={height / 2} scale={scale} />}
          {input.kind === 'pages' && (
            <PageRow pages={pages.length} width={width} y={height / 2} scale={scale} working={input.working && !reduced} />
          )}
          {graph && layout && (
            <GraphSvg
              graph={graph}
              layout={layout}
              store={store}
              sx={sx}
              sy={sy}
              scale={scale}
              width={width}
              height={height}
              interactive={interactive}
              animate={animate}
              onPageClick={onPageClick}
            />
          )}
        </svg>
      )}
    </div>
  )
}

function IngestPage({ x, y, scale }: { x: number; y: number; scale: number }) {
  const w = 0.74 * scale * 1.25
  const h = 0.95 * scale * 1.25
  return (
    <g className="kc2-rise">
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={2} className="fill-surface-2 stroke-line-strong" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={x - w / 2 + w * 0.12} y={y - h / 2 + h * (0.18 + i * 0.11)} width={w * (i % 3 === 2 ? 0.5 : 0.76)} height={2} className="fill-line-strong" />
      ))}
    </g>
  )
}

function PageRow({ pages, width, y, scale, working }: { pages: number; width: number; y: number; scale: number; working: boolean }) {
  const w = 0.56 * scale * 0.9
  const h = 0.72 * scale * 0.9
  const gap = Math.min(w * 0.35, (width * 0.85 - pages * w) / Math.max(1, pages - 1))
  const total = pages * w + (pages - 1) * gap
  return (
    <g>
      {Array.from({ length: pages }, (_, i) => (
        <rect
          key={i}
          x={(width - total) / 2 + i * (w + gap)}
          y={y - h / 2}
          width={w}
          height={h}
          rx={2}
          className={cn('fill-surface-2 stroke-line-strong kc2-pop', working && 'kc2-scan')}
          style={{ animationDelay: working ? `${(i / pages) * 1.6}s` : `${i * 30}ms` }}
        />
      ))}
    </g>
  )
}

function GraphSvg({
  graph,
  layout,
  store,
  sx,
  sy,
  scale,
  width,
  height,
  interactive,
  animate,
  onPageClick,
}: {
  graph: KnowledgeGraph
  layout: GraphLayout
  store: GraphStore
  sx: (x: number) => number
  sy: (y: number) => number
  scale: number
  width: number
  height: number
  interactive: boolean
  animate: boolean
  onPageClick?: (page: number) => void
}) {
  const selectedId = useGraph(store, (s) => s.selectedId)
  const hoveredId = useGraph(store, (s) => s.hoveredId)
  const sel = selectedId ? (layout.byId.get(selectedId) ?? -1) : -1
  const hov = hoveredId ? (layout.byId.get(hoveredId) ?? -1) : -1
  const neighbor = useMemo(() => {
    const set = new Set<number>()
    for (const [a, b] of layout.edges) {
      if (a === sel) set.add(b)
      if (b === sel) set.add(a)
    }
    return set
  }, [layout, sel])
  const cited = useMemo(() => {
    const idx = sel >= 0 ? sel : hov
    const set = new Set<number>()
    for (const p of graph.concepts[idx]?.pages ?? []) set.add(surfaceForPage(p, layout.pageCount, layout.pages.length))
    return set
  }, [graph, layout, sel, hov])

  const rank = useMemo(() => {
    const r = new Array<number>(layout.nodes.length)
    layout.nodeOrder.forEach((nodeIndex, i) => (r[nodeIndex] = i))
    return r
  }, [layout])

  const radius = (i: number) => Math.max(4, layout.nodes[i]!.radius * scale * 1.15)

  const labels = useMemo(() => {
    const cands: LabelCandidate[] = layout.nodes.map((n, i) => {
      let priority = -1
      if (i === sel) priority = 100
      else if (i === hov) priority = 90
      else if (sel >= 0 && neighbor.has(i)) priority = 70
      else if (n.importance === 3) priority = 50
      else if (n.importance === 2 && (layout.nodes.length <= 14 || width > 1000)) priority = 30
      return { index: i, x: sx(n.x), y: sy(n.y), r: radius(i), w: graph.concepts[i]!.title.length * 7 + 12, h: 20, priority }
    })
    return placeLabels(cands, width, height)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, sel, hov, neighbor, width, height, scale])

  const stripW = (layout.pages[1] ? Math.abs(layout.pages[1].strip.x - layout.pages[0]!.strip.x) : 0.6) * scale
  const pageW = Math.min(stripW * 0.8, 0.56 * scale * 0.7)
  const pageH = pageW * 0.42

  const hover = (id: string | null) => interactive && store.getState().hover(id)
  const select = (id: string) => {
    if (!interactive) return
    const s = store.getState()
    s.select(s.selectedId === id ? null : id)
  }

  return (
    <g>
      <g>
        {layout.pages.map((p) => (
          <rect
            key={p.index}
            x={sx(p.strip.x) - pageW / 2}
            y={sy(STRIP_Y) - pageH / 2}
            width={pageW}
            height={pageH}
            rx={1.5}
            className={cn(
              'transition-colors duration-150',
              cited.has(p.index) ? 'fill-amber/70 stroke-amber' : 'fill-surface-2 stroke-line-strong',
              interactive && onPageClick && 'cursor-pointer hover:stroke-text-3',
            )}
            onClick={interactive && onPageClick ? () => onPageClick(p.fromPage) : undefined}
          />
        ))}
      </g>
      <g>
        {layout.edges.map(([a, b], k) => {
          const na = layout.nodes[a]!
          const nb = layout.nodes[b]!
          const incident = sel >= 0 && (a === sel || b === sel)
          const hoverIncident = sel < 0 && hov >= 0 && (a === hov || b === hov)
          return (
            <line
              key={k}
              x1={sx(na.x)}
              y1={sy(na.y)}
              x2={sx(nb.x)}
              y2={sy(nb.y)}
              pathLength={1}
              strokeWidth={incident ? 2 : 1.25}
              className={cn(
                'transition-[stroke,opacity] duration-150',
                incident ? 'stroke-signal' : hoverIncident ? 'stroke-text-3' : 'stroke-line-strong',
                sel >= 0 && !incident && 'opacity-40',
                animate && 'kc2-draw',
              )}
              style={animate ? { animationDelay: `${1200 + layout.edgeRank[k]! * (540 / layout.edges.length)}ms` } : undefined}
            />
          )
        })}
      </g>
      <g>
        {layout.nodes.map((n, i) => {
          const isSel = i === sel
          const dim = sel >= 0 && !isSel && !neighbor.has(i) && i !== hov
          return (
            <g
              key={n.id}
              className={cn(interactive && 'cursor-pointer', animate && 'kc2-pop')}
              style={animate ? { animationDelay: `${rank[i]! * 30}ms` } : undefined}
              onPointerEnter={() => hover(n.id)}
              onPointerLeave={() => hover(null)}
              onClick={() => select(n.id)}
            >
              {interactive && <circle cx={sx(n.x)} cy={sy(n.y)} r={Math.max(radius(i) + 8, 16)} fill="transparent" />}
              {isSel && <circle cx={sx(n.x)} cy={sy(n.y)} r={radius(i) * 1.55} className="fill-none stroke-signal" strokeWidth={1.5} />}
              <circle
                cx={sx(n.x)}
                cy={sy(n.y)}
                r={radius(i) * (isSel ? 1.25 : i === hov ? 1.15 : 1)}
                className={cn(
                  'transition-[fill,opacity] duration-150',
                  isSel ? 'fill-signal' : n.importance === 3 ? 'fill-amber' : n.importance === 2 ? 'fill-[#C3CBD6]' : 'fill-[#8A95A5]',
                  dim && 'opacity-35',
                )}
              />
            </g>
          )
        })}
      </g>
      <g className="pointer-events-none">
        {labels.map(({ index, left, top }) => {
          const isSel = index === sel
          const dim = sel >= 0 && !isSel && !neighbor.has(index) && index !== hov
          return (
            <text
              key={layout.nodes[index]!.id}
              x={left}
              y={top + 14}
              className={cn('text-[12.5px] font-medium', isSel ? 'fill-signal' : 'fill-text', dim && 'opacity-45')}
              paintOrder="stroke"
              stroke="var(--color-ink)"
              strokeWidth={4}
              strokeLinejoin="round"
            >
              {graph.concepts[index]!.title}
            </text>
          )
        })}
      </g>
    </g>
  )
}
