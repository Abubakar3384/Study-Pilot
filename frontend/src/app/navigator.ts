/** Navigation for code outside React components (stores, background jobs). Bound by the app shell. */
let navigateFn: ((to: string) => void) | null = null

export function bindNavigator(fn: ((to: string) => void) | null) {
  navigateFn = fn
}

export function appNavigate(to: string) {
  if (navigateFn) navigateFn(to)
  else window.location.assign(to)
}
