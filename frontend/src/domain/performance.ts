import type { Concept, KnowledgeGraph } from './types'

export interface ResultLike {
  page_number: number
  is_correct: boolean
}

export type TopicStatus = 'weak' | 'strong' | 'mixed' | 'few'

export interface TopicPerformance {
  concept: Concept
  correct: number
  total: number
  status: TopicStatus
}

/** Thresholds: at least 2 questions before calling a topic weak (<60%) or strong (≥80%). */
export const WEAK_BELOW = 0.6
export const STRONG_FROM = 0.8

/**
 * Attributes quiz results to concepts through the pages both cite. A question counts for every
 * concept that cites its page; if none does, for the concept(s) citing the nearest page (±1).
 * Questions that can't be attributed are reported separately rather than guessed.
 */
export function computeTopicPerformance(graph: KnowledgeGraph, results: ResultLike[]) {
  const stats = new Map<string, { correct: number; total: number }>()
  let unattributed = 0

  for (const r of results) {
    let matches = graph.concepts.filter((c) => c.pages.includes(r.page_number))
    if (matches.length === 0) {
      matches = graph.concepts.filter((c) => c.pages.some((p) => Math.abs(p - r.page_number) === 1))
    }
    if (matches.length === 0) {
      unattributed++
      continue
    }
    for (const c of matches) {
      const s = stats.get(c.id) ?? { correct: 0, total: 0 }
      s.total++
      if (r.is_correct) s.correct++
      stats.set(c.id, s)
    }
  }

  const topics: TopicPerformance[] = graph.concepts
    .filter((c) => stats.has(c.id))
    .map((concept) => {
      const { correct, total } = stats.get(concept.id)!
      const ratio = correct / total
      const status: TopicStatus = total < 2 ? 'few' : ratio < WEAK_BELOW ? 'weak' : ratio >= STRONG_FROM ? 'strong' : 'mixed'
      return { concept, correct, total, status }
    })
    .sort((a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total || b.concept.importance - a.concept.importance)

  return { topics, unattributed }
}
