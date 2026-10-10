import type { ReactNode } from 'react'
import { LazyMotion, MotionConfig } from 'motion/react'
import { duration, ease } from '../design/tokens'

// domMax (animations + layout/layoutId) loads in its own chunk right after first paint.
// Until then `m` components render their final state without animating, which is safe.
const loadFeatures = () => import('./features').then((mod) => mod.default)

/**
 * Single animation entry point. `LazyMotion` + `m` keeps Motion out of the critical path;
 * `reducedMotion="user"` turns transform animations into instant changes when the OS asks for it.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: duration.base, ease: ease.standard }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}
