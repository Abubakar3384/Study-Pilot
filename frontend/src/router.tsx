import { createBrowserRouter } from 'react-router'
import { AppShell, ShellFallback } from './app/AppShell'
import { RouteError } from './app/RouteError'
import { routeModules, type RouteModuleName } from './app/routes'

/** Adapts a route module (default-exported component) to React Router's `lazy`. */
const page = (name: RouteModuleName) => async () => {
  const mod = await routeModules[name]()
  return { Component: mod.default }
}

const devRoutes = import.meta.env.DEV
  ? [
      {
        path: 'lab/canvas',
        lazy: async () => ({ Component: (await import('./dev/lab/CanvasLab')).default }),
      },
    ]
  : []

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    // Painted while the first route chunk loads, so navigation is visible immediately.
    HydrateFallback: ShellFallback,
    ErrorBoundary: RouteError,
    children: [
      { index: true, lazy: page('dashboard') },
      { path: 'library', lazy: page('library') },
      {
        path: 'd/:docId',
        lazy: page('document'),
        children: [
          { index: true, lazy: page('overview') },
          { path: 'notes', lazy: page('notes') },
          { path: 'quiz', lazy: page('quizHome') },
          { path: 'quiz/:quizId', lazy: page('quizRun') },
          { path: 'quiz/:quizId/attempts/:attemptId', lazy: page('quizResults') },
          { path: 'cards', lazy: page('cards') },
          { path: 'ask/:conversationId?', lazy: page('ask') },
          { path: 'review', lazy: page('review') },
        ],
      },
      ...devRoutes,
      { path: '*', lazy: page('notFound') },
    ],
  },
])
