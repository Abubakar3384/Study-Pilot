import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Vector3, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { ease } from '../design/tokens'
import type { GraphStore } from '../graph/graphStore'
import { WORLD } from '../graph/layout'
import { cubicBezier } from '../motion/easing'
import type { FrameState } from './frame'

const easeStd = cubicBezier(...ease.standard)
const HOME_TARGET = new Vector3(0, -0.45, 0)
const ELEVATION = 0.14

/** Distance at which the whole composition (graph + source strip) fits the viewport. */
function homeDistance(aspect: number, fovDeg: number) {
  const tanH = Math.tan((fovDeg * Math.PI) / 360)
  const halfW = WORLD.width / 2 + 0.6
  const halfH = 2.9
  // On portrait screens let the sides overflow a little rather than shrinking everything.
  const k = aspect < 1 ? 0.72 : 1
  return Math.max(halfH / tanH, (halfW * k) / (tanH * aspect)) + 0.6
}

interface Tween {
  fromPos: Vector3
  toPos: Vector3
  fromTarget: Vector3
  toTarget: Vector3
  start: number
  dur: number
}

/**
 * Constrained orbit (no pan, limited angles) so the graph can't be lost. The camera only moves by
 * itself on Reset or to bring an off-screen search result into view; selecting a node never moves it.
 */
export function CameraRig({
  frame,
  store,
  reducedMotion,
}: {
  frame: React.RefObject<FrameState | null>
  store: GraphStore
  reducedMotion: boolean
}) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const controls = useRef<OrbitControlsImpl>(null)
  const userMoved = useRef(false)
  const home = useRef({ dist: 12, pos: new Vector3() })
  const tween = useRef<Tween | null>(null)

  const homePosition = (dist: number) => new Vector3(0, HOME_TARGET.y + dist * ELEVATION, dist)

  const startTween = (toPos: Vector3, toTarget: Vector3) => {
    const c = controls.current
    if (!c) return
    if (reducedMotion) {
      camera.position.copy(toPos)
      c.target.copy(toTarget)
      c.update()
      invalidate()
      return
    }
    tween.current = {
      fromPos: camera.position.clone(),
      toPos,
      fromTarget: c.target.clone(),
      toTarget: toTarget.clone(),
      start: performance.now(),
      dur: 750,
    }
    invalidate()
  }

  // Fit on mount and whenever the viewport changes (unless the user has taken over the camera).
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height)
    const dist = homeDistance(aspect, camera.fov)
    home.current = { dist, pos: homePosition(dist) }
    const c = controls.current
    if (c) {
      c.minDistance = dist * 0.5
      c.maxDistance = dist * 1.25
    }
    camera.far = dist + 30
    camera.updateProjectionMatrix()
    if (!userMoved.current && c) {
      camera.position.copy(home.current.pos)
      c.target.copy(HOME_TARGET)
      c.update()
    }
    invalidate()
  }, [size.width, size.height, camera, invalidate])

  // Vertical swipes scroll the page on touch screens; horizontal swipes and pinches go to the graph.
  useEffect(() => {
    gl.domElement.style.touchAction = 'pan-y'
    const c = controls.current
    if (!c) return
    const onStart = () => {
      userMoved.current = true
      tween.current = null
    }
    c.addEventListener('start', onStart)
    return () => c.removeEventListener('start', onStart)
  }, [gl])

  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.resetSignal !== prev.resetSignal) {
          userMoved.current = false
          startTween(home.current.pos.clone(), HOME_TARGET)
        }
        if (s.focus && s.focus !== prev.focus) {
          // Fly part-way towards the chosen concept: closer, but the rest of the map stays in view.
          const f = frame.current
          const idx = f?.layout.byId.get(s.focus.id)
          // On tall portrait screens the whole map barely fits, so keep the overview instead of flying.
          const portrait = f ? f.viewport.width < f.viewport.height : false
          if (f && idx !== undefined && !portrait) {
            const node = f.layout.nodes[idx]!
            const toTarget = new Vector3(node.x * 0.55, (HOME_TARGET.y + node.y) / 2, node.z * 0.3)
            const dist = home.current.dist * 0.8
            userMoved.current = true
            startTween(toTarget.clone().add(new Vector3(0, dist * ELEVATION, dist)), toTarget)
          }
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store],
  )

  useFrame(() => {
    const c = controls.current
    const tw = tween.current
    if (c && tw) {
      const p = Math.min(1, (performance.now() - tw.start) / tw.dur)
      const k = easeStd(p)
      camera.position.lerpVectors(tw.fromPos, tw.toPos, k)
      c.target.lerpVectors(tw.fromTarget, tw.toTarget, k)
      c.update()
      if (p >= 1) tween.current = null
      else invalidate()
    }
    const f = frame.current
    if (f && c) f.zoom = camera.position.distanceTo(c.target) / home.current.dist
  }, -1.5)

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping={!reducedMotion}
      dampingFactor={0.08}
      rotateSpeed={0.5}
      zoomSpeed={0.6}
      minAzimuthAngle={-0.6}
      maxAzimuthAngle={0.6}
      minPolarAngle={Math.PI / 2 - 0.5}
      maxPolarAngle={Math.PI / 2 + 0.12}
      target={HOME_TARGET}
    />
  )
}
