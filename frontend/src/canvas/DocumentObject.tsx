import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, MeshBasicMaterial, type Mesh } from 'three'
import { C } from './palette'
import type { FrameState } from './frame'
import { acquirePageTexture, releasePageTexture } from './resources'

/** The uploaded document: rises into view, then fades as its pages leave it. */
export function DocumentObject({ frame }: { frame: React.RefObject<FrameState | null> }) {
  const ref = useRef<Mesh>(null)
  const { geometry, material } = useMemo(() => {
    const material = new MeshBasicMaterial({ color: C.slab, transparent: true, opacity: 0 })
    return { geometry: new BoxGeometry(0.74, 0.95, 0.12), material }
  }, [])

  useEffect(() => {
    material.map = acquirePageTexture()
    material.needsUpdate = true
    return () => {
      releasePageTexture()
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useFrame(() => {
    const mesh = ref.current
    const f = frame.current
    if (!mesh || !f) return
    const { slabIn, slabOut } = f.snap
    const opacity = slabIn * (1 - slabOut)
    mesh.visible = opacity > 0.001
    if (!mesh.visible) return
    const inv = 1 - slabIn
    mesh.position.set(0, 0.05 - inv * 1.6, 1.4 + inv * 1.0)
    mesh.rotation.set(-0.44 * inv, 0, 0)
    mesh.scale.setScalar(1.25 * (1 - slabOut * 0.06))
    material.opacity = opacity
  })

  return <mesh ref={ref} geometry={geometry} material={material} visible={false} dispose={null} />
}
