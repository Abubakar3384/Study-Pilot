import type { ActivityItemDto, DocumentDto } from '../api/types'
import { documentTitle } from '../data/format'

/**
 * One clear next action, chosen by fixed rules from real data. Each suggestion states where it comes
 * from, so it never reads as an unexplained AI recommendation.
 */
export type Suggestion =
  | { kind: 'due-cards'; doc: DocumentDto; count: number; title: string; reason: string }
  | { kind: 'review-quiz'; doc: DocumentDto; quizId: string; attemptId: string; title: string; reason: string }
  | { kind: 'first-quiz'; doc: DocumentDto; title: string; reason: string }
  | { kind: 'upload'; title: string; reason: string }

export const REVIEW_BELOW = 0.7

export function suggestNext(
  docs: DocumentDto[],
  dueCounts: Array<{ doc: DocumentDto; due: number }>,
  activity: ActivityItemDto[],
): Suggestion {
  const due = [...dueCounts].filter((d) => d.due > 0).sort((a, b) => b.due - a.due)[0]
  if (due) {
    return {
      kind: 'due-cards',
      doc: due.doc,
      count: due.due,
      title: `Review ${due.due} due flashcard${due.due === 1 ? '' : 's'}`,
      reason: `Spaced repetition says these cards from ${documentTitle(due.doc)} are due now.`,
    }
  }

  const byId = new Map(docs.map((d) => [d.id, d]))
  const attempts = activity.filter((a) => a.type === 'quiz_attempt' && a.total && byId.has(a.document_id))
  const latestPerDoc = new Map<string, ActivityItemDto>()
  for (const a of attempts) if (!latestPerDoc.has(a.document_id)) latestPerDoc.set(a.document_id, a)
  const low = [...latestPerDoc.values()].find((a) => (a.score ?? 0) / (a.total ?? 1) < REVIEW_BELOW)
  if (low && low.quiz_id && low.attempt_id) {
    const doc = byId.get(low.document_id)!
    return {
      kind: 'review-quiz',
      doc,
      quizId: low.quiz_id,
      attemptId: low.attempt_id,
      title: `Revisit ${documentTitle(doc)}`,
      reason: `Your last quiz scored ${low.score}/${low.total}. Review the topics you missed.`,
    }
  }

  const untested = docs.find((d) => d.status === 'ready' && !latestPerDoc.has(d.id))
  if (untested) {
    return {
      kind: 'first-quiz',
      doc: untested,
      title: `Test yourself on ${documentTitle(untested)}`,
      reason: 'You haven’t taken a quiz on this document yet.',
    }
  }

  return {
    kind: 'upload',
    title: 'Add your next reading',
    reason: docs.length ? 'You’re up to date on every document.' : 'Upload a lecture PDF to get started.',
  }
}
