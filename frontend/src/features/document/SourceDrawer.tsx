import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { documentsApi } from '../../api/endpoints/documents'
import { qk } from '../../api/queryKeys'
import { Drawer } from '../../ui/Drawer'
import { ErrorNotice, Skeleton } from '../../ui/Feedback'
import { IconButton } from '../../ui/Button'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { reflow, splitOnSnippet } from './sourceText'

const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

/**
 * Source pages for citations, driven by `?page=N` (and `?q=` for the cited snippet) so any screen can
 * open it with a link and the back button closes it. "Text" is the server's extracted text with the
 * citation highlighted; "Original" uses the browser's own PDF viewer (no pdf.js download).
 */
export function SourceDrawer({ docId, pageCount }: { docId: string; pageCount: number }) {
  const [params, setParams] = useSearchParams()
  const raw = Number(params.get('page'))
  const open = Number.isInteger(raw) && raw >= 1
  const page = Math.min(Math.max(1, raw || 1), Math.max(1, pageCount))
  const snippet = params.get('q')
  const [view, setView] = useState<'text' | 'original'>('text')

  const setPage = (n: number) => {
    const next = new URLSearchParams(params)
    next.set('page', String(n))
    next.delete('q')
    setParams(next, { replace: true })
  }
  const close = () => {
    const next = new URLSearchParams(params)
    next.delete('page')
    next.delete('q')
    setParams(next)
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      title={
        <span className="flex items-baseline gap-2">
          Source <span className="font-mono text-sm font-normal text-text-3 tabular">p. {page} of {pageCount}</span>
        </span>
      }
      actions={
        <div className="flex items-center gap-1">
          <IconButton size="sm" label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton size="sm" label="Next page" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
      }
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <SegmentedControl
          label="Source view"
          value={view}
          onChange={setView}
          options={[
            { value: 'text', label: 'Text' },
            { value: 'original', label: 'Original PDF' },
          ]}
        />
        <a
          href={documentsApi.fileUrl(docId, page)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-text-2 hover:text-signal"
        >
          Open PDF <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
      {view === 'text' ? (
        <PageText docId={docId} page={page} snippet={snippet} />
      ) : isIOS ? (
        <p className="p-4 text-base text-text-2">
          This browser can’t show PDFs inline. Use “Open PDF” above to view page {page}.
        </p>
      ) : (
        <iframe
          key={page}
          title={`Original PDF, page ${page}`}
          src={documentsApi.fileUrl(docId, page)}
          className="h-[calc(100%-49px)] min-h-[60vh] w-full border-0 bg-surface-2"
        />
      )}
    </Drawer>
  )
}

function PageText({ docId, page, snippet }: { docId: string; page: number; snippet: string | null }) {
  const q = useQuery({
    queryKey: qk.page(docId, page),
    queryFn: ({ signal }) => documentsApi.page(docId, page, signal),
    staleTime: Infinity,
  })
  const parts = useMemo(() => splitOnSnippet(reflow(q.data?.text ?? ''), snippet), [q.data?.text, snippet])

  if (q.isPending) {
    return (
      <div className="flex flex-col gap-2 p-5" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className={i % 4 === 3 ? 'h-4 w-2/3' : 'h-4 w-full'} />
        ))}
      </div>
    )
  }
  if (q.isError) return <ErrorNotice className="m-4" error={q.error} onRetry={() => q.refetch()} />
  if (!q.data.text.trim()) {
    return <p className="p-5 text-base text-text-2">This page has no extractable text (it may be blank or an image).</p>
  }
  return (
    <div className="reading px-5 py-5 text-[1.0625rem] whitespace-pre-wrap">
      {parts.map((part, i) =>
        part.hit ? (
          <mark key={i} ref={(el) => el?.scrollIntoView({ block: 'center' })} className="rounded-[2px] bg-amber/25 px-0.5 text-text">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </div>
  )
}
