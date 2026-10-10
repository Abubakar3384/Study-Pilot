import type { ReactNode } from 'react'
import { useIsPresent } from 'motion/react'

/**
 * While a view animates out it is still in the DOM; make it unreachable (inert, aria-hidden) so
 * keyboard focus, shortcuts and screen readers only ever see the incoming view.
 */
export function ExitInert({ children }: { children: ReactNode }) {
  const present = useIsPresent()
  return (
    <div inert={!present} aria-hidden={!present || undefined} className="contents">
      {children}
    </div>
  )
}
