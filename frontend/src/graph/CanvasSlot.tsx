import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import type { SceneInput } from '../domain/types'
import { t } from '../motion/variants'
import { useReducedMotionPref } from '../motion/useReducedMotionPref'
import { cn } from '../ui/cn'
import { toast } from '../ui/toast'
import { detectCapability } from './capability'
import { useCanvasHost, type SlotCallbacks } from './canvasHostStore'
import { ConceptMap2D } from './ConceptMap2D'
import { useGraph, type GraphStore } from './graphStore'
import { loadCanvas } from './loadCanvas'
import { useStableSceneInput } from './useStableSceneInput'

interface Props {
  input: SceneInput
  store: GraphStore
  onPageClick?: (page: number) => void
  /** Text alternative read by screen readers in place of the visual map. */
  description: string
  className?: string
}

/**
 * The knowledge-map region of a screen. Chooses 3D (borrowing the persistent canvas) or the 2D map,
 * shows the 2D map as a placeholder until the first 3D frame, and falls back to 2D on any failure.
 */
export function CanvasSlot({ input: rawInput, store, onPageClick, description, className }: Props) {
  const input = useStableSceneInput(rawInput)
  const cap = detectCapability()
  const viewMode = useGraph(store, (s) => s.viewMode)
  const reducedMotion = useReducedMotionPref()
  const [failed, setFailed] = useState(false)
  const use3d = cap.tier !== 'none' && viewMode === '3d' && !failed
  const el = useRef<HTMLDivElement>(null)
  const id = useId()
  const attach = useCanvasHost((s) => s.attach)
  const update = useCanvasHost((s) => s.update)
  const detach = useCanvasHost((s) => s.detach)
  const ready = useCanvasHost((s) => s.readyId === id)

  const pageClick = useRef(onPageClick)
  useEffect(() => {
    pageClick.current = onPageClick
  }, [onPageClick])

  const callbacks = useMemo<SlotCallbacks>(
    () => ({
      onPageClick: (page) => pageClick.current?.(page),
      onPerformanceFallback: () =>
        toast.info('The 3D map is running slowly on this device.', {
          label: 'Use 2D map',
          onClick: () => store.getState().setViewMode('2d'),
        }),
      onFailure: (reason) => {
        setFailed(true)
        toast.error(
          reason === 'load'
            ? 'The 3D map could not be loaded, so the 2D map is shown instead.'
            : 'The 3D view stopped responding, so the 2D map is shown instead.',
        )
      },
    }),
    [store],
  )

  useEffect(() => {
    if (use3d) void loadCanvas().catch(() => {})
  }, [use3d])

  // Attach once per slot; later prop changes are patched in without re-attaching.
  useLayoutEffect(() => {
    if (!use3d || !el.current || cap.tier === 'none') return
    attach({ id, el: el.current, input, store, tier: cap.tier, reducedMotion, callbacks })
    return () => detach(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [use3d, id, store, attach, detach])

  useLayoutEffect(() => {
    if (use3d) update(id, { input, reducedMotion, callbacks })
  }, [use3d, id, input, reducedMotion, callbacks, update])

  return (
    <div className={cn('stage-dark relative overflow-hidden bg-ink', className)}>
      <p className="sr-only">{description}</p>
      {use3d ? (
        <>
          <div ref={el} className="absolute inset-0" />
          <AnimatePresence initial={false}>
            {!ready && (
              <m.div key="placeholder" className="pointer-events-none absolute inset-0" exit={{ opacity: 0, transition: t.base }}>
                <ConceptMap2D input={input} store={store} interactive={false} muted />
              </m.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        <ConceptMap2D input={input} store={store} onPageClick={onPageClick} />
      )}
    </div>
  )
}
