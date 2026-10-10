import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'

function subscribe(cb: () => void) {
  const mql = window.matchMedia?.(query)
  mql?.addEventListener('change', cb)
  return () => mql?.removeEventListener('change', cb)
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(query).matches
}

/** OS reduced-motion preference, for non-Motion code (canvas, scroll behaviour). */
export function useReducedMotionPref(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false)
}
