import { useEffect, useMemo } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, m } from 'motion/react'
import { ArrowRight, Network } from 'lucide-react'
import { studyApi } from '../../api/endpoints/study'
import { describeError } from '../../api/errors'
import { qk } from '../../api/queryKeys'
import { useActivity, useDocuments, useDueCounts, useKnowledgeGraph } from '../../data/hooks'
import { documentTitle } from '../../data/format'
import { hasFormed, markFormed } from '../../domain/formed'
import { suggestNext } from '../../domain/suggestions'
import type { SceneInput } from '../../domain/types'
import { sceneInputFor } from '../../domain/uploadPipeline'
import { CanvasSlot } from '../../graph/CanvasSlot'
import { defaultViewMode } from '../../graph/capability'
import { GraphToolbar } from '../../graph/GraphToolbar'
import { getGraphStore, useGraph, type GraphStore } from '../../graph/graphStore'
import { prefetchCanvasWhenIdle } from '../../graph/loadCanvas'
import type { KnowledgeGraph } from '../../domain/types'
import { crossfade } from '../../motion/variants'
import { Button } from '../../ui/Button'
import { ErrorNotice, Skeleton } from '../../ui/Feedback'
import { DocumentRow, warmDocument } from '../library/DocumentRow'
import { UploadPanel } from '../upload/UploadPanel'
import { useUpload } from '../upload/uploadStore'
import { EmptyHero } from './EmptyHero'
import { ContinueStudying, DueCards, RecentActivity, SuggestionCard } from './Widgets'

