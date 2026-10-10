import { prefersReducedMotion } from '../motion/useReducedMotionPref'
import { readViewModePref, type ViewMode } from './graphStore'

/**
 * Decides how much 3D a device gets, before any 3D code is downloaded.
 *   none → 2D map only (no WebGL, software renderer)
 *   low  → DPR 1, no antialiasing, fewer page surfaces, shorter sequence
 *   high → full experience
 */
export type CanvasTier = 'none' | 'low' | 'high'

export interface Capability {
  tier: CanvasTier
  reducedMotion: boolean
  reasons: string[]
}

let cached: Capability | null = null

interface NavigatorHints {
  deviceMemory?: number
  connection?: { saveData?: boolean }
}

export function detectCapability(): Capability {
  if (cached) return cached
  const reasons: string[] = []
  const reducedMotion = prefersReducedMotion()
  let tier: CanvasTier = 'high'

  const forced = new URLSearchParams(window.location.search).get('canvas')
  if (forced === 'off') {
    cached = { tier: 'none', reducedMotion, reasons: ['disabled by ?canvas=off'] }
    return cached
  }

  const gl = probeWebGL()
  if (!gl.ok) {
    tier = 'none'
    reasons.push('WebGL2 unavailable')
  } else if (gl.software && forced !== '3d') {
    // `?canvas=3d` lets automated tests exercise the 3D path on software renderers.
    tier = 'none'
    reasons.push(`software renderer (${gl.renderer})`)
  } else {
    const nav = navigator as Navigator & NavigatorHints
    if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) reasons.push(`deviceMemory ${nav.deviceMemory} GB`)
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) reasons.push(`${navigator.hardwareConcurrency} CPU cores`)
    if (nav.connection?.saveData) reasons.push('Save-Data enabled')
    if (reasons.length) tier = 'low'
  }
  if (forced === 'low' && tier === 'high') tier = 'low'
  cached = { tier, reducedMotion, reasons }
  return cached
}

function probeWebGL(): { ok: boolean; software: boolean; renderer: string } {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
    if (!gl) return { ok: false, software: false, renderer: '' }
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return { ok: true, software: /swiftshader|llvmpipe|software|basic render/i.test(renderer), renderer }
  } catch {
    return { ok: false, software: false, renderer: '' }
  }
}

/** Default view: the user's saved choice, else 2D for reduced motion or no-WebGL, else 3D. */
export function defaultViewMode(cap: Capability = detectCapability()): ViewMode {
  if (cap.tier === 'none') return '2d'
  return readViewModePref() ?? (cap.reducedMotion ? '2d' : '3d')
}
