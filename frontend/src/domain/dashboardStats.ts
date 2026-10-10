import type { ActivityItemDto, DocumentDto } from '../api/types'
import { documentTitle } from '../data/format'

/** Everything here is derived from real activity; nothing is estimated or invented. */

export interface DayBucket {
  /** Local date, YYYY-MM-DD. */
  date: string
  quizzes: number
  reviews: number
  questions: number
  total: number
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Study actions per day for the last `days` days (oldest first). Uploads are not study, so not counted. */
export function dailyActivity(items: ActivityItemDto[], days = 14, now = new Date()): DayBucket[] {
  const buckets: DayBucket[] = []
  const index = new Map<string, DayBucket>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const b = { date: dayKey(d), quizzes: 0, reviews: 0, questions: 0, total: 0 }
    buckets.push(b)
    index.set(b.date, b)
  }
  for (const item of items) {
    const b = index.get(dayKey(new Date(item.at)))
    if (!b) continue
    if (item.type === 'quiz_attempt') b.quizzes++
    else if (item.type === 'flashcard_review') b.reviews += item.count ?? 1
    else if (item.type === 'conversation') b.questions++
    else continue
    b.total = b.quizzes + b.reviews + b.questions
  }
  return buckets
}

export interface Stats {
  documents: number
  quizzesTaken: number
  averageScore: number | null
  cardsDue: number
  questionsAsked: number
}

export function computeStats(docs: DocumentDto[], items: ActivityItemDto[], cardsDue: number): Stats {
  const attempts = items.filter((i) => i.type === 'quiz_attempt' && i.total)
  const pct = attempts.map((a) => (a.score ?? 0) / a.total!)
  return {
    documents: docs.filter((d) => d.status === 'ready').length,
    quizzesTaken: attempts.length,
    averageScore: pct.length ? Math.round((pct.reduce((s, p) => s + p, 0) / pct.length) * 100) : null,
    cardsDue,
    questionsAsked: items.filter((i) => i.type === 'conversation').length,
  }
}

export interface Badge {
  id: string
  title: string
  howTo: string
  earned: boolean
  tone: 'blue' | 'lavender' | 'pink' | 'mint' | 'butter'
}

/** Milestones the student actually reached; locked ones say how to earn them. */
export function computeBadges(docs: DocumentDto[], items: ActivityItemDto[]): Badge[] {
  const attempts = items.filter((i) => i.type === 'quiz_attempt' && i.total)
  const reviews = items.filter((i) => i.type === 'flashcard_review').reduce((s, i) => s + (i.count ?? 1), 0)
  const questions = items.filter((i) => i.type === 'conversation').length
  const activeDays = new Set(items.filter((i) => i.type !== 'document_uploaded').map((i) => dayKey(new Date(i.at)))).size
  return [
    { id: 'first-upload', title: 'First upload', howTo: 'Upload a PDF', earned: docs.length > 0, tone: 'blue' },
    { id: 'first-quiz', title: 'Quiz taker', howTo: 'Finish a quiz', earned: attempts.length > 0, tone: 'lavender' },
    { id: 'high-score', title: 'High scorer', howTo: 'Score 80% or more', earned: attempts.some((a) => (a.score ?? 0) / a.total! >= 0.8), tone: 'butter' },
    { id: 'curious', title: 'Curious mind', howTo: 'Ask 5 questions', earned: questions >= 5, tone: 'pink' },
    { id: 'reviewer', title: 'Card reviewer', howTo: 'Review 25 flashcards', earned: reviews >= 25, tone: 'mint' },
    { id: 'regular', title: 'Regular', howTo: 'Study on 3 different days', earned: activeDays >= 3, tone: 'blue' },
  ]
}

export interface Challenge {
  id: string
  title: string
  detail: string
  href: string
  kind: 'cards' | 'retake' | 'quiz'
}

/** Today's concrete tasks, from due cards and quiz results (at most `limit`). */
export function computeChallenges(
  docs: DocumentDto[],
  due: Array<{ doc: DocumentDto; due: number }>,
  items: ActivityItemDto[],
  limit = 3,
): Challenge[] {
  const out: Challenge[] = []
  for (const { doc, due: n } of [...due].sort((a, b) => b.due - a.due)) {
    if (n > 0) out.push({ id: `cards-${doc.id}`, kind: 'cards', title: `Review ${n} due card${n === 1 ? '' : 's'}`, detail: documentTitle(doc), href: `/d/${doc.id}/cards?due=1` })
  }
  const seen = new Set<string>()
  for (const a of items) {
    if (a.type !== 'quiz_attempt' || !a.total || seen.has(a.document_id)) continue
    seen.add(a.document_id)
    if ((a.score ?? 0) / a.total < 0.7) {
      out.push({ id: `retake-${a.attempt_id}`, kind: 'retake', title: `Retake: scored ${a.score}/${a.total}`, detail: documentTitle({ filename: a.document_filename }), href: `/d/${a.document_id}/review` })
    }
  }
  for (const d of docs) {
    if (d.status === 'ready' && !seen.has(d.id)) out.push({ id: `quiz-${d.id}`, kind: 'quiz', title: 'Take a first quiz', detail: documentTitle(d), href: `/d/${d.id}/quiz` })
  }
  return out.slice(0, limit)
}
