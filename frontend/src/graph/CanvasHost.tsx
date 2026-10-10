import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasHost, type SlotRegistration } from './canvasHostStore'
import { loadCanvas } from './loadCanvas'

const KnowledgeCanvas = lazy(loadCanvas)

/** Idle time after which a parked canvas is torn down to free GPU memory. */
const PARK_TTL_MS = 60_000

class CanvasBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * Owns the app's single WebGL canvas. It renders into a detached container that is moved into
 * whichever <CanvasSlot> is on screen, so going Overview → Notes → Overview (or Dashboard →
 * Overview) keeps the scene, its GPU resources and its "already formed" state. While no slot is
 * mounted the canvas stops rendering; after PARK_TTL_MS (or immediately on low-tier devices) it is
 * unmounted and every GPU resource is released.
 */
export function CanvasHost() {
  const slot = useCanvasHost((s) => s.slot)
  const container = useMemo(() => {
    const el = document.createElement('div')
    el.className = 'absolute inset-0'
    return el
  }, [])
  const [parked, setParked] = useState<SlotRegistration | null>(null)
  const [mounted, setMounted] = useState(false)
  const ready = useRef(false)
  const loadFailed = useRef(false)
  const current = useRef<SlotRegistration | null>(null)

  // Remember the last slot's props so a parked canvas keeps its scene (derived during render).
  if (slot && slot !== parked) setParked(slot)
  if (slot && !mounted) setMounted(true)

  useLayoutEffect(() => {
    current.current = slot
    if (slot) {
      if (container.parentElement !== slot.el) slot.el.appendChild(container)
    } else {
      container.remove()
    }
  }, [slot, container])

  // Moving into a new slot with an already-rendered scene: it is ready immediately.
  // If the 3D chunk already failed to load, tell the new slot straight away so it shows the 2D map.
  // A canvas that already rendered is immediately ready for whichever slot it moves into.
  // If the 3D chunk already failed to load, tell the new slot straight away so it shows the 2D map.
  const slotId = slot?.id
  useEffect(() => {
    if (!slotId) return
    if (loadFailed.current) current.current?.callbacks.onFailure('load')
    useCanvasHost.getState().setReady(ready.current ? slotId : null)
  }, [slotId])

  useEffect(() => {
    if (slot || !mounted) return
    const ttl = parked?.tier === 'low' ? 0 : PARK_TTL_MS
    const id = window.setTimeout(() => {
      ready.current = false
      useCanvasHost.getState().setReady(null)
      setMounted(false)
    }, ttl)
    return () => window.clearTimeout(id)
  }, [slot, mounted, parked])

  const onReady = useCallback(() => {
    ready.current = true
    useCanvasHost.getState().setReady(current.current?.id ?? null)
  }, [])
  const onPageClick = useCallback((page: number) => current.current?.callbacks.onPageClick?.(page), [])
  const onPerformanceFallback = useCallback(() => current.current?.callbacks.onPerformanceFallback(), [])
  // A lost WebGL context is not recovered in place: tear the canvas down so a later visit starts fresh.
  const onContextLost = useCallback(() => {
    ready.current = false
    useCanvasHost.getState().setReady(null)
    current.current?.callbacks.onFailure('context')
    setMounted(false)
  }, [])
  const onRenderError = useCallback(() => {
    ready.current = false
    loadFailed.current = true
    current.current?.callbacks.onFailure('load')
  }, [])

  const props = slot ?? parked
  if (!mounted || !props) return null

  return createPortal(
    <CanvasBoundary onError={onRenderError}>
      <Suspense fallback={null}>
        <KnowledgeCanvas
          input={props.input}
          store={props.store}
          tier={props.tier}
          reducedMotion={props.reducedMotion}
          active={!!slot}
          onReady={onReady}
          onPageClick={onPageClick}
          onPerformanceFallback={onPerformanceFallback}
          onContextLost={onContextLost}
        />
      </Suspense>
    </CanvasBoundary>,
    container,
  )
}
