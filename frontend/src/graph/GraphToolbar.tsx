import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { FastForward, RotateCcw, Search, X } from 'lucide-react'
import type { KnowledgeGraph } from '../domain/types'
import { Button, IconButton } from '../ui/Button'
import { Kbd } from '../ui/Feedback'
import { SegmentedControl } from '../ui/SegmentedControl'
import { cn } from '../ui/cn'
import { detectCapability } from './capability'
import { useGraph, type GraphStore, type ViewMode } from './graphStore'
import { searchConcepts } from './search'

const SKIPPABLE = new Set(['entering', 'paging', 'forming', 'linking', 'resolving'])

/** Controls that live outside the canvas so the scene can never cover them. */
export function GraphToolbar({ graph, store, className }: { graph: KnowledgeGraph | null; store: GraphStore; className?: string }) {
  const viewMode = useGraph(store, (s) => s.viewMode)
  const phase = useGraph(store, (s) => s.phase)
  const has3d = detectCapability().tier !== 'none'

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {graph && <ConceptSearch graph={graph} store={store} />}
      <div className="ml-auto flex items-center gap-1.5">
        {SKIPPABLE.has(phase) && (
          <Button size="sm" variant="ghost" icon={<FastForward className="size-4" />} onClick={() => store.getState().skipAnimation()}>
            Skip
          </Button>
        )}
        {graph && (
          <IconButton size="sm" label="Reset view" onClick={() => store.getState().resetView()}>
            <RotateCcw className="size-4" />
          </IconButton>
        )}
        {has3d && (
          <SegmentedControl<ViewMode>
            label="Map view"
            value={viewMode}
            onChange={(v) => store.getState().setViewMode(v)}
            options={[
              { value: '3d', label: '3D' },
              { value: '2d', label: '2D' },
            ]}
          />
        )}
      </div>
    </div>
  )
}

function ConceptSearch({ graph, store }: { graph: KnowledgeGraph; store: GraphStore }) {
  const query = useGraph(store, (s) => s.query)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const results = useMemo(() => searchConcepts(graph.concepts, query), [graph, query])

  // "/" focuses search from anywhere that isn't a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const choose = (id: string) => {
    store.getState().locate(id)
    setOpen(false)
  }

  return (
    <div className="relative w-full max-w-[320px] min-w-[200px] flex-1">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-3" />
      <input
        ref={input}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && results[active] ? `${listId}-${results[active].id}` : undefined}
        aria-label="Search concepts"
        placeholder="Search concepts"
        value={query}
        onChange={(e) => {
          store.getState().setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, results.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault()
            choose(results[active].id)
          } else if (e.key === 'Escape') {
            if (query) store.getState().setQuery('')
            else store.getState().select(null)
            setOpen(false)
          }
        }}
        className="h-8 w-full rounded-sm border border-line-strong bg-surface-1 pr-14 pl-8 text-base text-text placeholder:text-text-3 focus:border-signal focus:outline-none"
      />
      <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
        {query ? (
          <button type="button" aria-label="Clear search" className="text-text-3 hover:text-text" onClick={() => store.getState().setQuery('')}>
            <X className="size-4" />
          </button>
        ) : (
          <Kbd>/</Kbd>
        )}
      </span>
      {open && results.length > 0 && (
        <ul id={listId} role="listbox" className="absolute top-full right-0 left-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-line-strong bg-surface-2 p-1">
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${c.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(c.id)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-base', i === active && 'tint-signal')}
            >
              <span className="truncate">{c.title}</span>
              <span className="shrink-0 font-mono text-xs text-text-3">p. {c.pages[0]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
