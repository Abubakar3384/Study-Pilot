import { Component, useInsertionEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot, extend, type ReconcilerRoot, type RenderProps } from '@react-three/fiber'
import { Color, Fog, InstancedMesh, Mesh } from 'three'
import { useElementSize } from '../graph/useElementSize'

// R3F's <Canvas> registers the entire THREE namespace (`extend(THREE)`), which defeats tree-shaking
// and ships every three.js class. We register only the elements this scene declares in JSX
// (<primitive> needs no registration); everything else is constructed directly and tree-shakes.
extend({ Mesh, InstancedMesh, Color, Fog })

/** Canvases being torn down on purpose; R3F forces a context loss on unmount that isn't a failure. */
const disposing = new WeakSet<HTMLCanvasElement>()
export const isDisposing = (canvas: HTMLCanvasElement) => disposing.has(canvas)

type Props = Pick<RenderProps<HTMLCanvasElement>, 'gl' | 'dpr' | 'frameloop' | 'camera' | 'onCreated'> & {
  children: ReactNode
}

class RootBoundary extends Component<{ onError: (e: unknown) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * Minimal replacement for R3F's <Canvas> built on its public createRoot API. Errors inside the
 * scene are re-thrown into the DOM tree so the host's error boundary can fall back to the 2D map.
 */
export function ThreeCanvas({ children, gl, dpr, frameloop, camera, onCreated }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const root = useRef<ReconcilerRoot<HTMLCanvasElement> | null>(null)
  const { width, height } = useElementSize(container)
  const [error, setError] = useState<unknown>(null)
  const [, rerender] = useState(0)
  if (error) throw error

  // Insertion-effect cleanup runs only on real removal (not StrictMode replay), as in R3F's Canvas.
  useInsertionEffect(
    () => () => {
      if (canvas.current) disposing.add(canvas.current)
      root.current?.unmount()
      root.current = null
    },
    [],
  )

  useLayoutEffect(() => {
    const el = canvas.current
    if (!el || width <= 0 || height <= 0) return
    root.current ??= createRoot(el)
    const r = root.current
    r.configure({ gl, dpr, frameloop, camera, onCreated, size: { width, height, top: 0, left: 0 } }).catch(setError)
    if (r.ready.status === 'fulfilled') {
      r.render(<RootBoundary onError={setError}>{children}</RootBoundary>)
    } else if (r.ready.status === 'pending') {
      r.ready.then(() => rerender((n) => n + 1), setError)
    }
    // `children` is a new element every render, so this re-renders the R3F root whenever we render.
  }, [width, height, gl, dpr, frameloop, camera, onCreated, children])

  return (
    <div ref={container} className="h-full w-full">
      <canvas ref={canvas} className="block" />
    </div>
  )
}
