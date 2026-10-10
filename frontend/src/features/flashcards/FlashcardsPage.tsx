import { useEffect, useState } from 'react'
import { useAiJob } from '../../data/generation'
import { BusyNote } from '../../app/GenerationIndicator'
import { Link, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { m } from 'motion/react'
import { ChevronLeft, ChevronRight, Layers, RotateCcw, Shuffle } from 'lucide-react'
import { studyApi } from '../../api/endpoints/study'
import { qk } from '../../api/queryKeys'
import type { FlashcardDto, ReviewRating } from '../../api/types'
import { formatDate } from '../../data/format'
import { duration, ease } from '../../design/tokens'
import { Button, IconButton } from '../../ui/Button'
import { EmptyState, ErrorNotice, Kbd, ProgressBar, Skeleton } from '../../ui/Feedback'
import { PageRef } from '../../ui/PageRef'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { cn } from '../../ui/cn'
import { useDocumentContext } from '../document/context'
import '@fontsource-variable/source-serif-4/opsz.css'

export default function FlashcardsPage() {
  const { doc } = useDocumentContext()
  const [params, setParams] = useSearchParams()
  const dueOnly = params.get('due') === '1'
  const cards = useQuery({ queryKey: qk.flashcards(doc.id, dueOnly), queryFn: ({ signal }) => studyApi.flashcards(doc.id, dueOnly, signal) })
  const qc = useQueryClient()
  const generate = useAiJob(doc.id, 'flashcards', {
    run: (count: number) => studyApi.generateFlashcards(doc.id, count),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documents', doc.id, 'flashcards'] }),
  })

  const toggle = (
    <SegmentedControl
      label="Which cards"
      value={dueOnly ? 'due' : 'all'}
      onChange={(v) => setParams(v === 'due' ? { due: '1' } : {}, { replace: true })}
      options={[
        { value: 'all', label: 'All cards' },
        { value: 'due', label: 'Due now' },
      ]}
    />
  )

  if (cards.isPending) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Skeleton className="aspect-[3/2] w-full" />
      </div>
    )
  }
  if (cards.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ErrorNotice error={cards.error} onRetry={() => cards.refetch()} />
      </div>
    )
  }
  if (cards.data.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
        <div>{toggle}</div>
        {dueOnly ? (
          <EmptyState icon={<Layers className="size-5" />} title="Nothing due right now" body="Every card is scheduled for later. Switch to All cards to practise anyway." />
        ) : (
          <EmptyState
            icon={<Layers className="size-5" />}
            title="No flashcards yet"
            body="Generate a deck from this document. Cards you mark as known come back later; cards that need review come back soon."
            action={
              <div className="flex flex-col items-start gap-3">
                <div className="flex gap-2">
                  <Button variant="primary" busy={generate.isPending && generate.variables === 10} disabled={generate.disabled} onClick={() => generate.mutate(10)}>
                    Generate 10 cards
                  </Button>
                  <Button busy={generate.isPending && generate.variables === 20} disabled={generate.disabled} onClick={() => generate.mutate(20)}>
                    20 cards
                  </Button>
                </div>
                {generate.isPending && <ProgressBar label="Writing flashcards" className="w-64" />}
                <BusyNote job={generate.blockedBy} />
                {generate.error ? <ErrorNotice error={generate.error} onRetry={() => generate.mutate(generate.variables ?? 10)} /> : null}
              </div>
            }
          />
        )}
      </div>
    )
  }

  return <Session key={`${dueOnly}-${cards.data.length}`} cards={cards.data} toggle={toggle} onAddMore={() => generate.mutate(10)} adding={generate.isPending} addDisabled={generate.disabled} />
}

type Outcome = 'known' | 'review'

