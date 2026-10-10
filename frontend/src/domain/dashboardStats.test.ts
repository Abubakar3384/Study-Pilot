import type { ActivityItemDto, DocumentDto } from '../api/types'
import { computeBadges, computeChallenges, computeStats, dailyActivity } from './dashboardStats'

const doc = (id: string): DocumentDto => ({
  id, filename: `${id}.pdf`, size_bytes: 1, status: 'ready', error: null, page_count: 3, starred: false,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
})
const item = (type: ActivityItemDto['type'], at: string, extra: Partial<ActivityItemDto> = {}): ActivityItemDto => ({
  type, at, document_id: 'a', document_filename: 'a.pdf', summary: '', ...extra,
})

const now = new Date(2026, 9, 10, 12)
const items = [
  item('quiz_attempt', new Date(2026, 9, 10, 9).toISOString(), { score: 2, total: 5, attempt_id: 'x' }),
  item('flashcard_review', new Date(2026, 9, 9, 9).toISOString(), { count: 4 }),
  item('conversation', new Date(2026, 9, 9, 10).toISOString()),
  item('document_uploaded', new Date(2026, 9, 8, 10).toISOString()),
  item('quiz_attempt', new Date(2026, 8, 1).toISOString(), { score: 5, total: 5 }), // outside 14 days
]

describe('dashboard stats', () => {
  it('buckets real study actions per day, oldest first, ignoring uploads', () => {
    const days = dailyActivity(items, 14, now)
    expect(days).toHaveLength(14)
    expect(days.at(-1)).toMatchObject({ quizzes: 1, total: 1 })
    expect(days.at(-2)).toMatchObject({ reviews: 4, questions: 1, total: 5 })
    expect(days.at(-3)!.total).toBe(0)
  })

  it('computes averages only from real attempts', () => {
    expect(computeStats([doc('a')], items, 7)).toMatchObject({ documents: 1, quizzesTaken: 2, averageScore: 70, cardsDue: 7, questionsAsked: 1 })
    expect(computeStats([], [], 0).averageScore).toBeNull()
  })

  it('awards badges only for milestones reached', () => {
    const b = Object.fromEntries(computeBadges([doc('a')], items).map((x) => [x.id, x.earned]))
    expect(b).toMatchObject({ 'first-upload': true, 'first-quiz': true, 'high-score': true, curious: false, reviewer: false, regular: true })
  })

  it('builds challenges from due cards and low latest scores', () => {
    const c = computeChallenges([doc('a')], [{ doc: doc('a'), due: 3 }], items)
    expect(c.map((x) => x.kind)).toEqual(['cards', 'retake'])
  })
})
