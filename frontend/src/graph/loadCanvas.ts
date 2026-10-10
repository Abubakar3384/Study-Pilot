import type { ComponentType } from 'react'
import type { KnowledgeCanvasProps } from '../canvas/KnowledgeCanvas'
import { detectCapability } from './capability'

type CanvasModule = { default: ComponentType<KnowledgeCanvasProps> }

let pending: Promise<CanvasModule> | null = null

/** Memoised dynamic import of the 3D chunk (three + r3f + scene). Safe to call from anywhere. */
export function loadCanvas(): Promise<CanvasModule> {
  if (!pending) {
    performance.mark('sp:canvas-chunk-requested')
    pending = import('../canvas/KnowledgeCanvas')
      .then((mod) => {
        performance.mark('sp:canvas-chunk-loaded')
        return mod
      })
      .catch((err) => {
        pending = null // allow a later retry
        throw err
      })
  }
  return pending
}

/** Warm the 3D chunk when the device will use it; ignored on 2D-only devices. */
export function prefetchCanvas(): void {
  if (detectCapability().tier === 'none') return
  void loadCanvas().catch(() => {})
}

/** Prefetch once the browser is idle (used after the dashboard / overview first paint). */
export function prefetchCanvasWhenIdle(): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(prefetchCanvas, { timeout: 2500 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(prefetchCanvas, 1200)
  return () => window.clearTimeout(id)
}
