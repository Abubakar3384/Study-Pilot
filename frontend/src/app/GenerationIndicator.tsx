import { Link } from 'react-router'
import { AnimatePresence, m } from 'motion/react'
import { Loader2, Square } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { qk } from '../api/queryKeys'
import type { DocumentDto } from '../api/types'
import { documentTitle } from '../data/format'
import { KIND_LABEL, stopGeneration, useRunningJob, type GenKind } from '../data/generation'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { t } from '../motion/variants'

const TAB: Record<GenKind, string> = {
  summary: '',
  concepts: '',
  notes: '/notes',
  quiz: '/quiz',
  flashcards: '/cards',
  chat: '/ask',
}

/** Small pill showing what the AI is working on, visible from every screen. */
export function GenerationIndicator() {
  const job = useRunningJob()
  const qc = useQueryClient()
  const doc = job ? qc.getQueryData<DocumentDto>(qk.document(job.docId)) : undefined
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-20 left-1/2 z-40 -translate-x-1/2 md:bottom-5">
      <AnimatePresence>
        {job && (
          <m.div
            key={job.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: t.enter }}
            exit={{ opacity: 0, transition: t.exit }}
            className="pointer-events-auto"
          >
            <div className="flex items-center rounded-full border border-line bg-surface-1 text-sm shadow-[var(--card-shadow)]">
              <Link to={`/d/${job.docId}${TAB[job.kind]}`} className="flex items-center gap-2.5 rounded-l-full py-2 pr-3 pl-3">
                <Loader2 className="size-4 text-signal motion-safe:animate-spin" aria-hidden />
                <span>
                  {job.stopping ? 'Stopping' : 'Generating'} {KIND_LABEL[job.kind]}
                  {doc ? <span className="text-text-3"> · {documentTitle(doc)}</span> : null}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => stopGeneration(job.docId, job.kind)}
                disabled={job.stopping}
                aria-label={`Stop generating ${KIND_LABEL[job.kind]}`}
                className="flex items-center gap-1.5 rounded-r-full border-l border-line py-2 pr-4 pl-3 font-medium text-text-2 transition-colors hover:text-incorrect disabled:opacity-50"
              >
                <Square className="size-3 fill-current" aria-hidden />
                Stop
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Stops the job a screen is showing as in progress. */
export function StopButton({ onStop, stopping, className }: { onStop: () => void; stopping?: boolean; className?: string }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className={cn('text-text-2 hover:text-incorrect', className)}
      icon={<Square className="size-3 fill-current" />}
      disabled={stopping}
      onClick={onStop}
    >
      {stopping ? 'Stopping…' : 'Stop'}
    </Button>
  )
}

/** Inline note shown next to disabled AI actions while another job runs. */
export function BusyNote({ job, className }: { job: { kind: GenKind } | undefined; className?: string }) {
  if (!job) return null
  return (
    <p role="status" className={className ?? 'text-sm text-text-3'}>
      Waiting for {KIND_LABEL[job.kind]} to finish. The AI handles one request at a time.
    </p>
  )
}
