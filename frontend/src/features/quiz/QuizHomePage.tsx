import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ListChecks } from 'lucide-react'
import { studyApi } from '../../api/endpoints/study'
import { qk } from '../../api/queryKeys'
import { formatDate } from '../../data/format'
import { Button } from '../../ui/Button'
import { EmptyState, ErrorNotice, ProgressBar, Skeleton } from '../../ui/Feedback'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { useDocumentContext } from '../document/context'

const SIZES = ['5', '10', '15', '20'] as const

export default function QuizHomePage() {
  const { doc } = useDocumentContext()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [size, setSize] = useState<(typeof SIZES)[number]>('5')
  const quizzes = useQuery({ queryKey: qk.quizzes(doc.id), queryFn: ({ signal }) => studyApi.quizzes(doc.id, signal) })
  const attempts = useQueries({
    queries: (quizzes.data ?? []).map((q) => ({
      queryKey: qk.attempts(q.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => studyApi.attempts(q.id, signal),
    })),
  })
  const create = useMutation({
    mutationFn: () => studyApi.generateQuiz(doc.id, Number(size)),
    onSuccess: (quiz) => {
      void qc.invalidateQueries({ queryKey: qk.quizzes(doc.id) })
      qc.setQueryData(qk.quiz(quiz.id), quiz)
      navigate(`/d/${doc.id}/quiz/${quiz.id}`)
    },
  })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
      <section className="card p-5">
        <h2 className="text-lg font-semibold">New quiz</h2>
        <p className="mt-1 text-base text-text-2">
          Multiple-choice questions about the whole document. Check each answer as you go to see why it’s right, with the page it comes from.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SegmentedControl label="Number of questions" value={size} onChange={setSize} options={SIZES.map((s) => ({ value: s, label: `${s} questions` }))} />
          <Button variant="primary" busy={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Writing questions…' : 'Start quiz'}
          </Button>
        </div>
        {create.isPending && <ProgressBar label="Writing questions" className="mt-4" />}
        {create.error ? <ErrorNotice className="mt-4" error={create.error} onRetry={() => create.mutate()} /> : null}
      </section>

      <section aria-labelledby="past-quizzes">
        <h2 id="past-quizzes" className="eyebrow mb-2">
          Your quizzes
        </h2>
        {quizzes.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : quizzes.isError ? (
          <ErrorNotice error={quizzes.error} onRetry={() => quizzes.refetch()} />
        ) : quizzes.data.length === 0 ? (
          <EmptyState icon={<ListChecks className="size-5" />} title="No quizzes yet" body="Your quizzes and scores will be listed here." />
        ) : (
          <ul className="card px-4">
            {quizzes.data.map((quiz, i) => {
              const list = attempts[i]?.data ?? []
              const best = list.reduce((m, a) => Math.max(m, a.score), -1)
              const latest = list.at(-1)
              return (
                <li key={quiz.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{quiz.title}</p>
                    <p className="font-mono text-xs text-text-3 tabular">
                      {quiz.questions.length} questions · {formatDate(quiz.created_at)} ·{' '}
                      {list.length === 0 ? 'not attempted' : `${list.length} attempt${list.length === 1 ? '' : 's'}, best ${best}/${quiz.questions.length}`}
                    </p>
                  </div>
                  {latest && (
                    <Link to={`/d/${doc.id}/quiz/${quiz.id}/attempts/${latest.id}`} className="text-sm text-text-2 hover:text-signal">
                      Last result
                    </Link>
                  )}
                  <Link
                    to={`/d/${doc.id}/quiz/${quiz.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-line-strong px-2.5 text-sm font-medium hover:border-signal hover:text-signal"
                  >
                    {list.length ? 'Retake' : 'Start'} <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
