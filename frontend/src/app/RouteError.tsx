import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Button } from '../ui/Button'

/** Shown when a route fails to load (e.g. a chunk 404 after a deploy) or throws while rendering. */
export function RouteError() {
  const error = useRouteError()
  const chunkFailed = error instanceof Error && /dynamically imported module|Importing a module script/i.test(error.message)
  const title = isRouteErrorResponse(error) && error.status === 404 ? 'Page not found' : 'This screen failed to load'
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6">
      <p className="eyebrow">Error</p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-text-2">
        {chunkFailed
          ? 'Part of the app could not be downloaded. Reloading usually fixes this.'
          : 'Your documents and progress are stored on the server and are not affected.'}
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Link to="/" className="inline-flex h-9 items-center px-3.5 text-text-2 hover:text-text">
          Go to dashboard
        </Link>
      </div>
    </main>
  )
}
