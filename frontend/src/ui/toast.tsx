import { AnimatePresence, m } from 'motion/react'
import { AlertTriangle, Check, Info, X } from 'lucide-react'
import { create } from 'zustand'
import { t } from '../motion/variants'
import { cn } from './cn'

type Tone = 'info' | 'success' | 'error'

interface Toast {
  id: number
  tone: Tone
  message: string
  action?: { label: string; onClick: () => void }
}

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>, ttlMs?: number) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast, ttlMs = 5000) => {
    const id = nextId++
    set({ toasts: [...get().toasts.slice(-2), { ...toast, id }] })
    if (ttlMs > 0) window.setTimeout(() => get().dismiss(id), ttlMs)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}))

export const toast = {
  info: (message: string, action?: Toast['action']) => useToasts.getState().push({ tone: 'info', message, action }),
  success: (message: string) => useToasts.getState().push({ tone: 'success', message }),
  error: (message: string, action?: Toast['action']) =>
    useToasts.getState().push({ tone: 'error', message, action }, 8000),
}

const ICON = { info: Info, success: Check, error: AlertTriangle }
const TONE = { info: 'text-signal', success: 'text-correct', error: 'text-incorrect' }

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-20 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 md:bottom-4"
    >
      <AnimatePresence initial={false}>
        {toasts.map((item) => {
          const Icon = ICON[item.tone]
          return (
            <m.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: t.enter }}
              exit={{ opacity: 0, transition: t.exit }}
              role={item.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-3 rounded-md border border-line-strong bg-surface-2 p-3"
            >
              <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', TONE[item.tone])} />
              <p className="flex-1 text-base">{item.message}</p>
              {item.action && (
                <button
                  type="button"
                  className="text-base font-medium text-signal"
                  onClick={() => {
                    item.action!.onClick()
                    dismiss(item.id)
                  }}
                >
                  {item.action.label}
                </button>
              )}
              <button type="button" aria-label="Dismiss" className="text-text-3 hover:text-text" onClick={() => dismiss(item.id)}>
                <X className="size-4" />
              </button>
            </m.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
