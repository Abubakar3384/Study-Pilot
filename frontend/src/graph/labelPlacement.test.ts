import { placeLabels, type LabelCandidate } from './labelPlacement'

const c = (index: number, x: number, y: number, priority: number, w = 80): LabelCandidate => ({ index, x, y, r: 5, w, h: 20, priority })

describe('placeLabels', () => {
  it('places the higher-priority label when two would overlap', () => {
    const placed = placeLabels([c(0, 100, 100, 30), c(1, 105, 104, 50)], 800, 600)
    expect(placed.map((p) => p.index)).toEqual([1])
  })

  it('always shows forced labels (selected and hovered) even when they collide', () => {
    const placed = placeLabels([c(0, 100, 100, 100), c(1, 102, 100, 90), c(2, 104, 100, 50)], 800, 600)
    expect(placed.map((p) => p.index)).toEqual([0, 1])
  })

  it('skips hidden candidates and flips labels near the right edge', () => {
    const placed = placeLabels([c(0, 790, 100, 50), c(1, 300, 300, -1)], 800, 600)
    expect(placed).toHaveLength(1)
    expect(placed[0]!.left).toBeLessThan(790)
  })
})
