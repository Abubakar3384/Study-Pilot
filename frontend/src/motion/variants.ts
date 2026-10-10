import type { Transition, Variants } from 'motion/react'
import { duration, ease } from '../design/tokens'

export const t = {
  micro: { duration: duration.micro, ease: ease.standard },
  fast: { duration: duration.fast, ease: ease.standard },
  base: { duration: duration.base, ease: ease.standard },
  enter: { duration: duration.base, ease: ease.enter },
  panel: { duration: duration.panel, ease: ease.enter },
  exit: { duration: duration.micro, ease: ease.exit },
} satisfies Record<string, Transition>

/** Route/tab content: rises 6px on enter, leaves fast so the next view never waits. */
export const fadeRise: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: t.enter },
  exit: { opacity: 0, transition: t.exit },
}

export const crossfade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: t.fast },
  exit: { opacity: 0, transition: t.exit },
}

/** Side panels slide 24px from their edge. */
export const panelFromRight: Variants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: t.panel },
  exit: { opacity: 0, x: 16, transition: { duration: duration.fast, ease: ease.exit } },
}

export const press = { scale: 0.98 }
