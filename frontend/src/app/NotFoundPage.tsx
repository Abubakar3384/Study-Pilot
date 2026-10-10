import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-3 px-4 py-24">
      <p className="eyebrow">404</p>
      <h1 className="text-2xl font-semibold">Nothing here</h1>
      <p className="text-text-2">The link may be out of date, or the document was deleted.</p>
      <Link to="/" className="text-signal underline underline-offset-4">
        Back to dashboard
      </Link>
    </div>
  )
}
