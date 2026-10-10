import { Suspense } from 'react'
import { useLocation, useOutlet } from 'react-router'
import { AnimatePresence, m } from 'motion/react'
import { NavRail, MobileTabBar } from './Navigation'
import { Toaster } from '../ui/toast'
import { CanvasHost } from '../graph/CanvasHost'
import { UploadBridge } from './UploadBridge'
import { ExitInert } from '../motion/ExitInert'
import { fadeRise } from '../motion/variants'

/** Top-level views animate between each other; tabs inside a document keep their layout mounted. */
function sectionKey(pathname: string) {
  const parts = pathname.split('/')
  return parts[1] === 'd' ? `/d/${parts[2]}` : pathname
}

function AnimatedOutlet() {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.div key={sectionKey(pathname)} variants={fadeRise} initial="initial" animate="animate" exit="exit" className="min-h-full">
        <ExitInert>{outlet}</ExitInert>
      </m.div>
    </AnimatePresence>
  )
}

export function AppShell() {
  return (
    <div className="flex min-h-dvh bg-ink">
      <a
        href="#main"
        className="fixed top-2 left-2 z-[60] -translate-y-16 rounded-sm bg-signal px-3 py-2 font-medium text-ink focus:translate-y-0"
      >
        Skip to content
      </a>
      <NavRail />
      <main id="main" tabIndex={-1} className="relative min-w-0 flex-1 pb-16 outline-none md:pb-0">
        <Suspense fallback={null}>
          <AnimatedOutlet />
        </Suspense>
      </main>
      <MobileTabBar />
      <CanvasHost />
      <UploadBridge />
      <Toaster />
    </div>
  )
}

/** Static shell shown before the first route chunk arrives (no data, no router hooks). */
export function ShellFallback() {
  return (
    <div className="flex min-h-dvh bg-ink">
      <div aria-hidden className="hidden h-dvh w-[72px] shrink-0 border-r border-line bg-surface-1 md:block" />
      <main className="min-w-0 flex-1" aria-busy="true" />
    </div>
  )
}
