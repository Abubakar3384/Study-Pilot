import type { Concept, KnowledgeGraph } from '../domain/types'

/** Concept id → ids of directly connected concepts (links are treated as undirected). */
export function buildAdjacency(graph: KnowledgeGraph): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>(graph.concepts.map((c) => [c.id, new Set()]))
  for (const { source, target } of graph.links) {
    if (source === target || !adj.has(source) || !adj.has(target)) continue
    adj.get(source)!.add(target)
    adj.get(target)!.add(source)
  }
  return adj
}

export function neighborsOf(graph: KnowledgeGraph, adj: Map<string, Set<string>>, id: string): Concept[] {
  const ids = adj.get(id)
  if (!ids) return []
  return graph.concepts.filter((c) => ids.has(c.id)).sort((a, b) => b.importance - a.importance)
}