function Session({
  cards,
  toggle,
  onAddMore,
  adding,
  addDisabled,
}: {
  cards: FlashcardDto[]
  toggle: React.ReactNode
  onAddMore: () => void
  adding: boolean
  addDisabled: boolean
}) {
  const { doc } = useDocumentContext()
  const qc = useQueryClient()
  const [order, setOrder] = useState(() => cards.map((_, i) => i))
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({})
  const [nextDue, setNextDue] = useState<Record<string, string>>({})
  const [detailed, setDetailed] = useState(false)
  const done = index >= order.length
  const card = done ? null : cards[order[index]!]!

  const review = useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: ReviewRating }) => studyApi.review(id, rating),
    onSuccess: (updated) => {
      setNextDue((d) => ({ ...d, [updated.id]: updated.due_at }))
      void qc.invalidateQueries({ queryKey: ['documents', doc.id, 'flashcards'] })
      void qc.invalidateQueries({ queryKey: qk.activity })
    },
  })

  const go = (delta: number) => {
    setFlipped(false)
    setIndex((i) => Math.min(order.length, Math.max(0, i + delta)))
  }
  const rate = (rating: ReviewRating) => {
    if (!card) return
    setOutcomes((o) => ({ ...o, [card.id]: rating === 'again' || rating === 'hard' ? 'review' : 'known' }))
    review.mutate({ id: card.id, rating })
    go(1)
  }
  const shuffle = () => {
    const a = order.slice()
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j]!, a[i]!]
    }
    setOrder(a)
    setIndex(0)
    setFlipped(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey || done) return
      if (e.key === ' ') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (flipped && !detailed && e.key === '1') rate('again')
      else if (flipped && !detailed && e.key === '2') rate('good')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const known = Object.values(outcomes).filter((o) => o === 'known').length
  const toReview = Object.values(outcomes).length - known

  if (done) {
    const soonest = Object.values(nextDue).sort()[0]
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8">
        <div className="card p-6">
          <p className="eyebrow">Session complete</p>
          <p className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
            <span>
              <span className="font-mono text-3xl text-correct tabular">{known}</span> <span className="text-text-2">known</span>
            </span>
            <span>
              <span className="font-mono text-3xl text-amber tabular">{toReview}</span> <span className="text-text-2">need review</span>
            </span>
          </p>
          <p className="mt-3 text-base text-text-2">
            {soonest ? `The next card comes back on ${formatDate(soonest)}. Cards that need review return sooner.` : 'You went through every card without rating them.'}
          </p>
          {review.error ? <p className="mt-2 text-sm text-incorrect">Some ratings could not be saved. Check your connection.</p> : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              icon={<RotateCcw className="size-4" />}
              onClick={() => {
                setIndex(0)
                setOutcomes({})
              }}
            >
              Go through again
            </Button>
            <Button variant="ghost" busy={adding} disabled={addDisabled} onClick={onAddMore}>
              Add 10 more cards
            </Button>
            <Link to={`/d/${doc.id}`} className="inline-flex h-9 items-center px-3.5 text-text-2 hover:text-text">
              Back to overview
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {toggle}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={<Shuffle className="size-4" />} onClick={shuffle}>
            Shuffle
          </Button>
          <SegmentedControl
            label="Rating detail"
            value={detailed ? '4' : '2'}
            onChange={(v) => setDetailed(v === '4')}
            options={[
              { value: '2', label: 'Simple' },
              { value: '4', label: '4 levels' },
            ]}
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex justify-between font-mono text-xs text-text-3 tabular">
          <span>
            Card {index + 1} of {order.length}
          </span>
          <span>
            {known} known · {toReview} to review
          </span>
        </div>
        <ProgressBar value={index / order.length} label={`Card ${index + 1} of ${order.length}`} />
      </div>

      <FlipCard card={card!} flipped={flipped} onFlip={() => setFlipped((f) => !f)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          <IconButton variant="secondary" label="Previous card" disabled={index === 0} onClick={() => go(-1)}>
            <ChevronLeft className="size-5" />
          </IconButton>
          <IconButton variant="secondary" label="Next card" onClick={() => go(1)}>
            <ChevronRight className="size-5" />
          </IconButton>
        </div>
        {!flipped ? (
          <Button variant="primary" onClick={() => setFlipped(true)}>
            Show answer <Kbd>Space</Kbd>
          </Button>
        ) : detailed ? (
          <div className="flex flex-wrap gap-2">
            {(['again', 'hard', 'good', 'easy'] as const).map((r) => (
              <Button key={r} size="sm" variant={r === 'good' ? 'primary' : 'secondary'} onClick={() => rate(r)}>
                {r[0]!.toUpperCase() + r.slice(1)}
              </Button>
            ))}
          </div>
        ) : (
          <div className="flex gap-2">
            <Button onClick={() => rate('again')}>
              Needs review <Kbd>1</Kbd>
            </Button>
            <Button variant="primary" onClick={() => rate('good')}>
              Known <Kbd>2</Kbd>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function FlipCard({ card, flipped, onFlip }: { card: FlashcardDto; flipped: boolean; onFlip: () => void }) {
  const face = 'absolute inset-0 flex flex-col rounded-md border p-6 md:p-8 [backface-visibility:hidden]'
  return (
    <div className="[perspective:1400px]">
      <m.button
        type="button"
        onClick={onFlip}
        aria-label={flipped ? 'Card answer side. Flip to question' : 'Card question side. Flip to answer'}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: duration.flip, ease: ease.standard }}
        className="relative block aspect-[3/2] w-full text-left [transform-style:preserve-3d] max-sm:aspect-[4/5]"
      >
        <div className={cn(face, 'border-line-strong bg-surface-1')}>
          <p className="eyebrow">Question</p>
          <p className="my-auto font-serif text-2xl leading-snug text-text md:text-[1.75rem]">{card.front}</p>
          <p className="text-sm text-text-3">Click or press Space to flip</p>
        </div>
        <div className={cn(face, 'border-signal/50 bg-surface-2 [transform:rotateY(180deg)]')}>
          <p className="eyebrow">Answer</p>
          <p className="my-auto font-serif text-xl leading-relaxed text-text md:text-2xl">{card.back}</p>
        </div>
      </m.button>
      <div className={cn('mt-2 flex h-6 items-center gap-2 text-sm text-text-3 transition-opacity', flipped ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        Source <PageRef page={card.page_number} />
      </div>
      <p className="sr-only" aria-live="polite">
        {flipped ? `Answer: ${card.back}` : ''}
      </p>
    </div>
  )
}
