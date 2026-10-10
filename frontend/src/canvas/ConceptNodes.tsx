import { memo, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending, CanvasTexture, Color, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4,
  MeshBasicMaterial, NormalBlending, PlaneGeometry, Vector3,
} from 'three'
import { C, paletteTheme } from './palette'
import { damp, type FrameState } from './frame'

const target = new Color()
const base = new Color()
const m4 = new Matrix4()
const pos = new Vector3()
const scl = new Vector3()

/** Soft radial falloff, drawn once: the halo sprite behind every node (no bloom pass needed). */
function haloTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new CanvasTexture(c)
}

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

  // Halos: camera-facing quads with additive blending, one more instanced draw call.
  const halo = useMemo(() => {
    const geo = new PlaneGeometry(1, 1)
    const mat = new MeshBasicMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false })
    const h = new InstancedMesh(geo, mat, Math.max(1, count))
    h.count = count
    h.instanceMatrix.array.fill(0)
    h.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3)
    h.frustumCulled = false
    h.renderOrder = 1
    return h
  }, [count])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  useEffect(() => () => mesh.dispose(), [mesh])
  useEffect(
    () => () => {
      halo.geometry.dispose()
      ;(halo.material as MeshBasicMaterial).map?.dispose()
      ;(halo.material as MeshBasicMaterial).dispose()
      halo.dispose()
    },
    [halo],
  )

  useFrame((state, dt) => {
    const f = frame.current
    if (!f || !mesh.instanceColor) return
    const { layout, nodePos, nodeShown, snap, selected, hovered, neighbor } = f
    const m = mesh.instanceMatrix.array
    const cols = mesh.instanceColor.array as Float32Array
    const hasSelection = selected >= 0
    const hcols = halo.instanceColor!.array as Float32Array
    const light = paletteTheme() === 'light'
    const haloMat = halo.material as MeshBasicMaterial
    const blending = light ? NormalBlending : AdditiveBlending
    if (haloMat.blending !== blending) {
      haloMat.blending = blending
      haloMat.opacity = light ? 0.55 : 1
      haloMat.needsUpdate = true
    }
    // The selected node breathes gently (frames are requested only while something is selected).
    const pulse = hasSelection ? 1 + 0.1 * Math.sin(state.clock.elapsedTime * 2.4) : 1
    let moving = hasSelection

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
      else if (hasSelection && !neighbor[i]) target.copy(base).lerp(C.ink, isHover ? 0.35 : 0.8)
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

      // Halo follows the node's current colour; brightness acts as opacity under additive blending.
      const glow = isSel ? 0.85 : isHover ? 0.6 : hasSelection && !neighbor[i] ? 0.06 : node.importance === 3 ? 0.42 : 0.22
      const hs = node.radius * nodeShown[i]! * em * (isSel ? 6.5 * pulse : 5)
      pos.set(nodePos[i * 3]!, nodePos[i * 3 + 1]!, nodePos[i * 3 + 2]!)
      halo.setMatrixAt(i, m4.compose(pos, state.camera.quaternion, scl.setScalar(hs)))
      if (light) {
        // On a light stage a glow can't add light, so tint softly from the background towards the node.
        const k = Math.min(1, glow * 1.4)
        hcols[o3] = C.ink.r + (cols[o3]! - C.ink.r) * k
        hcols[o3 + 1] = C.ink.g + (cols[o3 + 1]! - C.ink.g) * k
        hcols[o3 + 2] = C.ink.b + (cols[o3 + 2]! - C.ink.b) * k
      } else {
        hcols[o3] = cols[o3]! * glow
        hcols[o3 + 1] = cols[o3 + 1]! * glow
        hcols[o3 + 2] = cols[o3 + 2]! * glow
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor.needsUpdate = true
    halo.instanceMatrix.needsUpdate = true
    halo.instanceColor!.needsUpdate = true
    if (moving) state.invalidate()
  })

  return (
    <>
      <primitive object={halo} dispose={null} />
      <primitive object={mesh} dispose={null} />
    </>
  )
})
