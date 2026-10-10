import { useFrame } from '@react-three/fiber'
import { Vector3, type PerspectiveCamera } from 'three'
import { POSE_STRIDE, type FrameState } from './frame'

const v = new Vector3()
const PAGE_HALF = 0.36

/**
 * Runs last each frame: projects nodes and page surfaces to CSS pixels for the DOM label layer and
 * for screen-space picking, then hands control to the label layer.
 */
export function Projector({
  frame,
  onProjected,
}: {
  frame: React.RefObject<FrameState | null>
  onProjected: () => void
}) {
  useFrame((state) => {
    const f = frame.current
    if (!f) return
    const camera = state.camera as PerspectiveCamera
    const { width, height } = state.size
    f.viewport.width = width
    f.viewport.height = height
    const focal = height / (2 * Math.tan((camera.fov * Math.PI) / 360))

    const n = f.layout.nodes.length
    for (let i = 0; i < n; i++) {
      v.set(f.nodePos[i * 3]!, f.nodePos[i * 3 + 1]!, f.nodePos[i * 3 + 2]!)
      const dist = v.distanceTo(camera.position)
      v.project(camera)
      f.screen[i * 3] = ((v.x + 1) / 2) * width
      f.screen[i * 3 + 1] = ((1 - v.y) / 2) * height
      f.screen[i * 3 + 2] = v.z
      f.pxRadius[i] = (f.layout.nodes[i]!.radius * f.nodeShown[i]! * focal) / Math.max(dist, 0.01)
    }

    const s = f.layout.pages.length
    for (let i = 0; i < s; i++) {
      const o = i * POSE_STRIDE
      v.set(f.pagePose[o]!, f.pagePose[o + 1]!, f.pagePose[o + 2]!)
      const dist = v.distanceTo(camera.position)
      v.project(camera)
      f.pageScreen[i * 3] = ((v.x + 1) / 2) * width
      f.pageScreen[i * 3 + 1] = ((1 - v.y) / 2) * height
      f.pageScreen[i * 3 + 2] = (PAGE_HALF * f.pagePose[o + 6]! * focal) / Math.max(dist, 0.01)
    }
    onProjected()
  })
  return null
}
