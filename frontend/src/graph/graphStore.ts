import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { ScenePhase } from './sequence'

export type ViewMode = '3d' | '2d'

export interface GraphUiState {
  selectedId: string | null
  hoveredId: string | null
  query: string
  viewMode: ViewMode
  /** Coarse phase reported by whichever renderer is active (changes a few times per sequence). */
  phase: ScenePhase
  /** Counters the canvas watches; incrementing one is a one-shot command. */
  resetSignal: number
  skipSignal: number
  focus: { id: string; n: number } | null
  select: (id: string | null) => void
  hover: (id: string | null) => void
  setQuery: (q: string) => void
  setViewMode: (mode: ViewMode) => void
  setPhase: (phase: ScenePhase) => void
  resetView: () => void
  skipAnimation: () => void
  /** Select and bring a concept into view (search results). */
  locate: (id: string) => void
}

export type GraphStore = StoreApi<GraphUiState>

const VIEW_MODE_KEY = 'sp:view-mode'

export function readViewModePref(): ViewMode | null {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY)
    return v === '2d' || v === '3d' ? v : null
  } catch {
    return null
  }
}

function writeViewModePref(mode: ViewMode) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode)
  } catch {
    // storage unavailable (private mode); the choice just isn't remembered
  }
}

export function createGraphStore(initialViewMode: ViewMode): GraphStore {
  return createStore<GraphUiState>((set, get) => ({
    selectedId: null,
    hoveredId: null,
    query: '',
    viewMode: initialViewMode,
    phase: 'idle',
    resetSignal: 0,
    skipSignal: 0,
    focus: null,
    select: (id) => {
      if (get().selectedId !== id) set({ selectedId: id })
    },
    hover: (id) => {
      if (get().hoveredId !== id) set({ hoveredId: id })
    },
    setQuery: (query) => set({ query }),
    setViewMode: (viewMode) => {
      writeViewModePref(viewMode)
      set({ viewMode })
    },
    setPhase: (phase) => {
      if (get().phase === phase) return
      if (phase === 'resolved') performance.mark('sp:graph-resolved')
      set({ phase })
    },
    resetView: () => set((s) => ({ selectedId: null, resetSignal: s.resetSignal + 1 })),
    skipAnimation: () => set((s) => ({ skipSignal: s.skipSignal + 1 })),
    locate: (id) => set((s) => ({ selectedId: id, focus: { id, n: (s.focus?.n ?? 0) + 1 } })),
  }))
}

/** One store per document, kept for the session so selection survives tab switches. */
const registry = new Map<string, GraphStore>()

export function getGraphStore(key: string, initialViewMode: ViewMode): GraphStore {
  let store = registry.get(key)
  if (!store) {
    store = createGraphStore(initialViewMode)
    registry.set(key, store)
  }
  return store
}

export function useGraph<T>(store: GraphStore, selector: (s: GraphUiState) => T): T {
  return useStore(store, selector)
}
