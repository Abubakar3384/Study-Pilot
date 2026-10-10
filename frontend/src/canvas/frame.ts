import type { KnowledgeGraph } from '../domain/types'
import type { GraphLayout } from '../graph/layout'
import { createSnapshot, type SequenceSnapshot } from '../graph/sequence'

/**
 * Mutable per-frame state shared by the scene components, the label layer and picking.
 * Written in useFrame and read imperatively, so nothing here ever triggers a React render.
 */
export interface FrameState {
  layout: GraphLayout
  graph: KnowledgeGraph | null
  snap: SequenceSnapshot
  /** Current animated node positions, xyz per node. */
  nodePos: Float32Array
  /** Current animated node scale multiplier (0 = not yet formed). */
  nodeShown: Float32Array
  /** Current page-surface poses: x, y, z, rotX, rotY, rotZ, scale per surface. */
  pagePose: Float32Array
  /** Selection derived from the store (recomputed on change, not per frame). */
  selected: number
  hovered: number
  neighbor: Uint8Array
  /** Page surfaces cited by the selected (or hovered) concept. */
  citedSurface: Uint8Array
  hoveredSurface: number
  /** Screen projection per node: x, y (CSS px), depth (NDC z) — written by the projector. */
  screen: Float32Array
  /** On-screen node radius in CSS px. */
  pxRadius: Float32Array
  /** Screen centre + half extent of each page surface (x, y, r) for picking. */
  pageScreen: Float32Array
  /** Camera distance relative to its home distance (<1 = zoomed in). */
  zoom: number
  viewport: { width: number; height: number }
}

export const POSE_STRIDE = 7

export function createFrameState(layout: GraphLayout, graph: KnowledgeGraph | null): FrameState {
  const n = layout.nodes.length
  const s = layout.pages.length
  return {
    layout,
    graph,
    snap: createSnapshot(s, n, layout.edges.length),
    nodePos: new Float32Array(n * 3),
    nodeShown: new Float32Array(n),
    pagePose: new Float32Array(s * POSE_STRIDE),
    selected: -1,
    hovered: -1,
    neighbor: new Uint8Array(n),
    citedSurface: new Uint8Array(s),
    hoveredSurface: -1,
    screen: new Float32Array(n * 3),
    pxRadius: new Float32Array(n),
    pageScreen: new Float32Array(s * 3),
    zoom: 1,
    viewport: { width: 1, height: 1 },
  }
}

/** Exponential smoothing step, frame-rate independent. Returns the new value. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}
