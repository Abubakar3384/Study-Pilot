import { useMemo } from 'react'
import { offerQuiz, useAiJob } from '../../data/generation'
import { BusyNote } from '../../app/GenerationIndicator'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, RotateCcw, Target, X } from 'lucide-react'
import { studyApi } from '../../api/endpoints/study'
import { qk } from '../../api/queryKeys'
import { useKnowledgeGraph } from '../../data/hooks'
import { computeTopicPerformance } from '../../domain/performance'
import { Button } from '../../ui/Button'
import { ErrorNotice, Skeleton } from '../../ui/Feedback'
import { PageRef } from '../../ui/PageRef'
import { useDocumentContext } from '../document/context'
import { TopicPerformanceList } from '../review/TopicPerformanceList'
import '@fontsource-variable/source-serif-4/opsz.css'

export default function QuizResultsPage() {
  const { doc } = useDocumentContext()
  const { quizId = '', attemptId = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const quiz = useQuery({ queryKey: qk.quiz(quizId), queryFn: ({ signal }) => studyApi.quiz(quizId, signal) })
  const attempts = useQuery({ queryKey: qk.attempts(quizId), queryFn: ({ signal }) => studyApi.attempts(quizId, signal) })
  const { graph } = useKnowledgeGraph(doc)
  const attempt = attempts.data?.find((a) => a.id === attemptId)

  const perf = useMemo(() => (graph && attempt ? computeTopicPerformance(graph, attempt.results) : null), [graph, attempt])
  const weak = perf?.topics.filter((t) => t.status === 'weak') ?? []

  const focused = useAiJob(doc.id, 'quiz', {
    run: () => studyApi.generateQuiz(doc.id, 5, [...new Set(weak.flatMap((t) => t.concept.pages))]),
    onSuccess: (q, _arg, { stillHere }) => {
      void qc.invalidateQueries({ queryKey: qk.quizzes(doc.id) })
      offerQuiz(doc.id, q.id, stillHere)
    },
  })

  if (quiz.isPending || attempts.isPending) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="mt-6 h-32 w-full" />
      </div>
    )
  }
  if (quiz.isError || attempts.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <ErrorNotice error={quiz.error ?? attempts.error} onRetry={() => (quiz.refetch(), attempts.refetch())} />
      </div>
    )
  }
  if (!attempt) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-text-2">That attempt wasn’t found.</p>
        <Link to={`/d/${doc.id}/quiz`} className="text-signal">
          Back to quizzes
        </Link>
      </div>
    )
  }

  const byId = new Map(quiz.data.questions.map((q) => [q.id, q]))
  const wrong = attempt.results.filter((r) => !r.is_correct)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="eyebrow">{quiz.data.title}</p>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="font-mono text-3xl font-medium tabular">
              {attempt.score}/{attempt.total}
            </span>
            <span className="text-md text-text-2">{Math.round(attempt.percentage)}% correct</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<RotateCcw className="size-4" />} onClick={() => navigate(`/d/${doc.id}/quiz/${quizId}`)}>
            Retake
          </Button>
          {weak.length > 0 && (
            <Button variant="primary" icon={<Target className="size-4" />} busy={focused.isPending} disabled={!!focused.blockedBy} onClick={() => focused.mutate()}>
              New quiz on weak topics
            </Button>
          )}
        </div>
      </header>
      <BusyNote job={focused.blockedBy} />
      {focused.error ? <ErrorNotice error={focused.error} onRetry={() => focused.mutate()} /> : null}

      <section aria-labelledby="topics">
        <h2 id="topics" className="eyebrow mb-3">
          By concept
        </h2>
        {perf ? (
          <>
            <TopicPerformanceList topics={perf.topics} emptyText="These questions couldn’t be matched to concepts on the map." />
            {perf.unattributed > 0 && (
              <p className="mt-2 text-sm text-text-3">
                {perf.unattributed} question{perf.unattributed === 1 ? '' : 's'} didn’t match a concept’s pages and {perf.unattributed === 1 ? 'is' : 'are'} not counted here.
              </p>
            )}
          </>
        ) : (
          <p className="text-base text-text-2">
            Build the concept map on the Overview to see results by concept.{' '}
            <Link to={`/d/${doc.id}`} className="text-signal underline underline-offset-4">
              Go to Overview
            </Link>
          </p>
        )}
      </section>

      <section aria-labelledby="mistakes">
        <h2 id="mistakes" className="eyebrow mb-3">
          {wrong.length ? `Review mistakes (${wrong.length})` : 'No mistakes'}
        </h2>
        {wrong.length === 0 ? (
          <p className="flex items-center gap-2 text-base text-correct">
            <Check className="size-4" aria-hidden /> Every answer was correct.
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            {wrong.map((r) => {
              const q = byId.get(r.question_id)
              if (!q) return null
              return (
                <li key={r.question_id} className="card p-4">
                  <p className="font-serif text-lg leading-snug font-semibold">{q.question}</p>
                  <dl className="mt-3 grid gap-2 text-base">
                    <div className="flex items-start gap-2">
                      <dt className="flex w-28 shrink-0 items-center gap-1.5 text-incorrect">
                        <X className="size-4" aria-hidden /> You chose
                      </dt>
                      <dd className="text-text-2">{r.selected_index === null ? 'No answer' : q.options[r.selected_index]}</dd>
                    </div>
                    <div className="flex items-start gap-2">
                      <dt className="flex w-28 shrink-0 items-center gap-1.5 text-correct">
                        <Check className="size-4" aria-hidden /> Correct
                      </dt>
                      <dd>{q.options[r.correct_index]}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 font-serif text-md leading-relaxed text-text-2">{r.explanation}</p>
                  <div className="mt-2 flex items-center gap-2 text-sm text-text-3">
                    Source <PageRef page={r.page_number} />
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
