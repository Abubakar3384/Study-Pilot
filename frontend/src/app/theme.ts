import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'sp:theme'
const listeners = new Set<() => void>()

export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Applies the theme to <html>; light is the default. Called before first render to avoid a flash. */
export function applyTheme(theme: Theme = readTheme()) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0C0F14' : '#F4F6FB')
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // not persisted; still applied for this visit
  }
  applyTheme(theme)
  listeners.forEach((l) => l())
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
    () => 'light',
  )
}
