import type { ComponentType } from 'react'
import { Link, NavLink, useLocation, useSearchParams } from 'react-router'
import { m } from 'motion/react'
import { Home, Library, Star, Upload } from 'lucide-react'
import { LogoMark } from './Logo'
import { prefetchRoute, type RouteModuleName } from './routes'
import { t } from '../motion/variants'
import { cn } from '../ui/cn'
import { useUpload } from '../features/upload/uploadStore'

interface Item {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  module: RouteModuleName
  isActive: (path: string, starred: boolean) => boolean
}

const ITEMS: Item[] = [
  { to: '/', label: 'Home', icon: Home, module: 'dashboard', isActive: (p) => p === '/' },
  { to: '/library', label: 'Library', icon: Library, module: 'library', isActive: (p, s) => p === '/library' && !s },
  { to: '/library?filter=starred', label: 'Starred', icon: Star, module: 'library', isActive: (p, s) => p === '/library' && s },
]

function useActive() {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const starred = params.get('filter') === 'starred'
  return (item: Item) => item.isActive(pathname, starred)
}

/** Desktop/tablet: a 72px rail with labelled icons. */
export function NavRail() {
  const isActive = useActive()
  const pickFile = useUpload((s) => s.pickFile)
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-30 hidden h-dvh w-[72px] shrink-0 flex-col items-center border-r border-line bg-surface-1 py-3 md:flex"
    >
      <Link to="/" aria-label="StudyPilot home" className="mb-4 flex size-11 items-center justify-center rounded-sm text-text">
        <LogoMark />
      </Link>
      <button
        type="button"
        onClick={pickFile}
        className="mb-3 flex size-11 flex-col items-center justify-center rounded-sm bg-signal text-ink transition-colors hover:bg-[#82cfe3]"
        aria-label="Upload a PDF"
        title="Upload a PDF"
      >
        <Upload className="size-[18px]" />
      </button>
      <ul className="flex flex-col gap-1">
        {ITEMS.map((item) => {
          const active = isActive(item)
          return (
            <li key={item.label}>
              <NavLink
                to={item.to}
                aria-current={active ? 'page' : undefined}
                onMouseEnter={() => prefetchRoute(item.module)}
                onFocus={() => prefetchRoute(item.module)}
                className={cn(
                  'relative flex h-14 w-[60px] flex-col items-center justify-center gap-1 rounded-sm text-[11px] font-medium transition-colors',
                  active ? 'text-text' : 'text-text-3 hover:text-text-2',
                )}
              >
                {active && (
                  <m.span layoutId="rail-active" transition={t.base} className="absolute inset-0 rounded-sm bg-surface-2" />
                )}
                {active && (
                  <m.span layoutId="rail-tick" transition={t.base} className="absolute top-3 bottom-3 left-[-6px] w-[2px] bg-signal" />
                )}
                <item.icon className="relative size-[18px]" />
                <span className="relative">{item.label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Phones: a bottom tab bar with the same destinations plus Upload in the middle. */
export function MobileTabBar() {
  const isActive = useActive()
  const pickFile = useUpload((s) => s.pickFile)
  const [home, library, starred] = ITEMS as [Item, Item, Item]
  const tab = (item: Item) => {
    const active = isActive(item)
    return (
      <NavLink
        key={item.label}
        to={item.to}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
          active ? 'text-text' : 'text-text-3',
        )}
      >
        <item.icon className={cn('size-5', active && 'text-signal')} />
        {item.label}
      </NavLink>
    )
  }
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface-1 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tab(home)}
      {tab(library)}
      <button type="button" onClick={pickFile} className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-signal">
        <Upload className="size-5" />
        Upload
      </button>
      {tab(starred)}
    </nav>
  )
}
