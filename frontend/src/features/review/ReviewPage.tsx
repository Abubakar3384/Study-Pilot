import { useMemo } from 'react'
import { offerQuiz, useAiJob } from '../../data/generation'
import { BusyNote } from '../../app/GenerationIndicator'
import { Link } from 'react-router'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Target } from 'lucide-react'
import { studyApi } from '../../api/endpoints/study'
import { qk } from '../../api/queryKeys'
import type { AttemptDto, QuizDto } from '../../api/types'
import { useDueCounts, useKnowledgeGraph } from '../../data/hooks'
import { computeTopicPerformance } from '../../domain/performance'
import { Button } from '../../ui/Button'
import { EmptyState, ErrorNotice, Skeleton } from '../../ui/Feedback'
import { PageRef } from '../../ui/PageRef'
import { useDocumentContext } from '../document/context'
import { TopicPerformanceList } from './TopicPerformanceList'
import '@fontsource-variable/source-serif-4/opsz.css'

/** Strengths, weaknesses and mistakes across this document's quizzes (latest attempt of each). */
export default function ReviewPage() {
  const { doc } = useDocumentContext()
  const qc = useQueryClient()
  const quizzes = useQuery({ queryKey: qk.quizzes(doc.id), queryFn: ({ signal }) => studyApi.quizzes(doc.id, signal) })
  const attempts = useQueries({
    queries: (quizzes.data ?? []).map((q) => ({
      queryKey: qk.attempts(q.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => studyApi.attempts(q.id, signal),
    })),
  })
  const { graph, isPending: graphPending } = useKnowledgeGraph(doc)
  const [due] = useDueCounts([doc])

  const latest = useMemo(() => {
    const out: Array<{ quiz: QuizDto; attempt: AttemptDto }> = []
    quizzes.data?.forEach((quiz, i) => {
      const a = attempts[i]?.data?.at(-1)
      if (a) out.push({ quiz, attempt: a })
    })
    return out
  }, [quizzes.data, attempts])

  const results = latest.flatMap((l) => l.attempt.results)
  const perf = useMemo(() => (graph ? computeTopicPerformance(graph, results) : null), [graph, results])
  const weak = perf?.topics.filter((t) => t.status === 'weak') ?? []
  const strong = perf?.topics.filter((t) => t.status === 'strong') ?? []
  const other = perf?.topics.filter((t) => t.status === 'mixed' || t.status === 'few') ?? []

  const focused = useAiJob(doc.id, 'quiz', {
    run: () => studyApi.generateQuiz(doc.id, 5, [...new Set(weak.flatMap((t) => t.concept.pages))]),
    onSuccess: (q, _arg, { stillHere }) => {
      void qc.invalidateQueries({ queryKey: qk.quizzes(doc.id) })
      offerQuiz(doc.id, q.id, stillHere)
    },
  })

  const loading = quizzes.isPending || attempts.some((a) => a.isPending) || graphPending
  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
    )
  }
  if (quizzes.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <ErrorNotice error={quizzes.error} onRetry={() => quizzes.refetch()} />
      </div>
    )
  }
  if (latest.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState
          icon={<Target className="size-5" />}
          title="Nothing to review yet"
          body="Take a quiz on this document. Your strengths and weaknesses will be listed here by concept, with the pages to revisit."
          action={
            <Link to={`/d/${doc.id}/quiz`} className="inline-flex h-9 items-center gap-2 rounded-sm bg-signal px-3.5 font-medium text-ink">
              Take a quiz <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        />
      </div>
    )
  }

  const byQuestion = new Map(latest.flatMap(({ quiz }) => quiz.questions.map((q) => [q.id, q] as const)))
  const mistakes = latest.flatMap(({ attempt }) => attempt.results.filter((r) => !r.is_correct))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6 md:px-6">
      <header>
        <p className="eyebrow">Targeted revision</p>
        <h2 className="mt-1 text-2xl font-semibold">What to revise next</h2>
        <p className="mt-1 text-base text-text-2">
          Based on {results.length} question{results.length === 1 ? '' : 's'} from your latest attempt at {latest.length} quiz
          {latest.length === 1 ? '' : 'zes'}.
        </p>
      </header>

      <section className="rounded-md border border-signal/40 bg-surface-1 p-4">
        <p className="eyebrow text-signal">Next action</p>
        {weak.length > 0 ? (
          <>
            <p className="mt-2 font-semibold">Practise {weak.length === 1 ? weak[0]!.concept.title : `${weak.length} weak concepts`}</p>
            <p className="mt-1 text-base text-text-2">A short quiz drawn only from the pages behind these concepts.</p>
            <Button className="mt-3" variant="primary" busy={focused.isPending} disabled={!!focused.blockedBy} onClick={() => focused.mutate()}>
              Quiz me on weak concepts
            </Button>
            <BusyNote job={focused.blockedBy} className="mt-2 text-sm text-text-3" />
            {focused.error ? <ErrorNotice className="mt-3" error={focused.error} onRetry={() => focused.mutate()} /> : null}
          </>
        ) : due && due.due > 0 ? (
          <>
            <p className="mt-2 font-semibold">Review {due.due} due flashcards</p>
            <Link to={`/d/${doc.id}/cards?due=1`} className="mt-3 inline-flex h-9 items-center gap-2 rounded-sm bg-signal px-3.5 font-medium text-ink">
              Start review <ArrowRight className="size-4" aria-hidden />
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 font-semibold">No weak spots in your latest attempts</p>
            <Link to={`/d/${doc.id}/quiz`} className="mt-3 inline-flex h-9 items-center gap-2 rounded-sm border border-line-strong px-3.5 font-medium hover:border-signal">
              Take a new quiz <ArrowRight className="size-4" aria-hidden />
            </Link>
          </>
        )}
      </section>

      {perf ? (
        <>
          <section aria-labelledby="weak">
            <h3 id="weak" className="eyebrow mb-3">
              Needs work
            </h3>
            <TopicPerformanceList topics={weak} emptyText="No concept is below 60% with at least two questions." />
          </section>
          <section aria-labelledby="strong">
            <h3 id="strong" className="eyebrow mb-3">
              Strong
            </h3>
            <TopicPerformanceList topics={strong} emptyText="No concept is at 80% or more with at least two questions yet." />
          </section>
          {other.length > 0 && (
            <section aria-labelledby="other">
              <h3 id="other" className="eyebrow mb-3">
                Mixed or not enough questions
              </h3>
              <TopicPerformanceList topics={other} emptyText="" />
            </section>
          )}
        </>
      ) : (
        <p className="text-base text-text-2">
          Build the concept map on the Overview to group results by concept.{' '}
          <Link to={`/d/${doc.id}`} className="text-signal underline underline-offset-4">
            Go to Overview
          </Link>
        </p>
      )}

      {mistakes.length > 0 && (
        <section aria-labelledby="mistakes">
          <h3 id="mistakes" className="eyebrow mb-3">
            Recent mistakes ({mistakes.length})
          </h3>
          <ol className="flex flex-col divide-y divide-line card">
            {mistakes.map((r) => {
              const q = byQuestion.get(r.question_id)
              if (!q) return null
              return (
                <li key={r.question_id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-md font-semibold">{q.question}</p>
                    <p className="mt-1 text-base text-text-2">
                      Correct: <span className="text-text">{q.options[r.correct_index]}</span>
                    </p>
                  </div>
                  <PageRef page={r.page_number} />
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </div>
  )
}
