import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, m } from 'motion/react'
import { ArrowRight, Check, X } from 'lucide-react'
import { studyApi } from '../../api/endpoints/study'
import { qk } from '../../api/queryKeys'
import type { AnswerCheckDto, QuizQuestionDto } from '../../api/types'
import { t } from '../../motion/variants'
import { Button } from '../../ui/Button'
import { ErrorNotice, Kbd, ProgressBar, Skeleton } from '../../ui/Feedback'
import { PageRef } from '../../ui/PageRef'
import { cn } from '../../ui/cn'
import { useDocumentContext } from '../document/context'
import '@fontsource-variable/source-serif-4/opsz.css'

const LETTERS = ['A', 'B', 'C', 'D']

export default function QuizRunPage() {
  const { doc } = useDocumentContext()
  const { quizId = '' } = useParams()
  const quiz = useQuery({ queryKey: qk.quiz(quizId), queryFn: ({ signal }) => studyApi.quiz(quizId, signal) })
  // Remount (fresh answers) whenever the quiz is opened again for a retake.
  return quiz.isPending ? (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Skeleton className="h-2 w-full" />
      <Skeleton className="mt-6 h-7 w-3/4" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="mt-3 h-12 w-full" />
      ))}
    </div>
  ) : quiz.isError ? (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <ErrorNotice error={quiz.error} onRetry={() => quiz.refetch()} />
    </div>
  ) : (
    <Runner key={quiz.data.id} docId={doc.id} quizId={quiz.data.id} title={quiz.data.title} questions={quiz.data.questions} />
  )
}

function Runner({ docId, quizId, title, questions }: { docId: string; quizId: string; title: string; questions: QuizQuestionDto[] }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<Record<string, number | null>>({})
  const [checks, setChecks] = useState<Record<string, AnswerCheckDto>>({})
  const question = questions[index]!
  const choice = selected[question.id]
  const check = checks[question.id]
  const last = index === questions.length - 1

  const checkMut = useMutation({
    mutationFn: (sel: number | null) => studyApi.checkAnswer(quizId, question.id, sel),
    onSuccess: (res) => setChecks((c) => ({ ...c, [res.question_id]: res })),
  })
  const submit = useMutation({
    mutationFn: () =>
      studyApi.submitAttempt(
        quizId,
        questions.map((q) => ({ question_id: q.id, selected_index: selected[q.id] ?? null })),
      ),
    onSuccess: (attempt) => {
      void qc.invalidateQueries({ queryKey: qk.attempts(quizId) })
      void qc.invalidateQueries({ queryKey: qk.activity })
      navigate(`/d/${docId}/quiz/${quizId}/attempts/${attempt.id}`)
    },
  })

  const doCheck = (sel: number | null) => {
    setSelected((s) => ({ ...s, [question.id]: sel }))
    checkMut.mutate(sel)
  }
  const next = () => {
    checkMut.reset()
    if (last) submit.mutate()
    else setIndex((i) => i + 1)
  }

  // 1-4 choose, Enter checks or advances. Ignored while typing elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return
      // A focused button/link already handles Enter natively; don't act twice.
      if (e.key === 'Enter' && target.closest('button, a')) return
      const n = Number(e.key)
      if (!check && n >= 1 && n <= question.options.length) {
        setSelected((s) => ({ ...s, [question.id]: n - 1 }))
      } else if (e.key === 'Enter') {
        if (check) next()
        else if (choice !== undefined && choice !== null && !checkMut.isPending) doCheck(choice)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 md:px-6">
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="truncate text-sm text-text-2">{title}</p>
          <p className="font-mono text-xs text-text-3 tabular">
            Question {index + 1} of {questions.length}
          </p>
        </div>
        <ProgressBar value={(index + (check ? 1 : 0)) / questions.length} label={`Question ${index + 1} of ${questions.length}`} />
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          key={question.id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0, transition: t.enter }}
          exit={{ opacity: 0, x: -8, transition: t.exit }}
          className="flex flex-col gap-5"
        >
          <h2 className="font-serif text-2xl leading-snug font-semibold text-text">{question.question}</h2>
          <div role="radiogroup" aria-label="Answer options" className="flex flex-col gap-2">
            {question.options.map((opt, i) => (
              <Option
                key={i}
                index={i}
                text={opt}
                selected={choice === i}
                state={!check ? 'open' : i === check.correct_index ? 'correct' : choice === i ? 'incorrect' : 'other'}
                onSelect={() => !check && setSelected((s) => ({ ...s, [question.id]: i }))}
              />
            ))}
          </div>

          {check ? (
            <Feedback check={check} />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={choice === undefined || choice === null} busy={checkMut.isPending} onClick={() => doCheck(choice ?? null)}>
                Check answer
              </Button>
              <Button variant="ghost" disabled={checkMut.isPending} onClick={() => doCheck(null)}>
                Skip and show answer
              </Button>
              <span className="hidden items-center gap-1.5 text-xs text-text-3 sm:flex">
                <Kbd>1</Kbd>–<Kbd>4</Kbd> choose · <Kbd>Enter</Kbd> check
              </span>
            </div>
          )}
          {checkMut.error ? <ErrorNotice error={checkMut.error} onRetry={() => doCheck(choice ?? null)} /> : null}
        </m.div>
      </AnimatePresence>

      {check && (
        <div className="flex items-center gap-3">
          <Button variant="primary" busy={submit.isPending} icon={<ArrowRight className="size-4" />} onClick={next}>
            {last ? 'See results' : 'Next question'}
          </Button>
          <span className="hidden items-center gap-1.5 text-xs text-text-3 sm:flex">
            <Kbd>Enter</Kbd>
          </span>
        </div>
      )}
      {submit.error ? <ErrorNotice error={submit.error} onRetry={() => submit.mutate()} /> : null}
      <Link to={`/d/${docId}/quiz`} className="self-start text-sm text-text-3 hover:text-text">
        Leave quiz (answers so far aren’t saved)
      </Link>
    </div>
  )
}

