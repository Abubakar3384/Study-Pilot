import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ArrowLeft, BookOpenText, ListChecks } from 'lucide-react'
import type { Concept, KnowledgeGraph } from '../domain/types'
import { crossfade } from '../motion/variants'
import { Button } from '../ui/Button'
import { PageRef } from '../ui/PageRef'
import { cn } from '../ui/cn'
import { useGraph, type GraphStore } from './graphStore'
import { buildAdjacency, neighborsOf } from './neighbors'

export interface ConceptActions {
  onOpenNotes?: (concept: Concept) => void
  onQuiz?: (concept: Concept) => void
  quizBusy?: boolean
}

const PAGES_SHOWN = 6
const RELATED_SHOWN = 8

const dotColor = (importance: 1 | 2 | 3) =>
  importance === 3 ? 'bg-[var(--node-key)]' : importance === 2 ? 'bg-[var(--node-2)]' : 'bg-[var(--node-1)]'

/**
 * Context for the selected concept. It takes at most ~60% of the side column and scrolls on its own;
 * the action buttons are pinned below the scroll area, so nothing can spill over the concept list.
 */
export function ConceptPanel({
  graph,
  store,
  actions,
  emptyHint,
}: {
  graph: KnowledgeGraph
  store: GraphStore
  actions?: ConceptActions
  emptyHint?: ReactNode
}) {
  const selectedId = useGraph(store, (s) => s.selectedId)
  const adjacency = useMemo(() => buildAdjacency(graph), [graph])
  const concept = graph.concepts.find((c) => c.id === selectedId)

  return (
    <section
      aria-live="polite"
      aria-label="Selected concept"
      className="relative flex min-h-[148px] shrink-0 flex-col border-b border-line lg:max-h-[66%]"
    >
      <AnimatePresence mode="wait" initial={false}>
        {concept ? (
          <m.div key={concept.id} variants={crossfade} initial="initial" animate="animate" exit="exit" className="flex min-h-0 flex-col">
            <div className="scroll-slim fade-y min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-3">
              <div className="stagger-in flex items-start gap-3" style={{ animationDelay: '0ms' }}>
                <span
                  aria-hidden
                  className={cn('mt-[0.7rem] size-2.5 shrink-0 rounded-full', concept.importance === 3 ? 'bg-[var(--node-key)] glow-amber' : 'bg-[var(--node-selected)] glow-signal')}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="font-serif text-[1.75rem] leading-tight font-semibold tracking-[-0.015em] text-text">{concept.title}</h2>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {concept.importance === 3 ? (
                      <span className="pill-badge border-amber/40 text-amber">Key concept</span>
                    ) : (
                      <span className="pill-badge border-line-strong text-text-2">{concept.importance === 2 ? 'Supporting' : 'Detail'}</span>
                    )}
                    <span className="pill-badge border-line-strong text-text-3">
                      {concept.pages.length} page{concept.pages.length === 1 ? '' : 's'}
                    </span>
                  </p>
                </div>
              </div>

              {concept.explanation && (
                <p className="stagger-in mt-4 font-serif text-md leading-relaxed text-text-2" style={{ animationDelay: '40ms' }}>
                  {concept.explanation}
                </p>
              )}

              <Collapsible
                title="Source pages"
                delay={80}
                items={concept.pages}
                limit={PAGES_SHOWN}
                render={(p) => <PageRef key={p} page={p} />}
              />

              <Collapsible
                title="Connected"
                delay={120}
                items={neighborsOf(graph, adjacency, concept.id)}
                limit={RELATED_SHOWN}
                render={(c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => store.getState().locate(c.id)}
                    onMouseEnter={() => store.getState().hover(c.id)}
                    onMouseLeave={() => store.getState().hover(null)}
                    className="chip"
                  >
                    <span aria-hidden className={cn('size-1.5 rounded-full', dotColor(c.importance))} />
                    {c.title}
                  </button>
                )}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line/70 bg-surface-1 px-5 py-3">
              {actions?.onQuiz && (
                <Button
                  size="sm"
                  variant="primary"
                  className="btn-glow"
                  icon={<ListChecks className="size-4" />}
                  busy={actions.quizBusy}
                  onClick={() => actions.onQuiz!(concept)}
                >
                  Quiz me on this
                </Button>
              )}
              {actions?.onOpenNotes && (
                <Button size="sm" icon={<BookOpenText className="size-4" />} onClick={() => actions.onOpenNotes!(concept)}>
                  Open in notes
                </Button>
              )}
              <Button size="sm" variant="ghost" className="ml-auto" icon={<ArrowLeft className="size-4" />} onClick={() => store.getState().resetView()}>
                Full map
              </Button>
            </div>
          </m.div>
        ) : (
          <m.div key="empty" variants={crossfade} initial="initial" animate="animate" exit="exit" className="px-5 py-5">
            <p className="eyebrow">Knowledge map</p>
            <p className="mt-2 font-serif text-lg leading-snug text-text">
              {emptyHint ?? 'Pick a concept to see what it means, where it appears and how it connects.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="pill-badge border-line-strong text-text-2">{graph.concepts.length} concepts</span>
              <span className="pill-badge border-line-strong text-text-2">{graph.links.length} connections</span>
              <span className="pill-badge border-line-strong text-text-2">{graph.pageCount} pages</span>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/** A labelled wrap of chips that shows the first `limit` and a "+N more" toggle. */
function Collapsible<T>({
  title,
  items,
  limit,
  render,
  delay,
}: {
  title: string
  items: T[]
  limit: number
  render: (item: T) => ReactNode
  delay: number
}) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  const shown = open ? items : items.slice(0, limit)
  const hidden = items.length - shown.length
  return (
    <div className="stagger-in mt-5" style={{ animationDelay: `${delay}ms` }}>
      <p className="eyebrow mb-2">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map(render)}
        {(hidden > 0 || open) && items.length > limit && (
          <button type="button" onClick={() => setOpen(!open)} className="chip text-signal">
            {open ? 'Show less' : `+${hidden} more`}
          </button>
        )}
      </div>
    </div>
  )
}
