import { useMemo, type ReactNode } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ArrowLeft, BookOpenText, ListChecks } from 'lucide-react'
import type { Concept, KnowledgeGraph } from '../domain/types'
import { crossfade } from '../motion/variants'
import { Button } from '../ui/Button'
import { PageRef } from '../ui/PageRef'
import { ImportanceMark } from './ConceptList'
import { useGraph, type GraphStore } from './graphStore'
import { buildAdjacency, neighborsOf } from './neighbors'

export interface ConceptActions {
  onOpenNotes?: (concept: Concept) => void
  onQuiz?: (concept: Concept) => void
  quizBusy?: boolean
}

/** Context for the selected concept. The panel stays put; only its content crossfades on change. */
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
    <section aria-live="polite" aria-label="Selected concept" className="relative min-h-[148px] border-b border-line px-4 py-4">
      <AnimatePresence mode="wait" initial={false}>
        {concept ? (
          <m.div key={concept.id} variants={crossfade} initial="initial" animate="animate" exit="exit" className="flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <span className="mt-1.5">
                <ImportanceMark importance={concept.importance} selected />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold text-text">{concept.title}</h2>
                {concept.importance === 3 && <p className="eyebrow mt-0.5 text-amber">Key concept</p>}
              </div>
            </div>
            {concept.explanation && <p className="font-serif text-md leading-relaxed text-text-2">{concept.explanation}</p>}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="eyebrow mr-1">Source</span>
              {concept.pages.map((p) => (
                <PageRef key={p} page={p} />
              ))}
            </div>
            <Related concepts={neighborsOf(graph, adjacency, concept.id)} store={store} />
            <div className="flex flex-wrap gap-2 pt-1">
              {actions?.onOpenNotes && (
                <Button size="sm" icon={<BookOpenText className="size-4" />} onClick={() => actions.onOpenNotes!(concept)}>
                  Open in notes
                </Button>
              )}
              {actions?.onQuiz && (
                <Button size="sm" icon={<ListChecks className="size-4" />} busy={actions.quizBusy} onClick={() => actions.onQuiz!(concept)}>
                  Quiz me on this
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => store.getState().select(null)}>
                Full map
              </Button>
            </div>
          </m.div>
        ) : (
          <m.div key="empty" variants={crossfade} initial="initial" animate="animate" exit="exit">
            <p className="eyebrow">Knowledge map</p>
            <p className="mt-2 text-base text-text-2">
              {emptyHint ?? 'Select a concept on the map or in the list to see what it means, where it appears and how it connects.'}
            </p>
            <p className="mt-3 font-mono text-xs text-text-3 tabular">
              {graph.concepts.length} concepts · {graph.links.length} connections · {graph.pageCount} pages
            </p>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function Related({ concepts, store }: { concepts: Concept[]; store: GraphStore }) {
  if (concepts.length === 0) return null
  return (
    <div>
      <p className="eyebrow mb-1.5">Connected</p>
      <ul className="flex flex-wrap gap-1.5">
        {concepts.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => store.getState().select(c.id)}
              onMouseEnter={() => store.getState().hover(c.id)}
              onMouseLeave={() => store.getState().hover(null)}
              className="h-7 rounded-sm border border-line-strong px-2 text-sm text-text-2 transition-colors hover:border-signal hover:text-text"
            >
              {c.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
