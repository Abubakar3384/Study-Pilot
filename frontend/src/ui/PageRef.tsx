import { useSearchParams } from 'react-router'
import { cn } from './cn'

/**
 * Source citation chip ("p. 12"). Opens the document's source drawer at that page via `?page=`,
 * so it works from any screen inside a document and the back button closes the drawer.
 */
export function PageRef({ page, snippet, className }: { page: number; snippet?: string; className?: string }) {
  const [params, setParams] = useSearchParams()
  return (
    <button
      type="button"
      title={snippet ? `p. ${page}: “${snippet}”` : `Open page ${page}`}
      aria-label={`Open source page ${page}`}
      onClick={() => {
        const next = new URLSearchParams(params)
        next.set('page', String(page))
        if (snippet) next.set('q', snippet.slice(0, 160))
        else next.delete('q')
        setParams(next)
      }}
      className={cn(
        'inline-flex h-6 items-center rounded-sm border border-line-strong px-1.5 font-mono text-xs text-text-2 tabular',
        'transition-colors hover:border-signal hover:text-signal',
        className,
      )}
    >
      p.&nbsp;{page}
    </button>
  )
}
