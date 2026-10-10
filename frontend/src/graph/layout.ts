import type { Concept, ConceptImportance, KnowledgeGraph } from '../domain/types'

/**
 * Deterministic spatial layout shared by the 3D scene, the SVG fallback and the loading placeholder.
 * Space carries meaning:
 *   x  = where the concept appears in the document (mean cited page), left to right
 *   z  = importance (key concepts forward, details further back)
 *   y  = free axis, resolved by a small seeded force relaxation so related concepts sit near each other
 * No Math.random: the same graph always produces the same picture.
 */

export const WORLD = { width: 10, height: 4.2 } as const
export const MAX_PAGE_SURFACES = { high: 24, low: 12 } as const

export interface Pose {
  x: number
  y: number
  z: number
  rotX: number
  rotY: number
  rotZ: number
  scale: number
}

export interface PageSurface {
  index: number
  /** Inclusive 1-based page range this surface stands for. */
  fromPage: number
  toPage: number
  /** Fanned out in front of the camera while the document is being read. */
  fan: Pose
  /** Resting place behind the graph once concepts have formed (the "source strip"). */
  strip: Pose
}

export interface NodeLayout {
  id: string
  index: number
  x: number
  y: number
  z: number
  radius: number
  importance: ConceptImportance
  /** 0..1 position in the document. */
  docPos: number
  /** Page surface the node emerges from during formation. */
  spawnSurface: number
}

export interface GraphLayout {
  version: string
  nodes: NodeLayout[]
  byId: Map<string, number>
  /** Undirected edges as node-index pairs, oriented from the endpoint reached first by the draw order. */
  edges: Array<[number, number]>
  /** Node indices in spawn order (key concepts first, then document order). */
  nodeOrder: number[]
  /** Per-edge rank in the draw sequence (0 = first). */
  edgeRank: number[]
  pages: PageSurface[]
  pageCount: number
}

export const NODE_RADIUS: Record<ConceptImportance, number> = { 3: 0.17, 2: 0.115, 1: 0.08 }
const IMPORTANCE_Z: Record<ConceptImportance, number> = { 3: 0.9, 2: 0, 1: -0.9 }

/** FNV-1a hash → [0, 1). */
export function hash01(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 4294967296
}

export function surfaceCount(pageCount: number, maxSurfaces: number): number {
  return Math.max(1, Math.min(Math.max(1, pageCount), maxSurfaces))
}

export function surfaceForPage(page: number, pageCount: number, surfaces: number): number {
  if (pageCount <= 1) return 0
  return Math.min(surfaces - 1, Math.max(0, Math.floor(((page - 1) * surfaces) / pageCount)))
}

export function layoutPages(pageCount: number, maxSurfaces: number): PageSurface[] {
  const n = surfaceCount(pageCount, maxSurfaces)
  const fanWidth = Math.min(WORLD.width * 0.78, n * 0.62)
  const out: PageSurface[] = []
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? (i / (n - 1)) * 2 - 1 : 0
    const fromPage = Math.floor((i * Math.max(pageCount, 1)) / n) + 1
    const toPage = Math.max(fromPage, Math.floor(((i + 1) * Math.max(pageCount, 1)) / n))
    out.push({
      index: i,
      fromPage,
      toPage,
      fan: {
        x: (u * fanWidth) / 2,
        y: 0.15 - 0.25 * u * u,
        z: 0.7 - 0.9 * u * u + i * 0.002,
        rotX: 0,
        rotY: -u * 0.42,
        rotZ: -u * 0.07,
        scale: 1.25,
      },
      strip: {
        x: u * WORLD.width * 0.47,
        y: -2.6,
        z: -1.5 - 0.5 * u * u,
        rotX: -1.05,
        rotY: -u * 0.22,
        rotZ: 0,
        scale: 0.78,
      },
    })
  }
  return out
}

function docPosition(concept: Concept, pageCount: number): number {
  if (pageCount <= 1 || concept.pages.length === 0) return 0.5
  const mean = concept.pages.reduce((s, p) => s + p, 0) / concept.pages.length
  return Math.min(1, Math.max(0, (mean - 1) / (pageCount - 1)))
}

