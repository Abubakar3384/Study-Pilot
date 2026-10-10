import type { TopicPerformance } from '../../domain/performance'
import { formatPages } from '../../graph/format'
import { PageRef } from '../../ui/PageRef'
import { cn } from '../../ui/cn'

const LABEL = { weak: 'Needs work', strong: 'Strong', mixed: 'Mixed', few: 'Too few questions' } as const

/**
 * Concepts with their quiz results. Status is text plus shape (dashed outline = needs work),
 * never colour alone. Ratios are shown as counts, not decorative charts.
 */
export function TopicPerformanceList({ topics, emptyText }: { topics: TopicPerformance[]; emptyText: string }) {
  if (topics.length === 0) return <p className="text-base text-text-2">{emptyText}</p>
  return (
    <ul className="flex flex-col gap-2">
      {topics.map(({ concept, correct, total, status }) => (
        <li
          key={concept.id}
          className={cn(
            'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2.5',
            status === 'weak' ? 'border border-dashed border-incorrect/70' : 'border border-line',
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{concept.title}</span>
            <span className="block font-mono text-xs text-text-3">{formatPages(concept.pages)}</span>
          </span>
          <span
            className={cn(
              'font-mono text-xs',
              status === 'weak' ? 'text-incorrect' : status === 'strong' ? 'text-correct' : 'text-text-2',
            )}
          >
            {LABEL[status]}
          </span>
          <span className="w-14 text-right font-mono text-sm tabular" aria-label={`${correct} of ${total} correct`}>
            {correct}/{total}
          </span>
          <PageRef page={concept.pages[0]!} />
        </li>
      ))}
    </ul>
  )
}
