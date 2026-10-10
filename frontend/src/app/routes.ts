/**
 * Route-module loaders. Each screen is its own chunk; `prefetchRoute` lets links warm a chunk on
 * hover/focus so navigation feels instant without putting every screen in the initial bundle.
 */
export const routeModules = {
  dashboard: () => import('../features/dashboard/DashboardPage'),
  library: () => import('../features/library/LibraryPage'),
  document: () => import('../features/document/DocumentLayout'),
  overview: () => import('../features/document/overview/OverviewPage'),
  notes: () => import('../features/notes/NotesPage'),
  quizHome: () => import('../features/quiz/QuizHomePage'),
  quizRun: () => import('../features/quiz/QuizRunPage'),
  quizResults: () => import('../features/quiz/QuizResultsPage'),
  cards: () => import('../features/flashcards/FlashcardsPage'),
  ask: () => import('../features/ask/AskPage'),
  review: () => import('../features/review/ReviewPage'),
  notFound: () => import('./NotFoundPage'),
} as const

export type RouteModuleName = keyof typeof routeModules

const warmed = new Set<RouteModuleName>()

export function prefetchRoute(name: RouteModuleName) {
  if (warmed.has(name)) return
  warmed.add(name)
  void routeModules[name]().catch(() => warmed.delete(name))
}