export default function DashboardPage() {
  const docs = useDocuments()
  const activity = useActivity(20)
  const upload = useUpload((s) => s.state)
  const uploadGraph = useUpload((s) => s.graph)
  const store = useMemo(() => getGraphStore('dashboard', defaultViewMode()), [])
  const uploading = upload.phase !== 'idle'

  const all = useMemo(() => docs.data ?? [], [docs.data])
  const ready = useMemo(() => all.filter((d) => d.status === 'ready'), [all])
  const focus = uploading ? undefined : ready[0]
  const focusGraph = useKnowledgeGraph(focus)
  const dueCounts = useDueCounts(ready.slice(0, 6))

  useEffect(() => prefetchCanvasWhenIdle(), [])
  // A finished (or cancelled) upload is done with once the user leaves; failures stay for a retry.
  useEffect(
    () => () => {
      const { state, reset } = useUpload.getState()
      if (state.phase === 'ready' || state.phase === 'cancelled') reset()
    },
    [],
  )
  useEffect(() => {
    performance.mark('sp:shell-interactive')
  }, [])

  // The first time a document's graph is shown it forms; afterwards it appears finished.
  const formedAlready = focus ? hasFormed(focus.id) : true
  const input = useMemo<SceneInput>(() => {
    if (uploading) return sceneInputFor(upload, uploadGraph)
    if (focus && focusGraph.graph) return { kind: 'graph', graph: focusGraph.graph, animate: !formedAlready }
    // Still loading the map: show nothing rather than a page fan that is about to be replaced.
    if (focus && focusGraph.isPending) return { kind: 'empty' }
    if (focus) return { kind: 'pages', pageCount: focus.page_count, working: false }
    return { kind: 'empty' }
  }, [uploading, upload, uploadGraph, focus, focusGraph.graph, focusGraph.isPending, formedAlready])
  useEffect(() => {
    if (input.kind === 'graph' && input.animate) markFormed(input.graph.documentId)
  }, [input])

  if (docs.isPending) return <DashboardSkeleton />
  if (docs.isError) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-6">
        <ErrorNotice error={docs.error} onRetry={() => docs.refetch()} retrying={docs.isFetching} />
      </div>
    )
  }

  const suggestion = suggestNext(all, dueCounts, activity.data ?? [])
  const latest = activity.data?.find((a) => a.type !== 'document_uploaded') ?? activity.data?.[0]
  const latestDoc = latest ? all.find((d) => d.id === latest.document_id) : undefined
  const starred = all.filter((d) => d.starred)
  const empty = all.length === 0 && !uploading

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      {empty ? (
        <EmptyHero />
      ) : (
        <div className="grid overflow-hidden rounded-md border border-line bg-surface-1 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col">
            <CanvasHeader
              focusTitle={uploading ? (upload.document ? documentTitle(upload.document) : null) : focus ? documentTitle(focus) : null}
              focusId={uploading ? upload.document?.id : focus?.id}
              uploading={uploading && upload.phase !== 'ready'}
              graph={input.kind === 'graph' ? input.graph : null}
              store={store}
            />
            <div className="relative">
              <CanvasSlot
                input={input}
                store={store}
                description={
                  input.kind === 'graph'
                    ? `Concept map of ${documentTitle(focus ?? { filename: upload.fileName ?? '' })}: ${input.graph.concepts.length} concepts. Open the document for the full list.`
                    : 'Document processing view.'
                }
                className="h-[52vh] min-h-[320px] lg:h-[min(64vh,660px)]"
              />
              {!uploading && focus && !focusGraph.graph && !focusGraph.isPending && (
                <BuildMapOverlay docId={focus.id} pageCount={focus.page_count} error={focusGraph.error} />
              )}
              {input.kind === 'graph' && focus && <SelectedConceptCard graph={input.graph} store={store} docId={focus.id} />}
            </div>
          </div>
          <aside className="border-t border-line lg:border-t-0 lg:border-l" aria-label={uploading ? 'Upload progress' : 'Study overview'}>
            <AnimatePresence mode="wait" initial={false}>
              {uploading ? (
                <m.div key="upload" variants={crossfade} initial="initial" animate="animate" exit="exit">
                  <UploadPanel />
                </m.div>
              ) : (
                <m.div key="widgets" variants={crossfade} initial="initial" animate="animate" exit="exit">
                  <SuggestionCard suggestion={suggestion} />
                  <ContinueStudying item={latest} doc={latestDoc} />
                  <DueCards counts={dueCounts} />
                  <RecentActivity items={activity.data ?? []} loading={activity.isPending} />
                </m.div>
              )}
            </AnimatePresence>
          </aside>
        </div>
      )}

      {all.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          <section aria-labelledby="recent-docs" className="rounded-md border border-line bg-surface-1">
            <div className="flex items-center justify-between px-4 pt-4">
              <h2 id="recent-docs" className="eyebrow">Recent documents</h2>
              <Link to="/library" className="text-sm text-text-2 hover:text-signal">
                My Library
              </Link>
            </div>
            <ul className="px-3 pb-1">
              {all.slice(0, 5).map((d) => (
                <DocumentRow key={d.id} doc={d} />
              ))}
            </ul>
          </section>
          <section aria-labelledby="starred-docs" className="rounded-md border border-line bg-surface-1">
            <div className="flex items-center justify-between px-4 pt-4">
              <h2 id="starred-docs" className="eyebrow">Starred</h2>
              {starred.length > 0 && (
                <Link to="/library?filter=starred" className="text-sm text-text-2 hover:text-signal">
                  All starred
                </Link>
              )}
            </div>
            {starred.length === 0 ? (
              <p className="px-4 pt-2 pb-4 text-base text-text-2">Star the documents you’re revising now to keep them here.</p>
            ) : (
              <ul className="px-3 pb-1">
                {starred.slice(0, 5).map((d) => (
                  <DocumentRow key={d.id} doc={d} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function CanvasHeader({
  focusTitle,
  focusId,
  uploading,
  graph,
  store,
}: {
  focusTitle: string | null
  focusId?: string
  uploading: boolean
  graph: KnowledgeGraph | null
  store: GraphStore
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <p className="eyebrow">{uploading ? 'New document' : 'Knowledge map'}</p>
        {focusTitle && focusId && !uploading ? (
          <Link to={`/d/${focusId}`} onMouseEnter={warmDocument} className="group inline-flex max-w-full items-center gap-1.5">
            <h1 className="truncate text-lg font-semibold text-text group-hover:text-signal">{focusTitle}</h1>
            <ArrowRight className="size-4 shrink-0 text-text-3 group-hover:text-signal" aria-hidden />
          </Link>
        ) : (
          <h1 className="text-lg font-semibold text-text">{uploading ? 'Building your concept map' : 'Your documents'}</h1>
        )}
      </div>
      <GraphToolbar graph={graph} store={store} className="ml-auto min-w-0 flex-1 justify-end" />
    </div>
  )
}

function BuildMapOverlay({ docId, pageCount, error }: { docId: string; pageCount: number; error: unknown }) {
  const qc = useQueryClient()
  const build = useMutation({
    mutationFn: () => studyApi.generateConcepts(docId),
    onSuccess: (map) => qc.setQueryData(qk.concepts(docId), map),
  })
  return (
    <div className="absolute inset-x-4 bottom-4 flex flex-col items-start gap-3 rounded-md border border-line-strong bg-surface-1 p-4 md:right-auto md:max-w-sm">
      <div className="flex items-center gap-2">
        <Network className="size-4 text-signal" aria-hidden />
        <p className="font-semibold">No concept map yet</p>
      </div>
      <p className="text-base text-text-2">Map the key concepts across all {pageCount} pages and how they connect.</p>
      {(build.error || error) ? <p className="text-sm text-incorrect">{describeError(build.error ?? error)}</p> : null}
      <Button variant="primary" busy={build.isPending} onClick={() => build.mutate()}>
        {build.isPending ? 'Building concept map…' : 'Build concept map'}
      </Button>
    </div>
  )
}

/** Compact context for a concept picked on the dashboard; full detail lives in the document. */
function SelectedConceptCard({ graph, store, docId }: { graph: KnowledgeGraph; store: GraphStore; docId: string }) {
  const selectedId = useGraph(store, (s) => s.selectedId)
  const concept = graph.concepts.find((c) => c.id === selectedId)
  return (
    <AnimatePresence>
      {concept && (
        <m.div
          key={concept.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          className="absolute inset-x-4 bottom-4 rounded-md border border-line-strong bg-surface-1 p-4 md:right-auto md:w-[360px]"
        >
          <p className="font-semibold text-text">{concept.title}</p>
          {concept.explanation && <p className="mt-1 line-clamp-3 font-serif text-base text-text-2">{concept.explanation}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {concept.pages.slice(0, 3).map((p) => (
              <PageRefLink key={p} docId={docId} page={p} />
            ))}
            <Link
              to={`/d/${docId}?concept=${concept.id}`}
              onMouseEnter={warmDocument}
              className="ml-auto inline-flex h-8 items-center gap-1.5 text-sm font-medium text-signal"
            >
              Explore in document <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}

/** On the dashboard there is no source drawer, so page refs link into the document. */
function PageRefLink({ docId, page }: { docId: string; page: number }) {
  return (
    <Link
      to={`/d/${docId}?page=${page}`}
      className="inline-flex h-6 items-center rounded-sm border border-line-strong px-1.5 font-mono text-xs text-text-2 hover:border-signal hover:text-signal"
    >
      p.&nbsp;{page}
    </Link>
  )
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6 md:px-6 md:py-8" aria-busy="true">
      <div className="grid overflow-hidden rounded-md border border-line bg-surface-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-[52vh] min-h-[320px] lg:h-[min(64vh,660px)]" />
        <div className="flex flex-col gap-3 border-l border-line p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    </div>
  )
}