function Option({
  index,
  text,
  selected,
  state,
  onSelect,
}: {
  index: number
  text: string
  selected: boolean
  state: 'open' | 'correct' | 'incorrect' | 'other'
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={state !== 'open'}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-md border px-4 py-3 text-left transition-colors duration-150',
        state === 'open' && (selected ? 'border-signal tint-signal' : 'border-line-strong hover:border-text-3'),
        state === 'correct' && 'border-correct tint-correct',
        state === 'incorrect' && 'border-incorrect tint-incorrect',
        state === 'other' && 'border-line text-text-3',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm border font-mono text-xs',
          state === 'correct' ? 'border-correct bg-correct text-ink' : state === 'incorrect' ? 'border-incorrect bg-incorrect text-ink' : selected ? 'border-signal bg-signal text-ink' : 'border-line-strong text-text-2',
        )}
        aria-hidden
      >
        {state === 'correct' ? <Check className="size-3.5" /> : state === 'incorrect' ? <X className="size-3.5" /> : LETTERS[index]}
      </span>
      <span className="flex-1 text-md">{text}</span>
      {state === 'correct' && <span className="shrink-0 text-sm font-medium text-correct">Correct answer</span>}
      {state === 'incorrect' && <span className="shrink-0 text-sm font-medium text-incorrect">Your answer</span>}
    </button>
  )
}

function Feedback({ check }: { check: AnswerCheckDto }) {
  const skipped = check.selected_index === null
  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: t.enter }}
      role="status"
      className={cn('rounded-md border p-4', check.is_correct ? 'border-correct/50' : 'border-line-strong', 'bg-surface-1')}
    >
      <p className={cn('flex items-center gap-2 font-semibold', check.is_correct ? 'text-correct' : skipped ? 'text-text' : 'text-incorrect')}>
        {check.is_correct ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
        {check.is_correct ? 'Correct' : skipped ? 'Skipped' : 'Not quite'}
      </p>
      <p className="mt-2 font-serif text-md leading-relaxed text-text-2">{check.explanation}</p>
      <div className="mt-3 flex items-center gap-2 text-sm text-text-3">
        Source <PageRef page={check.page_number} />
      </div>
    </m.div>
  )
}
