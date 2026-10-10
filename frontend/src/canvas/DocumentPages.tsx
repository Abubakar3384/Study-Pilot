import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color, DoubleSide, Euler, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion,
  Vector3,
} from 'three'
import { scene } from '../design/tokens'
import { C } from './palette'
import { damp, POSE_STRIDE, type FrameState } from './frame'
import { acquirePageTexture, releasePageTexture } from './resources'

const m4 = new Matrix4()
const q = new Quaternion()
const e = new Euler()
const p = new Vector3()
const s = new Vector3()
const target = new Color()
const cur = new Color()

/**
 * One instanced draw for every page surface. Pose interpolation (slab → fan → source strip) happens in
 * the Scene orchestrator; this component turns poses into matrices and state into colours.
 */
export function DocumentPages({ frame, count }: { frame: React.RefObject<FrameState | null>; count: number }) {
  const geometry = useMemo(() => new PlaneGeometry(0.56, 0.72), [])
  const material = useMemo(() => new MeshBasicMaterial({ side: DoubleSide }), [])
  // Built up front with zero-scale matrices so no default (identity) page renders on the first frame.
  const mesh = useMemo(() => {
    const m = new InstancedMesh(geometry, material, count)
    m.instanceMatrix.array.fill(0)
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) C.pageFan.toArray(colors, i * 3)
    m.instanceColor = new InstancedBufferAttribute(colors, 3)
    m.frustumCulled = false
    return m
  }, [geometry, material, count])

  useEffect(() => {
    material.map = acquirePageTexture()
    material.needsUpdate = true
    return () => {
      releasePageTexture()
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useEffect(() => () => mesh.dispose(), [mesh])

  useFrame((state, dt) => {
    const f = frame.current
    if (!f || !mesh.instanceColor) return
    const { snap, pagePose, citedSurface, hoveredSurface } = f
    const scanPos = ((performance.now() % scene.scanPeriod) / scene.scanPeriod) * 1.4 - 0.2
    let moving = false
    for (let i = 0; i < count; i++) {
      const o = i * POSE_STRIDE
      const started = snap.pages[i]! > 0 || snap.recede > 0
      const lift = hoveredSurface === i ? 1 : citedSurface[i] ? 0.5 : 0
      const scale = started ? pagePose[o + 6]! * (1 + 0.1 * lift) : 0
      p.set(pagePose[o]!, pagePose[o + 1]! + 0.14 * lift * snap.recede, pagePose[o + 2]! + 0.1 * lift * snap.recede)
      q.setFromEuler(e.set(pagePose[o + 3]!, pagePose[o + 4]!, pagePose[o + 5]!))
      s.setScalar(scale)
      mesh.setMatrixAt(i, m4.compose(p, q, s))

      target.copy(C.pageFan).lerp(C.pageStrip, snap.recede)
      if (snap.scanning) {
        const u = count > 1 ? i / (count - 1) : 0.5
        const d = u - scanPos
        target.lerp(C.pageScan, Math.exp(-(d * d) / 0.006) * 0.55)
      }
      if (citedSurface[i]) target.copy(C.amber).lerp(C.pageStrip, 0.25)
      else if (hoveredSurface === i) target.copy(C.pageHover)

      cur.fromArray(mesh.instanceColor.array, i * 3)
      const dr = target.r - cur.r
      const dg = target.g - cur.g
      const db = target.b - cur.b
      if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) > 0.002) {
        cur.setRGB(damp(cur.r, target.r, 12, dt), damp(cur.g, target.g, 12, dt), damp(cur.b, target.b, 12, dt))
        moving = true
      } else cur.copy(target)
      cur.toArray(mesh.instanceColor.array, i * 3)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor.needsUpdate = true
    if (moving) state.invalidate()
  })

  return <primitive object={mesh} dispose={null} />
}
