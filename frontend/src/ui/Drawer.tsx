import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './Button'
import { cn } from './cn'
import { duration } from '../design/tokens'
import { prefersReducedMotion } from '../motion/useReducedMotionPref'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** Extra header content, right of the title. */
  actions?: ReactNode
  children: ReactNode
  /** Right-hand panel on wide screens, bottom sheet on narrow ones. */
  className?: string
}

/**
 * Modal drawer built on the native <dialog>: focus moves in and returns on close, Esc closes,
 * and the rest of the page is inert. The slide is plain CSS so it also works while JS is busy.
 */
export function Drawer({ open, onClose, title, actions, children, className }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => setShown(true))
    } else if (!open && dialog.open) {
      setShown(false)
      const ms = prefersReducedMotion() ? 0 : duration.fast * 1000
      const id = window.setTimeout(() => dialog.close(), ms)
      return () => window.clearTimeout(id)
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cn(
        'fixed m-0 hidden open:flex max-h-none max-w-none flex-col border-line bg-surface-1 p-0 text-text',
        'inset-x-0 top-auto bottom-0 h-[85dvh] w-full rounded-t-md border-t',
        'md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:w-[min(560px,92vw)] md:rounded-none md:border-t-0 md:border-l',
        'transition-[transform,opacity] duration-[420ms] ease-[var(--ease-enter)]',
        shown ? 'translate-y-0 opacity-100 md:translate-x-0' : 'translate-y-6 opacity-0 md:translate-x-6 md:translate-y-0',
        !open && !shown && 'pointer-events-none',
        className,
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <h2 className="min-w-0 flex-1 truncate text-md font-semibold">{title}</h2>
        {actions}
        <IconButton label="Close" onClick={onClose} size="sm">
          <X className="size-4" />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{open || shown ? children : null}</div>
    </dialog>
  )
}
