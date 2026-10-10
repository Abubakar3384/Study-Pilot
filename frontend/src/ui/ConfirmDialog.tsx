import { useEffect, useRef, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { describeError } from '../api/errors'
import { Button } from './Button'

/**
 * Modal confirmation on the native <dialog> (focus trap, Esc, inert page). Cancel gets focus first,
 * so pressing Enter by reflex never confirms a destructive action.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  error,
}: {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  error?: unknown
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      cancel.current?.focus()
    } else if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onCancel()
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onCancel()
      }}
      className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-[22px] border border-line bg-surface-1 p-0 text-text shadow-[var(--card-shadow)] backdrop:bg-ink/60"
    >
      <div className="flex gap-4 p-6">
        <span className="tint-incorrect flex size-10 shrink-0 items-center justify-center rounded-full text-incorrect">
          <AlertTriangle className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="confirm-title" className="text-lg font-semibold">
            {title}
          </h2>
          <div className="mt-1.5 text-base text-text-2">{body}</div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-incorrect">
              {describeError(error)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button ref={cancel} variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" busy={busy} onClick={onConfirm} className="border-transparent bg-incorrect text-ink hover:bg-incorrect/90 hover:text-ink">
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
