import type { ReactNode } from 'react'
import { AlertTriangle, Check, CloudOff, Loader2 } from 'lucide-react'
import { cn } from './cn'
import { Button } from './Button'
import { describeError } from '../api/errors'

/** Determinate when `value` is given (0..1), otherwise an honest indeterminate bar. */
export function ProgressBar({ value, label, className }: { value?: number; label: string; className?: string }) {
  const determinate = typeof value === 'number'
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? Math.round(value * 100) : undefined}
      className={cn('relative h-[3px] w-full overflow-hidden rounded-full bg-line', className)}
    >
      {determinate ? (
        <div
          className="h-full origin-left bg-signal transition-transform duration-200"
          style={{ transform: `scaleX(${Math.max(0, Math.min(1, value))})` }}
        />
      ) : (
        <div className="absolute inset-y-0 w-1/3 bg-signal motion-safe:animate-[indeterminate_1.4s_var(--ease-standard)_infinite] motion-reduce:w-full motion-reduce:opacity-50" />
      )}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('shimmer rounded-md', className)} />
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong px-1 font-mono text-[11px] text-text-2">
      {children}
    </kbd>
  )
}

export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string
  body?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-start gap-3 rounded-[22px] border border-dashed border-line-strong bg-surface-1/60 p-6', className)}>
      {icon && <div className="text-text-3">{icon}</div>}
      <div>
        <h3 className="text-md font-semibold text-text">{title}</h3>
        {body && <p className="mt-1 max-w-[52ch] text-base text-text-2">{body}</p>}
      </div>
      {action}
    </div>
  )
}

/** Inline error with a Retry action; used wherever a request can fail. */
export function ErrorNotice({
  error,
  onRetry,
  retrying,
  className,
}: {
  error: unknown
  onRetry?: () => void
  retrying?: boolean
  className?: string
}) {
  return (
    <div role="alert" className={cn('flex items-start gap-3 rounded-md border border-incorrect/40 tint-incorrect p-3.5', className)}>
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-incorrect" />
      <p className="flex-1 text-base text-text">{describeError(error)}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry} busy={retrying}>
          Retry
        </Button>
      )}
    </div>
  )
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry?: () => void }) {
  if (state === 'idle') return null
  return (
    <span role="status" className="inline-flex items-center gap-1.5 font-mono text-xs text-text-3">
      {state === 'saving' && (
        <>
          <Loader2 aria-hidden className="size-3.5 motion-safe:animate-spin" /> Saving…
        </>
      )}
      {state === 'saved' && (
        <>
          <Check aria-hidden className="size-3.5 text-correct" /> Saved
        </>
      )}
      {state === 'error' && (
        <>
          <CloudOff aria-hidden className="size-3.5 text-incorrect" /> Couldn't save
          {onRetry && (
            <button type="button" onClick={onRetry} className="ml-1 text-signal underline underline-offset-2">
              Retry
            </button>
          )}
        </>
      )}
    </span>
  )
}
