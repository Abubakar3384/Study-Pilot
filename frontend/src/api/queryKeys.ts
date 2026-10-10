/** Query-key factory: one place to see (and invalidate) every cached server resource. */
export const qk = {
  documents: ['documents'] as const,
  document: (id: string) => ['documents', id] as const,
  page: (id: string, n: number) => ['documents', id, 'pages', n] as const,
  summary: (id: string) => ['documents', id, 'summary'] as const,
  notes: (id: string) => ['documents', id, 'notes'] as const,
  concepts: (id: string) => ['documents', id, 'concepts'] as const,
  quizzes: (id: string) => ['documents', id, 'quizzes'] as const,
  quiz: (quizId: string) => ['quizzes', quizId] as const,
  attempts: (quizId: string) => ['quizzes', quizId, 'attempts'] as const,
  flashcards: (id: string, due: boolean) => ['documents', id, 'flashcards', { due }] as const,
  conversations: (id: string) => ['documents', id, 'conversations'] as const,
  conversation: (id: string, cid: string) => ['documents', id, 'conversations', cid] as const,
  activity: ['activity'] as const,
}
