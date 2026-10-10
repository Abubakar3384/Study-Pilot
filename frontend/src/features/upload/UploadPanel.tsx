import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { m } from 'motion/react'
import { AlertTriangle, ArrowRight, Check, Circle, Loader2, RotateCcw, Square, Upload, X } from 'lucide-react'
import { describeError } from '../../api/errors'
import { documentTitle, formatBytes } from '../../data/format'
import type { StepStatus } from '../../domain/uploadPipeline'
import { fadeRise } from '../../motion/variants'
import { Button } from '../../ui/Button'
import { ProgressBar } from '../../ui/Feedback'
import { cn } from '../../ui/cn'
import { useUpload } from './uploadStore'

const ICON: Record<StepStatus, ReactNode> = {
  pending: <Circle className="size-4 text-line-strong" aria-hidden />,
  active: <Loader2 className="size-4 text-signal motion-safe:animate-spin" aria-hidden />,
  done: <Check className="size-4 text-correct" aria-hidden />,
  failed: <AlertTriangle className="size-4 text-incorrect" aria-hidden />,
}
const STATUS_TEXT: Record<StepStatus, string> = { pending: 'Waiting', active: 'In progress', done: 'Done', failed: 'Failed' }

function Step({
  status,
  label,
  detail,
  children,
}: {
  status: StepStatus
  label: string
  detail?: ReactNode
  children?: ReactNode
}) {
  return (
    <li className="flex gap-3 py-2.5">
      <span className="mt-0.5">{ICON[status]}</span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-base font-medium', status === 'pending' ? 'text-text-3' : 'text-text')}>
          {label}
          <span className="sr-only">: {STATUS_TEXT[status]}</span>
        </p>
        {detail && <div className="mt-0.5 text-sm text-text-2">{detail}</div>}
        {children}
      </div>
    </li>
  )
}

/** Live, honest status of the current upload. Steps change only on real events. */
export function UploadPanel() {
  const state = useUpload((s) => s.state)
  const { cancel, retryRead, retryStep, reset, pickFile } = useUpload.getState()
  const { steps, errors, document: doc, phase } = state
  const pct = Math.round(state.progress * 100)
  const conceptsDone = steps.concepts === 'done'

  return (
    <m.section variants={fadeRise} initial="initial" animate="animate" aria-labelledby="upload-title" className="flex flex-col gap-1 p-4">
      <p className="eyebrow">{phase === 'ready' ? 'Ready' : phase === 'failed' ? 'Needs attention' : phase === 'cancelled' ? 'Cancelled' : 'Processing'}</p>
      <h2 id="upload-title" className="truncate text-lg font-semibold" title={state.fileName ?? undefined}>
        {doc ? documentTitle(doc) : state.fileName}
      </h2>
      <p className="font-mono text-xs text-text-3 tabular">
        {formatBytes(state.fileSize)}
        {doc?.page_count ? ` · ${doc.page_count} pages` : ''}
      </p>

      <ol aria-live="polite" className="mt-2 divide-y divide-line border-y border-line">
        <Step
          status={steps.upload}
          label="Upload"
          detail={steps.upload === 'active' ? `${pct}% sent` : steps.upload === 'failed' ? describeError(errors.upload) : undefined}
        >
          {steps.upload === 'active' && <ProgressBar value={state.progress} label="Upload progress" className="mt-2" />}
        </Step>
        <Step
          status={steps.read}
          label="Read pages"
          detail={
            steps.read === 'active'
              ? 'The server is extracting text page by page.'
              : steps.read === 'done' && doc
                ? `${doc.page_count} pages read`
                : steps.read === 'failed'
                  ? typeof errors.read === 'string'
                    ? errors.read
                    : describeError(errors.read)
                  : undefined
          }
        >
          {steps.read === 'active' && <ProgressBar label="Reading pages" className="mt-2" />}
          {steps.read === 'failed' && doc && (
            <Button size="sm" className="mt-2" icon={<RotateCcw className="size-3.5" />} onClick={retryRead}>
              Try reading again
            </Button>
          )}
        </Step>
        <Step
          status={steps.summary}
          label="Summary"
          detail={
            steps.summary === 'active'
              ? steps.concepts === 'active'
                ? 'Queued: starts when the concept map is done.'
                : 'Writing an overview with page references.'
              : steps.summary === 'failed'
                ? describeError(errors.summary)
                : undefined
          }
        >
          {steps.summary === 'failed' && (
            <Button size="sm" className="mt-2" icon={<RotateCcw className="size-3.5" />} onClick={() => retryStep('summary')}>
              Retry summary
            </Button>
          )}
        </Step>
        <Step
          status={steps.concepts}
          label="Concept map"
          detail={
            steps.concepts === 'active'
              ? state.stoppedWaiting
                ? 'Stopped waiting. The server may still finish.'
                : 'Finding key concepts and how they connect. This can take a few minutes with a local model.'
              : steps.concepts === 'failed'
                ? describeError(errors.concepts)
                : undefined
          }
        >
          {steps.concepts === 'failed' && (
            <Button size="sm" className="mt-2" icon={<RotateCcw className="size-3.5" />} onClick={() => retryStep('concepts')}>
              Retry concept map
            </Button>
          )}
        </Step>
      </ol>

      <div className="mt-3 flex flex-wrap gap-2">
        {doc && doc.status === 'ready' && (
          <Link
            to={`/d/${doc.id}`}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-sm px-3.5 text-base font-medium transition-colors',
              conceptsDone || phase === 'ready' ? 'bg-signal text-ink hover:bg-signal/85' : 'border border-line-strong bg-surface-2 hover:border-text-3',
            )}
          >
            Open document <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
        {(phase === 'uploading' || phase === 'reading') && (
          <Button icon={<X className="size-4" />} onClick={cancel}>
            Cancel
          </Button>
        )}
        {phase === 'generating' && (
          <Button variant="ghost" icon={<Square className="size-3 fill-current" />} onClick={cancel}>
            Stop generating
          </Button>
        )}
        {(phase === 'ready' || phase === 'failed' || phase === 'cancelled') && (
          <>
            <Button variant="ghost" icon={<Upload className="size-4" />} onClick={pickFile}>
              Upload another
            </Button>
            <Button variant="ghost" onClick={reset}>
              Close
            </Button>
          </>
        )}
      </div>
      {phase === 'generating' && doc && (
        <p className="mt-2 text-sm text-text-3">You can open the document now. Notes, quizzes and flashcards work while this finishes.</p>
      )}
    </m.section>
  )
}
