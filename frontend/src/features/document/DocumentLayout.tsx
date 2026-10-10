import { useMemo } from 'react'
import { Link, NavLink, useLocation, useOutlet, useParams, useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, m } from 'motion/react'
import { AlertTriangle, BookOpenText, ChevronLeft, FileText, Layers, LayoutGrid, ListChecks, MessageSquareText, RotateCcw, Star, Target } from 'lucide-react'
import { documentsApi } from '../../api/endpoints/documents'
import { ApiError } from '../../api/errors'
import { qk } from '../../api/queryKeys'
import { prefetchRoute, type RouteModuleName } from '../../app/routes'
import { useDocument, useStarMutation } from '../../data/hooks'
import { documentTitle } from '../../data/format'
import { defaultViewMode } from '../../graph/capability'
import { getGraphStore } from '../../graph/graphStore'
import { ExitInert } from '../../motion/ExitInert'
import { fadeRise, t } from '../../motion/variants'
import { Button } from '../../ui/Button'
import { ErrorNotice, ProgressBar, Skeleton } from '../../ui/Feedback'
import { cn } from '../../ui/cn'
import type { DocumentContext } from './context'
import { SourceDrawer } from './SourceDrawer'

const TABS: Array<{ to: string; label: string; icon: typeof LayoutGrid; module: RouteModuleName; end?: boolean }> = [
  { to: '', label: 'Overview', icon: LayoutGrid, module: 'overview', end: true },
  { to: 'notes', label: 'Notes', icon: BookOpenText, module: 'notes' },
  { to: 'quiz', label: 'Quiz', icon: ListChecks, module: 'quizHome' },
  { to: 'cards', label: 'Flashcards', icon: Layers, module: 'cards' },
  { to: 'ask', label: 'Ask', icon: MessageSquareText, module: 'ask' },
  { to: 'review', label: 'Review', icon: Target, module: 'review' },
]

/**
 * The document workspace. Header, tabs and source drawer stay mounted while tab content
 * crossfades, so switching between Overview, Notes, Quiz… never rebuilds the surroundings.
 */
export default function DocumentLayout() {
  const { docId = '' } = useParams()
  const doc = useDocument(docId)
  const store = useMemo(() => getGraphStore(docId, defaultViewMode()), [docId])

  if (doc.isPending) return <LayoutSkeleton />
  if (doc.isError) {
    const missing = doc.error instanceof ApiError && doc.error.status === 404
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        {missing ? (
          <>
            <p className="eyebrow">Not found</p>
            <h1 className="mt-2 text-2xl font-semibold">This document doesn’t exist any more</h1>
            <p className="mt-2 text-text-2">It may have been deleted. Your other documents are in the library.</p>
            <Link to="/library" className="mt-4 inline-block text-signal underline underline-offset-4">
              Open My Library
            </Link>
          </>
        ) : (
          <ErrorNotice error={doc.error} onRetry={() => doc.refetch()} retrying={doc.isFetching} />
        )}
      </div>
    )
  }

  const context: DocumentContext = { doc: doc.data, store }
  return (
    <div className="flex min-h-full flex-col">
      <DocumentHeader context={context} />
      <StatusBanner context={context} />
      <TabContent context={context} />
      <SourceDrawer docId={doc.data.id} pageCount={doc.data.page_count} />
    </div>
  )
}

