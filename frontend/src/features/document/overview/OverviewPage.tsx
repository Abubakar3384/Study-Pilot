import { useEffect, useMemo } from 'react'
import { offerQuiz, useAiJob, type Job } from '../../../data/generation'
import { BusyNote } from '../../../app/GenerationIndicator'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BookOpenText, Layers, ListChecks, MessageSquareText, Network, Compass } from 'lucide-react'
import { studyApi } from '../../../api/endpoints/study'
import { describeError } from '../../../api/errors'
import { qk } from '../../../api/queryKeys'
import { prefetchRoute, type RouteModuleName } from '../../../app/routes'
import { useActivity, useDueCounts, useKnowledgeGraph, useSummary } from '../../../data/hooks'
import { hasFormed, markFormed } from '../../../domain/formed'
import { suggestNext } from '../../../domain/suggestions'
import type { Concept, SceneInput } from '../../../domain/types'
import { KnowledgeView } from '../../../graph/KnowledgeView'
import { prefetchCanvasWhenIdle } from '../../../graph/loadCanvas'
import { useConceptParam } from '../../../graph/useConceptParam'
import { Button } from '../../../ui/Button'
import { ErrorNotice, ProgressBar, Skeleton } from '../../../ui/Feedback'
import { PageRef } from '../../../ui/PageRef'
import { useDocumentContext } from '../context'
import '@fontsource-variable/source-serif-4/opsz.css'

export default function OverviewPage() {
  const { doc, store } = useDocumentContext()
  const ready = doc.status === 'ready'
  const map = useKnowledgeGraph(doc)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()

  useEffect(() => prefetchCanvasWhenIdle(), [])
  useEffect(() => {
    performance.mark('sp:shell-interactive')
  }, [])

  const knownIds = useMemo(() => (map.graph ? new Set(map.graph.concepts.map((c) => c.id)) : null), [map.graph])
  useConceptParam(store, knownIds)

  const build = useAiJob(doc.id, 'concepts', {
    run: () => studyApi.generateConcepts(doc.id),
    onSuccess: (m) => qc.setQueryData(qk.concepts(doc.id), m),
  })
  const quiz = useAiJob(doc.id, 'quiz', {
    run: (c: Concept) => studyApi.generateQuiz(doc.id, 5, c.pages),
    onSuccess: (q, _c, { stillHere }) => {
      void qc.invalidateQueries({ queryKey: qk.quizzes(doc.id) })
      offerQuiz(doc.id, q.id, stillHere)
    },
  })

  const formed = hasFormed(doc.id)
  const input = useMemo<SceneInput>(() => {
    if (map.graph) return { kind: 'graph', graph: map.graph, animate: !formed }
    if (map.isPending) return { kind: 'empty' }
    return { kind: 'pages', pageCount: Math.max(1, doc.page_count), working: build.isPending, failed: !!build.error }
  }, [map.graph, map.isPending, formed, doc.page_count, build.isPending, build.error])
  useEffect(() => {
    if (input.kind === 'graph' && input.animate) markFormed(doc.id)
  }, [input, doc.id])

  const openPage = (page: number) => navigate({ search: new URLSearchParams({ ...Object.fromEntries(params), page: String(page) }).toString() })

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6 md:px-6">
      {ready && (
        <KnowledgeView
          input={input}
          store={store}
          onPageClick={openPage}
          actions={{
            onOpenNotes: (c) => navigate(`/d/${doc.id}/notes?near=${c.pages[0]}`),
            onQuiz: (c) => quiz.mutate(c),
            quizBusy: quiz.isPending,
            quizBlocked: !!quiz.blockedBy,
          }}
          aside={
            <BuildMap
              loading={map.isPending}
              pending={build.isPending}
              blockedBy={build.blockedBy}
              error={build.error ?? map.error}
              pageCount={doc.page_count}
              onBuild={() => build.mutate()}
            />
          }
        />
      )}
      {quiz.error ? <ErrorNotice error={quiz.error} onRetry={() => quiz.reset()} /> : null}

      {ready && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <SummarySection docId={doc.id} />
          <div className="flex flex-col gap-6">
            <NextStep />
            <StudyTools docId={doc.id} />
          </div>
        </div>
      )}
    </div>
  )
}

function BuildMap({
  loading,
  pending,
  blockedBy,
  error,
  pageCount,
  onBuild,
}: {
  loading: boolean
  pending: boolean
  blockedBy?: Job
  error: unknown
  pageCount: number
  onBuild: () => void
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
      </div>
    )
  }
  return (
    <div className="flex flex-col items-start gap-3 p-4">
      <Network className="size-5 text-signal" aria-hidden />
      <h2 className="text-md font-semibold">{pending ? 'Building concept map…' : 'No concept map yet'}</h2>
      <p className="text-base text-text-2">
        {pending
          ? 'Finding the key concepts across the pages and how they connect. This can take a few minutes with a local model.'
          : `Map the key concepts in these ${pageCount} pages, where each appears, and how they connect.`}
      </p>
      {pending ? (
        <ProgressBar label="Building concept map" className="mt-1" />
      ) : (
        <>
          <Button variant="primary" disabled={!!blockedBy} onClick={onBuild}>
            Build concept map
          </Button>
          <BusyNote job={blockedBy} />
        </>
      )}
      {error && !pending ? <ErrorNotice error={error} onRetry={onBuild} className="w-full" /> : null}
    </div>
  )
}

