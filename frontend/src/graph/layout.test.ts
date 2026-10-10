import { sampleGraph } from '../fixtures/sample-graph'
import { layoutGraph, layoutPages, surfaceForPage, WORLD } from './layout'
import { searchConcepts } from './search'
import { buildAdjacency, neighborsOf } from './neighbors'

describe('layoutGraph', () => {
  const layout = layoutGraph(sampleGraph)

  it('is deterministic', () => {
    const again = layoutGraph(sampleGraph)
    expect(again.nodes.map((n) => [n.x, n.y, n.z])).toEqual(layout.nodes.map((n) => [n.x, n.y, n.z]))
    expect(again.edgeRank).toEqual(layout.edgeRank)
  })

  it('keeps nodes inside the world bounds', () => {
    for (const n of layout.nodes) {
      expect(Math.abs(n.x)).toBeLessThanOrEqual(WORLD.width / 2)
      expect(Math.abs(n.y)).toBeLessThanOrEqual(WORLD.height / 2 + 1e-9)
    }
  })

  it('orders x by position in the document', () => {
    const x = (id: string) => layout.nodes[layout.byId.get(id)!]!.x
    expect(x('cell-theory')).toBeLessThan(x('mitochondria'))
    expect(x('mitochondria')).toBeLessThan(x('cancer'))
  })

  it('puts key concepts in front of details', () => {
    const z = (id: string) => layout.nodes[layout.byId.get(id)!]!.z
    expect(z('cell-theory')).toBeGreaterThan(z('fluid-mosaic'))
  })

  it('leaves no two nodes overlapping on screen', () => {
    const { nodes } = layout
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i]!.x - nodes[j]!.x, nodes[i]!.y - nodes[j]!.y)
        expect(d, `${nodes[i]!.id} vs ${nodes[j]!.id}`).toBeGreaterThan(nodes[i]!.radius + nodes[j]!.radius)
      }
    }
  })

  it('spawns key concepts first and draws every edge once', () => {
    expect(layout.nodes[layout.nodeOrder[0]!]!.importance).toBe(3)
    expect([...layout.edgeRank].sort((a, b) => a - b)).toEqual(layout.edges.map((_, i) => i))
  })

  it('ignores links to unknown concepts, self links and duplicates', () => {
    const g = {
      ...sampleGraph,
      links: [
        ...sampleGraph.links,
        { source: 'atp', target: 'atp', kind: 'related' as const },
        { source: 'atp', target: 'ghost', kind: 'related' as const },
        { source: 'atp', target: 'mitochondria', kind: 'related' as const },
      ],
    }
    expect(layoutGraph(g).edges).toHaveLength(layout.edges.length)
  })
})

describe('page surfaces', () => {
  it('uses one surface per page up to the cap, covering every page once', () => {
    expect(layoutPages(5, 24)).toHaveLength(5)
    const many = layoutPages(100, 24)
    expect(many).toHaveLength(24)
    expect(many[0]!.fromPage).toBe(1)
    expect(many.at(-1)!.toPage).toBe(100)
    for (let i = 1; i < many.length; i++) expect(many[i]!.fromPage).toBe(many[i - 1]!.toPage + 1)
  })

  it('maps pages to the surface that covers them', () => {
    const surfaces = layoutPages(100, 24)
    for (const page of [1, 37, 64, 100]) {
      const s = surfaces[surfaceForPage(page, 100, 24)]!
      expect(page).toBeGreaterThanOrEqual(s.fromPage)
      expect(page).toBeLessThanOrEqual(s.toPage)
    }
  })
})

describe('search and neighbours', () => {
  it('ranks title prefixes above substring and explanation matches', () => {
    const titles = searchConcepts(sampleGraph.concepts, 'cell').map((c) => c.title)
    expect(titles[0]).toMatch(/^Cell/)
    expect(searchConcepts(sampleGraph.concepts, 'glucose').map((c) => c.id)).toContain('glycolysis')
    expect(searchConcepts(sampleGraph.concepts, '  ')).toEqual([])
  })

  it('treats links as undirected', () => {
    const adj = buildAdjacency(sampleGraph)
    expect(neighborsOf(sampleGraph, adj, 'golgi').map((c) => c.id)).toEqual(['endomembrane-system'])
    expect(adj.get('endomembrane-system')!.has('golgi')).toBe(true)
  })
})
