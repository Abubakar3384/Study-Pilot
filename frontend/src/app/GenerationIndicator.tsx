import { Link } from 'react-router'
import { AnimatePresence, m } from 'motion/react'
import { Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { qk } from '../api/queryKeys'
import type { DocumentDto } from '../api/types'
import { documentTitle } from '../data/format'
import { KIND_LABEL, useRunningJob, type GenKind } from '../data/generation'
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
            <Link
              to={`/d/${job.docId}${TAB[job.kind]}`}
              className="flex items-center gap-2.5 rounded-full border border-line bg-surface-1 py-2 pr-4 pl-3 text-sm shadow-[var(--card-shadow)]"
            >
              <Loader2 className="size-4 text-signal motion-safe:animate-spin" aria-hidden />
              <span>
                Generating {KIND_LABEL[job.kind]}
                {doc ? <span className="text-text-3"> · {documentTitle(doc)}</span> : null}
              </span>
            </Link>
          </m.div>
        )}
      </AnimatePresence>
    </div>
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
