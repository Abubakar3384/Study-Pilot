import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshBasicMaterial, RingGeometry, type Mesh } from 'three'
import { C } from './palette'
import { damp, type FrameState } from './frame'

/** A single reusable ring that marks the selected concept and always faces the camera. */
export function ActiveConcept({ frame }: { frame: React.RefObject<FrameState | null> }) {
  const ref = useRef<Mesh>(null)
  const geometry = useMemo(() => new RingGeometry(1.5, 1.68, 48), [])
  const material = useMemo(() => new MeshBasicMaterial({ color: C.signal, transparent: true, opacity: 0, depthWrite: false }), [])
  const anim = useRef({ shown: 0, grow: 0, last: -1 })

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame((state, dt) => {
    const mesh = ref.current
    const f = frame.current
    if (!mesh || !f) return
    const a = anim.current
    const sel = f.selected
    if (sel !== a.last) {
      if (sel >= 0) a.grow = 0.7
      a.last = sel
    }
    const visibleTarget = sel >= 0 ? f.nodeShown[sel]! : 0
    a.shown = damp(a.shown, visibleTarget, 14, dt)
    a.grow = damp(a.grow, 1, 12, dt)
    const moving = Math.abs(a.shown - visibleTarget) > 0.002 || 1 - a.grow > 0.002
    mesh.visible = a.shown > 0.01 && sel >= 0
    if (mesh.visible) {
      const node = f.layout.nodes[sel]!
      mesh.position.set(f.nodePos[sel * 3]!, f.nodePos[sel * 3 + 1]!, f.nodePos[sel * 3 + 2]!)
      mesh.quaternion.copy(state.camera.quaternion)
      mesh.scale.setScalar(node.radius * 1.4 * a.grow)
      material.opacity = a.shown
      material.color.copy(C.signal)
    }
    if (moving) state.invalidate()
  })

  return <mesh ref={ref} geometry={geometry} material={material} visible={false} renderOrder={2} dispose={null} />
}
