import { useEffect, useMemo, useRef } from 'react'
import type { KnowledgeGraph } from '../domain/types'
import { cn } from '../ui/cn'
import { formatPages } from './format'
import { useGraph, type GraphStore } from './graphStore'
import { searchConcepts } from './search'

/**
 * The accessible equivalent of the knowledge map: every concept as a button, in document order,
 * sharing selection and hover with the canvas through the graph store.
 */
export function ConceptList({ graph, store, className }: { graph: KnowledgeGraph; store: GraphStore; className?: string }) {
  const selectedId = useGraph(store, (s) => s.selectedId)
  const hoveredId = useGraph(store, (s) => s.hoveredId)
  const query = useGraph(store, (s) => s.query)
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())

  const items = useMemo(() => {
    if (query.trim()) return searchConcepts(graph.concepts, query, graph.concepts.length)
    return [...graph.concepts].sort((a, b) => (a.pages[0] ?? 0) - (b.pages[0] ?? 0) || b.importance - a.importance)
  }, [graph, query])

  // Keep the selection visible when it was made on the canvas.
  useEffect(() => {
    if (!selectedId) return
    itemRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <h2 className="eyebrow">{query.trim() ? `Matches for “${query.trim()}”` : 'Concepts in document order'}</h2>
        <span className="font-mono text-xs text-text-3 tabular">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 pb-4 text-base text-text-2">No concept matches “{query}”.</p>
      ) : (
        <ul aria-label="Concepts" className="scroll-slim fade-y min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {items.map((c, i) => {
            const selected = c.id === selectedId
            return (
              <li key={c.id} className="stagger-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                <button
                  ref={(el) => {
                    if (el) itemRefs.current.set(c.id, el)
                    else itemRefs.current.delete(c.id)
                  }}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => (selected ? store.getState().resetView() : store.getState().locate(c.id))}
                  onMouseEnter={() => store.getState().hover(c.id)}
                  onMouseLeave={() => store.getState().hover(null)}
                  onFocus={() => store.getState().hover(c.id)}
                  onBlur={() => store.getState().hover(null)}
                  className={cn(
                    'list-row group relative flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left',
                    selected ? 'list-row-active text-text' : c.id === hoveredId ? 'bg-surface-2' : 'hover:bg-surface-2',
                  )}
                >
                  <ImportanceMark importance={c.importance} selected={selected} />
                  <span className={cn('min-w-0 flex-1 truncate text-base', c.importance === 3 ? 'font-semibold' : 'font-medium text-text-2 group-hover:text-text', selected && 'text-text')}>
                    {c.title}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-text-3 tabular">{formatPages(c.pages)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Shape + label, not colour alone: key concepts get a filled square and the word "Key" for AT. */
export function ImportanceMark({ importance, selected }: { importance: 1 | 2 | 3; selected?: boolean }) {
  const label = importance === 3 ? 'Key concept' : importance === 2 ? 'Supporting concept' : 'Detail'
  return (
    <span className="flex size-3 shrink-0 items-center justify-center" title={label}>
      <span className="sr-only">{label}</span>
      {importance === 3 ? (
        <span aria-hidden className={cn('size-2.5 rounded-[2px]', selected ? 'bg-[var(--node-selected)]' : 'bg-[var(--node-key)]')} />
      ) : (
        <span
          aria-hidden
          className={cn('rounded-full', importance === 2 ? 'size-2 bg-[var(--node-2)]' : 'size-1.5 bg-[var(--node-1)]', selected && 'bg-[var(--node-selected)]')}
        />
      )}
    </span>
  )
}
