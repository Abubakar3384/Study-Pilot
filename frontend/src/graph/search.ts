import type { Concept } from '../domain/types'

const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Ranks concepts for a query: title prefix > word prefix > title substring > explanation match.
 * Ties go to more important concepts. Empty query returns [].
 */
export function searchConcepts(concepts: Concept[], query: string, limit = 8): Concept[] {
  const q = normalize(query.trim())
  if (!q) return []
  const scored: Array<[number, Concept]> = []
  for (const c of concepts) {
    const title = normalize(c.title)
    let score = 0
    if (title.startsWith(q)) score = 400
    else if (title.split(/[\s\-/]+/).some((w) => w.startsWith(q))) score = 300
    else if (title.includes(q)) score = 200
    else if (c.explanation && normalize(c.explanation).includes(q)) score = 100
    if (score) scored.push([score + c.importance, c])
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, c]) => c)
}
