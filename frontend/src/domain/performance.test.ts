import type { ActivityItemDto, DocumentDto } from '../api/types'
import { sampleGraph } from '../fixtures/sample-graph'
import { computeTopicPerformance } from './performance'
import { suggestNext } from './suggestions'

describe('computeTopicPerformance', () => {
  it('attributes results to concepts via cited pages and classifies them', () => {
    // p.6: passive transport, diffusion, osmosis. p.12: ATP, respiration, glycolysis, Krebs.
    const results = [
      { page_number: 6, is_correct: false },
      { page_number: 6, is_correct: false },
      { page_number: 12, is_correct: true },
      { page_number: 12, is_correct: true },
      { page_number: 7, is_correct: true },
    ]
    const { topics, unattributed } = computeTopicPerformance(sampleGraph, results)
    const by = (id: string) => topics.find((t) => t.concept.id === id)!
    expect(by('diffusion')).toMatchObject({ correct: 0, total: 2, status: 'weak' })
    expect(by('atp')).toMatchObject({ correct: 2, total: 2, status: 'strong' })
    expect(by('osmosis')).toMatchObject({ correct: 1, total: 3, status: 'weak' })
    expect(by('active-transport')).toMatchObject({ total: 1, status: 'few' })
    expect(unattributed).toBe(0)
    expect(topics[0]!.correct / topics[0]!.total).toBe(0)
  })

  it('falls back to adjacent pages, and reports what it cannot attribute', () => {
    const graph = { ...sampleGraph, concepts: sampleGraph.concepts.filter((c) => c.id === 'cancer') }
    const { topics, unattributed } = computeTopicPerformance(graph, [
      { page_number: 17, is_correct: true },
      { page_number: 2, is_correct: false },
    ])
    expect(topics[0]).toMatchObject({ total: 1 })
    expect(unattributed).toBe(1)
  })
})

const doc = (id: string, over: Partial<DocumentDto> = {}): DocumentDto => ({
  id,
  filename: `${id}.pdf`,
  size_bytes: 1,
  status: 'ready',
  error: null,
  page_count: 4,
  starred: false,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
})

const attempt = (docId: string, score: number, total: number, at: string): ActivityItemDto => ({
  type: 'quiz_attempt',
  at,
  document_id: docId,
  document_filename: `${docId}.pdf`,
  summary: '',
  quiz_id: 'q',
  attempt_id: `a-${at}`,
  score,
  total,
})

describe('suggestNext', () => {
  const a = doc('a')
  const b = doc('b')

  it('prefers due flashcards', () => {
    const s = suggestNext([a, b], [{ doc: a, due: 2 }, { doc: b, due: 5 }], [])
    expect(s).toMatchObject({ kind: 'due-cards', count: 5 })
    expect(s.reason).toMatch(/due now/)
  })

  it('then a low latest quiz score, judged on the latest attempt only', () => {
    const activity = [attempt('a', 4, 5, '2026-10-09T00:00:00Z'), attempt('a', 1, 5, '2026-10-08T00:00:00Z'), attempt('b', 2, 5, '2026-10-07T00:00:00Z')]
    const s = suggestNext([a, b], [], activity)
    expect(s).toMatchObject({ kind: 'review-quiz', doc: { id: 'b' } })
    expect(s.reason).toContain('2/5')
  })

  it('then an untested ready document, then upload', () => {
    expect(suggestNext([doc('c', { status: 'failed' }), b], [], [])).toMatchObject({ kind: 'first-quiz', doc: { id: 'b' } })
    expect(suggestNext([], [], []).kind).toBe('upload')
  })
})