function DocumentHeader({ context: { doc } }: { context: DocumentContext }) {
  const star = useStarMutation()
  const [params, setParams] = useSearchParams()
  const { pathname } = useLocation()
  const base = `/d/${doc.id}`
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ink">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-4 md:px-6">
        <Link to="/library" className="inline-flex items-center gap-1 text-sm text-text-3 hover:text-text" aria-label="Back to library">
          <ChevronLeft className="size-4" aria-hidden />
          Library
        </Link>
        <div className="order-last flex w-full min-w-0 items-baseline gap-3 sm:order-none sm:w-auto sm:flex-1">
          <h1 className="truncate text-xl font-semibold tracking-[-0.01em]" title={doc.filename}>
            {documentTitle(doc)}
          </h1>
          <span className="shrink-0 font-mono text-xs text-text-3 tabular">
            {doc.status === 'ready' ? `${doc.page_count} pages` : doc.status === 'processing' ? 'Reading…' : 'Unreadable'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={doc.starred}
            icon={<Star className={cn('size-4', doc.starred && 'fill-amber text-amber')} />}
            onClick={() => star.mutate(doc)}
          >
            {doc.starred ? 'Starred' : 'Star'}
          </Button>
          {doc.status === 'ready' && (
            <Button
              size="sm"
              icon={<FileText className="size-4" />}
              onClick={() => {
                const next = new URLSearchParams(params)
                next.set('page', params.get('page') ?? '1')
                setParams(next)
              }}
            >
              Source
            </Button>
          )}
        </div>
      </div>
      <nav aria-label="Study tools" className="mx-auto max-w-[1400px] overflow-x-auto px-2 md:px-4">
        <ul className="flex min-w-max">
          {TABS.map((tab) => {
            const to = tab.to ? `${base}/${tab.to}` : base
            const active = tab.end ? pathname === base || pathname === `${base}/` : pathname.startsWith(to)
            return (
              <li key={tab.label}>
                <NavLink
                  to={to}
                  end={tab.end}
                  aria-current={active ? 'page' : undefined}
                  onMouseEnter={() => prefetchRoute(tab.module)}
                  onFocus={() => prefetchRoute(tab.module)}
                  className={cn(
                    'relative flex h-11 items-center gap-2 px-3 text-base font-medium transition-colors',
                    active ? 'text-text' : 'text-text-3 hover:text-text-2',
                  )}
                >
                  <tab.icon className="size-4" aria-hidden />
                  {tab.label}
                  {active && <m.span layoutId="doc-tab" transition={t.base} className="absolute inset-x-2 bottom-0 h-[2px] bg-signal" />}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
    </header>
  )
}

function StatusBanner({ context: { doc } }: { context: DocumentContext }) {
  const qc = useQueryClient()
  const reprocess = useMutation({
    mutationFn: () => documentsApi.reprocess(doc.id),
    onSuccess: (d) => {
      qc.setQueryData(qk.document(d.id), d)
      void qc.invalidateQueries({ queryKey: qk.documents, exact: true })
    },
  })
  if (doc.status === 'ready') return null
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 md:px-6">
      {doc.status === 'processing' ? (
        <div role="status" className="rounded-md border border-line bg-surface-1 p-4">
          <p className="font-medium">The server is still reading this document.</p>
          <ProgressBar label="Reading pages" className="mt-3" />
        </div>
      ) : (
        <div role="alert" className="flex flex-wrap items-start gap-3 rounded-md border border-incorrect/40 tint-incorrect p-4">
          <AlertTriangle className="mt-0.5 size-4 text-incorrect" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">This PDF couldn’t be read</p>
            <p className="mt-0.5 text-base text-text-2">{doc.error ?? 'No text could be extracted.'}</p>
            {reprocess.error ? <p className="mt-1 text-sm text-incorrect">Retry failed. Try again later.</p> : null}
          </div>
          <Button size="sm" icon={<RotateCcw className="size-3.5" />} busy={reprocess.isPending} onClick={() => reprocess.mutate()}>
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}

/** Tab content crossfades; the outgoing view is frozen (useOutlet) so it never flashes the new route. */
function TabContent({ context }: { context: DocumentContext }) {
  const { pathname } = useLocation()
  const outlet = useOutlet(context)
  const key = pathname.split('/').slice(3, 4).join('/') || 'overview'
  return (
    <div className="relative flex-1">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div key={key} variants={fadeRise} initial="initial" animate="animate" exit="exit" className="w-full">
          <ExitInert>{outlet}</ExitInert>
        </m.div>
      </AnimatePresence>
    </div>
  )
}

function LayoutSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-4 md:px-6" aria-busy="true">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-3 h-7 w-80 max-w-full" />
      <div className="mt-4 flex gap-4">
        {TABS.map((tab) => (
          <Skeleton key={tab.label} className="h-5 w-16" />
        ))}
      </div>
    </div>
  )
}
