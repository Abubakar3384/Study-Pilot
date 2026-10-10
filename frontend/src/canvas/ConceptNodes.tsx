import { memo, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial } from 'three'
import { C } from './palette'
import { damp, type FrameState } from './frame'

const target = new Color()
const base = new Color()

/**
 * Every concept in a single instanced draw call. Selection and hover never re-render this component:
 * they are read from FrameState each frame and eased into per-instance scale and colour.
 */
export const ConceptNodes = memo(function ConceptNodes({
  frame,
  count,
  version,
}: {
  frame: React.RefObject<FrameState | null>
  count: number
  version: string
}) {
  // Low-poly sphere + unlit material: reads as a flat graphic disc from any angle.
  const geometry = useMemo(() => new IcosahedronGeometry(1, 2), [])
  const material = useMemo(() => new MeshBasicMaterial(), [])
  const emphasis = useMemo(() => new Float32Array(count).fill(1), [count])
  // Built up front: three initialises instances to identity (a unit sphere at the origin), so every
  // matrix starts at scale 0 and the colour buffer exists before the first frame renders.
  const mesh = useMemo(() => {
    const m = new InstancedMesh(geometry, material, Math.max(1, count))
    m.count = count
    m.instanceMatrix.array.fill(0)
    const colors = new Float32Array(Math.max(1, count) * 3)
    for (let i = 0; i < count; i++) C.text.toArray(colors, i * 3)
    m.instanceColor = new InstancedBufferAttribute(colors, 3)
    m.frustumCulled = false
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, material, count, version])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  useEffect(() => () => mesh.dispose(), [mesh])

  useFrame((state, dt) => {
    const f = frame.current
    if (!f || !mesh.instanceColor) return
    const { layout, nodePos, nodeShown, snap, selected, hovered, neighbor } = f
    const m = mesh.instanceMatrix.array
    const cols = mesh.instanceColor.array as Float32Array
    const hasSelection = selected >= 0
    let moving = false

    for (let i = 0; i < count; i++) {
      const node = layout.nodes[i]!
      const isSel = i === selected
      const isHover = i === hovered
      const targetEmphasis = isSel ? 1.4 : isHover ? 1.22 : 1
      const em = damp(emphasis[i]!, targetEmphasis, 14, dt)
      if (Math.abs(em - targetEmphasis) > 0.001) moving = true
      emphasis[i] = em
      const sc = node.radius * nodeShown[i]! * em
      const o = i * 16
      m[o] = sc
      m[o + 1] = 0
      m[o + 2] = 0
      m[o + 3] = 0
      m[o + 4] = 0
      m[o + 5] = sc
      m[o + 6] = 0
      m[o + 7] = 0
      m[o + 8] = 0
      m[o + 9] = 0
      m[o + 10] = sc
      m[o + 11] = 0
      m[o + 12] = nodePos[i * 3]!
      m[o + 13] = nodePos[i * 3 + 1]!
      m[o + 14] = nodePos[i * 3 + 2]!
      m[o + 15] = 1

      if (node.importance === 3) base.copy(C.text).lerp(C.amber, snap.resolve)
      else base.copy(node.importance === 2 ? C.node2 : C.node1)
      if (isSel) target.copy(C.signal)
      else if (hasSelection && !neighbor[i]) target.copy(base).lerp(C.ink, isHover ? 0.35 : 0.72)
      else if (isHover) target.copy(base).lerp(C.signal, 0.45)
      else target.copy(base)

      const o3 = i * 3
      const dr = target.r - cols[o3]!
      const dg = target.g - cols[o3 + 1]!
      const db = target.b - cols[o3 + 2]!
      if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) > 0.002) {
        cols[o3] = damp(cols[o3]!, target.r, 12, dt)
        cols[o3 + 1] = damp(cols[o3 + 1]!, target.g, 12, dt)
        cols[o3 + 2] = damp(cols[o3 + 2]!, target.b, 12, dt)
        moving = true
      } else {
        cols[o3] = target.r
        cols[o3 + 1] = target.g
        cols[o3 + 2] = target.b
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor.needsUpdate = true
    if (moving) state.invalidate()
  })

  return <primitive object={mesh} dispose={null} />
})
