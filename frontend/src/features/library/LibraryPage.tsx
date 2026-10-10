import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Search, Upload } from 'lucide-react'
import { useDocuments } from '../../data/hooks'
import { documentTitle } from '../../data/format'
import { Button } from '../../ui/Button'
import { EmptyState, ErrorNotice, Skeleton } from '../../ui/Feedback'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { useUpload } from '../upload/uploadStore'
import { DocumentRow } from './DocumentRow'

type Filter = 'all' | 'starred'

export default function LibraryPage() {
  const docs = useDocuments()
  const [params, setParams] = useSearchParams()
  const filter: Filter = params.get('filter') === 'starred' ? 'starred' : 'all'
  const [query, setQuery] = useState('')
  const pickFile = useUpload((s) => s.pickFile)

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (docs.data ?? [])
      .filter((d) => filter === 'all' || d.starred)
      .filter((d) => !q || documentTitle(d).toLowerCase().includes(q) || d.filename.toLowerCase().includes(q))
  }, [docs.data, filter, query])

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">My Library</p>
          <h1 className="mt-1 text-2xl font-semibold">{filter === 'starred' ? 'Starred documents' : 'All documents'}</h1>
        </div>
        <Button variant="primary" icon={<Upload className="size-4" />} onClick={pickFile}>
          Upload PDF
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<Filter>
          label="Filter documents"
          value={filter}
          onChange={(v) => setParams(v === 'starred' ? { filter: 'starred' } : {}, { replace: true })}
          options={[
            { value: 'all', label: 'All' },
            { value: 'starred', label: 'Starred' },
          ]}
        />
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search documents</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title"
            className="h-8 w-full rounded-sm border border-line-strong bg-surface-1 pl-8 text-base placeholder:text-text-3 focus:border-signal focus:outline-none"
          />
        </label>
      </div>

      {docs.isPending ? (
        <div className="flex flex-col gap-3 card p-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : docs.isError ? (
        <ErrorNotice error={docs.error} onRetry={() => docs.refetch()} retrying={docs.isFetching} />
      ) : items.length === 0 ? (
        <EmptyState
          title={query ? 'No matching documents' : filter === 'starred' ? 'Nothing starred yet' : 'No documents yet'}
          body={
            query
              ? `Nothing in your library matches “${query}”.`
              : filter === 'starred'
                ? 'Star a document from its page or the list to keep it here while you revise.'
                : 'Upload a lecture PDF or textbook chapter to start.'
          }
          action={
            !query && filter === 'all' ? (
              <Button variant="primary" icon={<Upload className="size-4" />} onClick={pickFile}>
                Upload PDF
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="card px-3">
          {items.map((d) => (
            <DocumentRow key={d.id} doc={d} />
          ))}
        </ul>
      )}
    </div>
  )
}
