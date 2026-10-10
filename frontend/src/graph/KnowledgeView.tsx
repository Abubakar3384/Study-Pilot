import type { ReactNode } from 'react'
import type { SceneInput } from '../domain/types'
import { cn } from '../ui/cn'
import { CanvasSlot } from './CanvasSlot'
import { ConceptList } from './ConceptList'
import { ConceptPanel, type ConceptActions } from './ConceptPanel'
import { GraphToolbar } from './GraphToolbar'
import type { GraphStore } from './graphStore'

interface Props {
  input: SceneInput
  store: GraphStore
  actions?: ConceptActions
  onPageClick?: (page: number) => void
  /** Shown in the side column when there is no graph yet (upload progress, generate button...). */
  aside?: ReactNode
  /** Extra content at the right of the toolbar's left side (e.g. status). */
  toolbarStart?: ReactNode
  className?: string
  canvasClassName?: string
}

/**
 * The knowledge map with everything needed to use it without touching the 3D scene:
 * toolbar (search, reset, 2D/3D), the map itself, the selected-concept panel and the full concept list.
 */
export function KnowledgeView({ input, store, actions, onPageClick, aside, toolbarStart, className, canvasClassName }: Props) {
  const graph = input.kind === 'graph' ? input.graph : null
  const description = graph
    ? `Knowledge map of ${graph.concepts.length} concepts and ${graph.links.length} connections. The same concepts are listed next to the map.`
    : input.kind === 'pages'
      ? `The document has ${input.pageCount} pages.`
      : 'Knowledge map area.'

  return (
    <div className={cn('grid overflow-hidden rounded-md border border-line bg-surface-1 lg:grid-cols-[minmax(0,1fr)_340px]', className)}>
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          {toolbarStart}
          {graph?.isExample && (
            <span className="rounded-sm border border-amber/50 px-1.5 py-0.5 font-mono text-[11px] text-amber">
              Example data, not generated from a document
            </span>
          )}
          <GraphToolbar graph={graph} store={store} className="min-w-0 flex-1" />
        </div>
        <CanvasSlot
          input={input}
          store={store}
          onPageClick={onPageClick}
          description={description}
          className={cn('h-[52vh] min-h-[320px] lg:h-[min(66vh,700px)]', canvasClassName)}
        />
      </div>
      <aside className="flex min-h-0 flex-col border-t border-line lg:max-h-[calc(min(66vh,700px)+49px)] lg:border-t-0 lg:border-l">
        {graph ? (
          <>
            <ConceptPanel graph={graph} store={store} actions={actions} />
            <ConceptList graph={graph} store={store} className="min-h-[240px] flex-1" />
          </>
        ) : (
          aside
        )}
      </aside>
    </div>
  )
}
