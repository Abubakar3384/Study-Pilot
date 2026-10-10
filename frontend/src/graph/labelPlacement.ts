/**
 * Greedy screen-space label placement: highest priority first, skip anything that would overlap an
 * already placed label or leave the viewport. Labels at or above `forceAt` are always shown.
 */
export interface LabelCandidate {
  index: number
  /** Node centre in CSS px. */
  x: number
  y: number
  /** Node radius in px; the label sits just right of the node. */
  r: number
  w: number
  h: number
  priority: number
}

export interface PlacedLabel {
  index: number
  left: number
  top: number
}

const PAD = 4

export function placeLabels(cands: LabelCandidate[], width: number, height: number, forceAt = 90): PlacedLabel[] {
  const sorted = [...cands].sort((a, b) => b.priority - a.priority || a.index - b.index)
  const placed: Array<{ l: number; t: number; r: number; b: number }> = []
  const out: PlacedLabel[] = []
  for (const c of sorted) {
    if (c.priority < 0) continue
    // Prefer the right side; flip left near the right edge.
    let left = c.x + c.r + 6
    if (left + c.w > width - 4) left = c.x - c.r - 6 - c.w
    const top = c.y - c.h / 2
    const box = { l: left - PAD, t: top - PAD, r: left + c.w + PAD, b: top + c.h + PAD }
    const inside = box.l >= 0 && box.t >= 0 && box.r <= width && box.b <= height
    const collides = placed.some((p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t)
    if (c.priority >= forceAt || (inside && !collides)) {
      placed.push(box)
      out.push({ index: c.index, left, top })
    }
  }
  return out
}
