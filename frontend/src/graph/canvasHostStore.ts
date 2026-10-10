import { create } from 'zustand'
import type { SceneInput } from '../domain/types'
import type { GraphStore } from './graphStore'

export interface SlotCallbacks {
  onPageClick?: (page: number) => void
  onPerformanceFallback: () => void
  onFailure: (reason: 'load' | 'context' | 'render') => void
}

export interface SlotRegistration {
  id: string
  el: HTMLElement
  input: SceneInput
  store: GraphStore
  tier: 'high' | 'low'
  reducedMotion: boolean
  callbacks: SlotCallbacks
}

interface HostState {
  slot: SlotRegistration | null
  /** Slot whose canvas has rendered at least one frame; that slot hides its 2D placeholder. */
  readyId: string | null
  setReady: (id: string | null) => void
  attach: (slot: SlotRegistration) => void
  update: (id: string, patch: Partial<Omit<SlotRegistration, 'id'>>) => void
  detach: (id: string) => void
}

/** The single persistent canvas is lent to whichever slot is currently on screen. */
export const useCanvasHost = create<HostState>((set, get) => ({
  slot: null,
  readyId: null,
  setReady: (readyId) => {
    if (get().readyId !== readyId) set({ readyId })
  },
  attach: (slot) => set({ slot }),
  update: (id, patch) => {
    const cur = get().slot
    if (cur?.id === id) set({ slot: { ...cur, ...patch } })
  },
  detach: (id) => {
    if (get().slot?.id === id) set({ slot: null })
  },
}))
