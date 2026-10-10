import { memo, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, type InterleavedBufferAttribute } from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { C } from './palette'
import { damp, type FrameState } from './frame'

const target = new Color()

/**
 * All connections in one fixed-pixel-width line draw (readable at any DPR), plus a second, thicker
 * layer holding only the selected concept's connections. Buffers are allocated once per graph and
 * updated in place; edges "draw on" by lerping their far endpoint.
 */
export const ConnectionLines = memo(function ConnectionLines({
  frame,
  edgeCount,
}: {
  frame: React.RefObject<FrameState | null>
  edgeCount: number
}) {
  const parts = useMemo(() => {
    const cap = Math.max(1, edgeCount)
    const positions = new Float32Array(cap * 6)
    const colors = new Float32Array(cap * 6)
    for (let i = 0; i < cap * 2; i++) C.edge.toArray(colors, i * 3)
    const geometry = new LineSegmentsGeometry()
    geometry.setPositions(positions)
    geometry.setColors(colors)
    geometry.instanceCount = edgeCount
    const material = new LineMaterial({ linewidth: 1.25, vertexColors: true, worldUnits: false })
    const line = new LineSegments2(geometry, material)
    line.frustumCulled = false

    const hiPositions = new Float32Array(cap * 6)
    const hiGeometry = new LineSegmentsGeometry()
    hiGeometry.setPositions(hiPositions)
    hiGeometry.instanceCount = 0
    const hiMaterial = new LineMaterial({ linewidth: 2.25, color: C.signal, worldUnits: false })
    const hiLine = new LineSegments2(hiGeometry, hiMaterial)
    hiLine.frustumCulled = false
    hiLine.renderOrder = 1

    return {
      line, hiLine, geometry, hiGeometry, material, hiMaterial, positions, colors, hiPositions,
      posBuf: (geometry.attributes.instanceStart as InterleavedBufferAttribute).data,
      colBuf: (geometry.attributes.instanceColorStart as InterleavedBufferAttribute).data,
      hiBuf: (hiGeometry.attributes.instanceStart as InterleavedBufferAttribute).data,
    }
  }, [edgeCount])

  useEffect(
    () => () => {
      parts.geometry.dispose()
      parts.hiGeometry.dispose()
      parts.material.dispose()
      parts.hiMaterial.dispose()
    },
    [parts],
  )

  useFrame((state, dt) => {
    const f = frame.current
    if (!f) return
    const { layout, nodePos, snap, selected, hovered } = f
    const { positions, colors, hiPositions } = parts
    parts.material.resolution.set(state.size.width, state.size.height)
    parts.hiMaterial.resolution.set(state.size.width, state.size.height)
    parts.hiMaterial.color.copy(C.signal)

    let hi = 0
    let moving = false
    for (let k = 0; k < edgeCount; k++) {
      const [a, b] = layout.edges[k]!
      const t = snap.edges[k]!
      const o = k * 6
      const ax = nodePos[a * 3]!
      const ay = nodePos[a * 3 + 1]!
      const az = nodePos[a * 3 + 2]!
      positions[o] = ax
      positions[o + 1] = ay
      positions[o + 2] = az
      positions[o + 3] = ax + (nodePos[b * 3]! - ax) * t
      positions[o + 4] = ay + (nodePos[b * 3 + 1]! - ay) * t
      positions[o + 5] = az + (nodePos[b * 3 + 2]! - az) * t

      const incidentSel = selected >= 0 && (a === selected || b === selected)
      const incidentHover = hovered >= 0 && (a === hovered || b === hovered)
      if (t <= 0) target.copy(C.ink)
      else if (incidentSel) target.copy(C.signal)
      else if (selected >= 0) target.copy(C.edgeDim)
      else if (incidentHover) target.copy(C.edgeHover)
      else target.copy(C.edge)

      // Both vertices of a segment share a colour; ease them together.
      const r = colors[o]!
      const g = colors[o + 1]!
      const bl = colors[o + 2]!
      let nr = target.r
      let ng = target.g
      let nb = target.b
      if (t > 0 && Math.abs(target.r - r) + Math.abs(target.g - g) + Math.abs(target.b - bl) > 0.002) {
        nr = damp(r, target.r, 12, dt)
        ng = damp(g, target.g, 12, dt)
        nb = damp(bl, target.b, 12, dt)
        moving = true
      }
      colors[o] = colors[o + 3] = nr
      colors[o + 1] = colors[o + 4] = ng
      colors[o + 2] = colors[o + 5] = nb

      if (incidentSel && t > 0) {
        hiPositions.set(positions.subarray(o, o + 6), hi * 6)
        hi++
      }
    }
    parts.hiGeometry.instanceCount = hi
    parts.posBuf.needsUpdate = true
    parts.colBuf.needsUpdate = true
    parts.hiBuf.needsUpdate = true
    if (moving) state.invalidate()
  })

  return (
    <>
      <primitive object={parts.line} dispose={null} />
      <primitive object={parts.hiLine} dispose={null} />
    </>
  )
})
