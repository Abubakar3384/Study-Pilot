import { Link } from 'react-router'
import { AlertTriangle, Loader2, Star } from 'lucide-react'
import type { DocumentDto } from '../../api/types'
import { prefetchRoute } from '../../app/routes'
import { useStarMutation } from '../../data/hooks'
import { documentTitle, timeAgo } from '../../data/format'
import { prefetchCanvas } from '../../graph/loadCanvas'
import { cn } from '../../ui/cn'
import { DeleteDocumentButton } from './DeleteDocument'

export function warmDocument() {
  prefetchRoute('document')
  prefetchRoute('overview')
  prefetchCanvas()
}

/** A document as a row: title, real status, page count, age and a star toggle. */
export function DocumentRow({ doc, compact }: { doc: DocumentDto; compact?: boolean }) {
  const star = useStarMutation()
  return (
    <li className="group flex items-center gap-3 border-b border-line last:border-b-0">
      <Link
        to={`/d/${doc.id}`}
        onMouseEnter={warmDocument}
        onFocus={warmDocument}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-1 transition-colors hover:text-text"
      >
        <DocGlyph status={doc.status} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium text-text group-hover:text-signal">{documentTitle(doc)}</span>
          <span className="block font-mono text-xs text-text-3 tabular">
            {doc.status === 'ready' && `${doc.page_count} pages · `}
            {doc.status === 'failed' && 'Could not be read · '}
            {doc.status === 'processing' && 'Reading… · '}
            {timeAgo(doc.created_at)}
          </span>
        </span>
      </Link>
      {!compact || doc.starred ? (
        <button
          type="button"
          aria-pressed={doc.starred}
          aria-label={doc.starred ? `Unstar ${documentTitle(doc)}` : `Star ${documentTitle(doc)}`}
          onClick={() => star.mutate(doc)}
          className="flex size-9 shrink-0 items-center justify-center rounded-sm text-text-3 transition-colors hover:text-amber"
        >
          <Star className={cn('size-4', doc.starred && 'fill-amber text-amber')} />
        </button>
      ) : null}
      {!compact && <DeleteDocumentButton doc={doc} />}
    </li>
  )
}

function DocGlyph({ status }: { status: DocumentDto['status'] }) {
  if (status === 'failed') return <AlertTriangle aria-hidden className="size-4 shrink-0 text-incorrect" />
  if (status === 'processing') return <Loader2 aria-hidden className="size-4 shrink-0 text-signal motion-safe:animate-spin" />
  return (
    <svg aria-hidden viewBox="0 0 16 20" className="h-5 w-4 shrink-0 text-text-3">
      <path d="M1.5 1.5h9l4 4v13h-13z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 9h8M4 12h8M4 15h5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}
