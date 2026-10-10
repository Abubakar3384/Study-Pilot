import { api } from '../client'
import type {
  AnswerCheckDto, AnswerIn, AttemptDto, ConceptMapDto, FlashcardDto, NotesDto, NotesEditDto, QuizDto, ReviewRating,
  SummaryDto,
} from '../types'

export const studyApi = {
  summary: (docId: string, signal?: AbortSignal) => api<SummaryDto>(`/documents/${docId}/summary`, { signal }),
  generateSummary: (docId: string, signal?: AbortSignal) =>
    api<SummaryDto>(`/documents/${docId}/summary`, { method: 'POST', signal }),

  notes: (docId: string, signal?: AbortSignal) => api<NotesDto>(`/documents/${docId}/notes`, { signal }),
  generateNotes: (docId: string, signal?: AbortSignal) =>
    api<NotesDto>(`/documents/${docId}/notes`, { method: 'POST', signal }),
  saveNotes: (docId: string, notes: NotesEditDto) =>
    api<NotesDto>(`/documents/${docId}/notes`, { method: 'PUT', body: notes }),

  concepts: (docId: string, signal?: AbortSignal) => api<ConceptMapDto>(`/documents/${docId}/concepts`, { signal }),
  generateConcepts: (docId: string, signal?: AbortSignal) =>
    api<ConceptMapDto>(`/documents/${docId}/concepts`, { method: 'POST', signal }),

  quizzes: (docId: string, signal?: AbortSignal) =>
    api<{ items: QuizDto[] }>(`/documents/${docId}/quizzes`, { signal }).then((r) => r.items),
  quiz: (quizId: string, signal?: AbortSignal) => api<QuizDto>(`/quizzes/${quizId}`, { signal }),
  /** `pages` focuses the quiz on those pages (and their neighbours), e.g. one concept's sources. */
  generateQuiz: (docId: string, numQuestions: number, pages?: number[], signal?: AbortSignal) =>
    api<QuizDto>(`/documents/${docId}/quizzes`, {
      method: 'POST',
      signal,
      body: { num_questions: numQuestions, ...(pages?.length ? { pages } : {}) },
    }),
  checkAnswer: (quizId: string, questionId: string, selectedIndex: number | null) =>
    api<AnswerCheckDto>(`/quizzes/${quizId}/questions/${questionId}/check`, {
      method: 'POST',
      body: { selected_index: selectedIndex },
    }),
  attempts: (quizId: string, signal?: AbortSignal) =>
    api<{ items: AttemptDto[] }>(`/quizzes/${quizId}/attempts`, { signal }).then((r) => r.items),
  submitAttempt: (quizId: string, answers: AnswerIn[]) =>
    api<AttemptDto>(`/quizzes/${quizId}/attempts`, { method: 'POST', body: { answers } }),

  flashcards: (docId: string, dueOnly = false, signal?: AbortSignal) =>
    api<{ items: FlashcardDto[] }>(`/documents/${docId}/flashcards${dueOnly ? '?due=true' : ''}`, { signal }).then(
      (r) => r.items,
    ),
  generateFlashcards: (docId: string, count: number, signal?: AbortSignal) =>
    api<{ items: FlashcardDto[] }>(`/documents/${docId}/flashcards`, { method: 'POST', body: { count }, signal }).then(
      (r) => r.items,
    ),
  review: (cardId: string, rating: ReviewRating) =>
    api<FlashcardDto>(`/flashcards/${cardId}/reviews`, { method: 'POST', body: { rating } }),
}