export function layoutGraph(graph: KnowledgeGraph, maxSurfaces: number = MAX_PAGE_SURFACES.high): GraphLayout {
  const { concepts, pageCount } = graph
  const pages = layoutPages(pageCount, maxSurfaces)
  const byId = new Map(concepts.map((c, i) => [c.id, i]))

  // Unique undirected edges between known, distinct concepts.
  const seen = new Set<string>()
  const rawEdges: Array<[number, number]> = []
  for (const link of graph.links) {
    const a = byId.get(link.source)
    const b = byId.get(link.target)
    if (a === undefined || b === undefined || a === b) continue
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    if (seen.has(key)) continue
    seen.add(key)
    rawEdges.push([a, b])
  }

  const n = concepts.length
  const halfW = WORLD.width * 0.45
  const targetX = concepts.map((c) => (docPosition(c, pageCount) * 2 - 1) * halfW)
  const targetZ = concepts.map((c) => IMPORTANCE_Z[c.importance])
  const px = targetX.slice()
  const py = concepts.map((c) => (hash01(c.id) - 0.5) * 3)
  const pz = concepts.map((c, i) => targetZ[i]! + (hash01(`${c.id}:z`) - 0.5) * 0.5)
  const vx = new Float64Array(n)
  const vy = new Float64Array(n)
  const vz = new Float64Array(n)

  const ITER = 320
  for (let it = 0; it < ITER; it++) {
    const alpha = 1 - it / ITER
    // Repulsion (z counts half: depth separation reads less clearly on screen).
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = px[i]! - px[j]!
        const dy = py[i]! - py[j]!
        const dz = (pz[i]! - pz[j]!) * 0.5
        const d2 = Math.max(dx * dx + dy * dy + dz * dz, 0.01)
        if (d2 > 6) continue
        const f = (0.05 * alpha) / d2
        const d = Math.sqrt(d2)
        vx[i]! += (dx / d) * f * 0.3
        vx[j]! -= (dx / d) * f * 0.3
        vy[i]! += (dy / d) * f
        vy[j]! -= (dy / d) * f
        vz[i]! += (dz / d) * f * 0.5
        vz[j]! -= (dz / d) * f * 0.5
      }
    }
    // Springs along edges.
    for (const [a, b] of rawEdges) {
      const dx = px[b]! - px[a]!
      const dy = py[b]! - py[a]!
      const dz = pz[b]! - pz[a]!
      const d = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 0.01)
      const f = (d - 1.5) * 0.012 * alpha
      vx[a]! += (dx / d) * f * 0.3
      vx[b]! -= (dx / d) * f * 0.3
      vy[a]! += (dy / d) * f
      vy[b]! -= (dy / d) * f
      vz[a]! += (dz / d) * f * 0.3
      vz[b]! -= (dz / d) * f * 0.3
    }
    for (let i = 0; i < n; i++) {
      vx[i]! += (targetX[i]! - px[i]!) * 0.12
      vy[i]! += -py[i]! * 0.004
      vz[i]! += (targetZ[i]! - pz[i]!) * 0.08
      vx[i]! *= 0.6
      vy[i]! *= 0.6
      vz[i]! *= 0.6
      px[i]! += vx[i]!
      py[i]! += vy[i]!
      pz[i]! += vz[i]!
    }
  }

  // Fit vertically, then separate any nodes that still overlap on screen.
  const maxY = Math.max(0.001, ...py.map(Math.abs))
  const limit = WORLD.height / 2
  if (maxY > limit) for (let i = 0; i < n; i++) py[i]! *= limit / maxY
  for (let pass = 0; pass < 40; pass++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = px[i]! - px[j]!
        const dy = py[i]! - py[j]!
        const min = 0.55
        if (dx * dx + dy * dy >= min * min) continue
        const push = (min - Math.sqrt(dx * dx + dy * dy)) / 2 + 0.001
        const dir = dy === 0 ? (i < j ? 1 : -1) : Math.sign(dy)
        py[i] = clamp(py[i]! + dir * push, -limit, limit)
        py[j] = clamp(py[j]! - dir * push, -limit, limit)
        moved = true
      }
    }
    if (!moved) break
  }

  const nodes: NodeLayout[] = concepts.map((c, i) => ({
    id: c.id,
    index: i,
    x: px[i]!,
    y: py[i]!,
    z: pz[i]!,
    radius: NODE_RADIUS[c.importance],
    importance: c.importance,
    docPos: docPosition(c, pageCount),
    spawnSurface: surfaceForPage(c.pages[0] ?? 1, pageCount, pages.length),
  }))

  const nodeOrder = nodes
    .map((nd) => nd.index)
    .sort((a, b) => nodes[b]!.importance - nodes[a]!.importance || nodes[a]!.docPos - nodes[b]!.docPos || a - b)

  const { edges, edgeRank } = orderEdges(n, rawEdges, nodes)
  return { version: graph.version, nodes, byId, edges, nodeOrder, edgeRank, pages, pageCount }
}

/** Breadth-first draw order from the most central key concept; edges point away from the root. */
function orderEdges(n: number, rawEdges: Array<[number, number]>, nodes: NodeLayout[]) {
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const [a, b] of rawEdges) {
    adj[a]!.push(b)
    adj[b]!.push(a)
  }
  const depth = new Array<number>(n).fill(Infinity)
  const byPriority = nodes
    .map((nd) => nd.index)
    .sort((a, b) => nodes[b]!.importance - nodes[a]!.importance || adj[b]!.length - adj[a]!.length || a - b)
  let offset = 0
  for (const root of byPriority) {
    if (depth[root] !== Infinity) continue
    depth[root] = offset
    const queue = [root]
    let maxDepth = offset
    while (queue.length) {
      const cur = queue.shift()!
      for (const next of adj[cur]!) {
        if (depth[next] !== Infinity) continue
        depth[next] = depth[cur]! + 1
        maxDepth = Math.max(maxDepth, depth[next]!)
        queue.push(next)
      }
    }
    offset = maxDepth + 1
  }
  const edges = rawEdges.map(([a, b]) => (depth[a]! <= depth[b]! ? [a, b] : [b, a]) as [number, number])
  const order = edges
    .map((_, i) => i)
    .sort((i, j) => {
      const [a1, b1] = edges[i]!
      const [a2, b2] = edges[j]!
      return depth[a1]! - depth[a2]! || depth[b1]! - depth[b2]! || i - j
    })
  const edgeRank = new Array<number>(edges.length)
  order.forEach((edgeIndex, rank) => {
    edgeRank[edgeIndex] = rank
  })
  return { edges, edgeRank }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}