function SummarySection({ docId }: { docId: string }) {
  const summary = useSummary(docId)
  const qc = useQueryClient()
  const generate = useAiJob(docId, 'summary', {
    run: () => studyApi.generateSummary(docId),
    onSuccess: (s) => qc.setQueryData(qk.summary(docId), s),
  })

  return (
    <section aria-labelledby="summary-title" className="card p-5 md:p-6">
      <h2 id="summary-title" className="eyebrow">
        Summary
      </h2>
      {summary.isPending ? (
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : summary.isError ? (
        <ErrorNotice className="mt-4" error={summary.error} onRetry={() => summary.refetch()} />
      ) : summary.data ? (
        <>
          <p className="reading mt-3">{summary.data.overview}</p>
          <h3 className="eyebrow mt-6 mb-2">Key points</h3>
          <ol className="flex flex-col divide-y divide-line">
            {summary.data.key_points.map((kp, i) => (
              <li key={i} className="flex items-start gap-3 py-2.5">
                <span className="mt-0.5 w-5 shrink-0 font-mono text-xs text-text-3 tabular">{String(i + 1).padStart(2, '0')}</span>
                <p className="flex-1 font-serif text-md leading-relaxed text-text">{kp.text}</p>
                <PageRef page={kp.page_number} snippet={kp.text} />
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className="mt-3 flex flex-col items-start gap-3">
          <p className="text-base text-text-2">No summary yet. It gives you an overview and the key points, each linked to its page.</p>
          <Button variant="primary" busy={generate.isPending} disabled={!!generate.blockedBy} onClick={() => generate.mutate()}>
            {generate.isPending ? 'Writing summary…' : 'Generate summary'}
          </Button>
          {generate.isPending && <ProgressBar label="Writing summary" />}
          <BusyNote job={generate.blockedBy} />
          {generate.error ? <ErrorNotice error={generate.error} onRetry={() => generate.mutate()} className="w-full" /> : null}
        </div>
      )}
      {generate.error && summary.data ? <p className="mt-2 text-sm text-incorrect">{describeError(generate.error)}</p> : null}
    </section>
  )
}

const TOOLS: Array<{ to: string; label: string; body: string; icon: typeof BookOpenText; module: RouteModuleName }> = [
  { to: 'notes', label: 'Notes', body: 'Structured notes you can edit, each section linked to its page.', icon: BookOpenText, module: 'notes' },
  { to: 'quiz', label: 'Quiz', body: 'One question at a time, with explanations from the source.', icon: ListChecks, module: 'quizHome' },
  { to: 'cards', label: 'Flashcards', body: 'Spaced repetition that schedules what to review next.', icon: Layers, module: 'cards' },
  { to: 'ask', label: 'Ask', body: 'Questions answered only from this document, with citations.', icon: MessageSquareText, module: 'ask' },
]

function StudyTools({ docId }: { docId: string }) {
  return (
    <section aria-labelledby="tools-title" className="card">
      <h2 id="tools-title" className="eyebrow px-4 pt-4">
        Study with this document
      </h2>
      <ul className="p-2">
        {TOOLS.map((tool) => (
          <li key={tool.to}>
            <Link
              to={`/d/${docId}/${tool.to}`}
              onMouseEnter={() => prefetchRoute(tool.module)}
              onFocus={() => prefetchRoute(tool.module)}
              className="group flex items-start gap-3 rounded-sm px-2 py-2.5 transition-colors hover:bg-surface-2"
            >
              <tool.icon className="mt-0.5 size-4 shrink-0 text-text-3 group-hover:text-signal" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium text-text">{tool.label}</span>
                <span className="block text-sm text-text-2">{tool.body}</span>
              </span>
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-text-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function NextStep() {
  const { doc } = useDocumentContext()
  const due = useDueCounts([doc])
  const activity = useActivity(50)
  if (activity.isPending) return null
  const s = suggestNext([doc], due, (activity.data ?? []).filter((a) => a.document_id === doc.id))
  if (s.kind === 'upload') return null
  const href = s.kind === 'due-cards' ? `/d/${doc.id}/cards?due=1` : s.kind === 'review-quiz' ? `/d/${doc.id}/review` : `/d/${doc.id}/quiz`
  return (
    <section aria-labelledby="next-title" className="rounded-md border border-signal/40 bg-surface-1 p-4">
      <h2 id="next-title" className="eyebrow flex items-center gap-1.5 text-signal">
        <Compass className="size-3.5" aria-hidden /> Next step
      </h2>
      <p className="mt-2 text-md font-semibold">{s.title}</p>
      <p className="mt-1 text-base text-text-2">{s.reason}</p>
      <Link to={href} className="mt-3 inline-flex h-9 items-center gap-2 rounded-sm bg-signal px-3.5 text-base font-medium text-ink hover:bg-signal/85">
        Start <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  )
}
