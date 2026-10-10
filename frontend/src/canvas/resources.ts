import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three'
import type { SceneTheme } from './palette'

/**
 * Shared, reference-counted GPU resources. Page textures are drawn procedurally (no download), one per
 * theme: a greyscale sheet tinted per state in dark, a white sheet with soft lines in light.
 */

const textures: Partial<Record<SceneTheme, CanvasTexture>> = {}
let refs = 0

const STYLE = {
  dark: { base: 'rgb(118,118,118)', border: 'rgb(225,225,225)', header: 'rgb(230,230,230)', lines: 'rgb(180,180,180)' },
  light: { base: 'rgb(255,255,255)', border: 'rgb(203,212,226)', header: 'rgb(150,166,196)', lines: 'rgb(214,222,235)' },
} as const

function drawPage(theme: SceneTheme): HTMLCanvasElement {
  const s = STYLE[theme]
  const w = 128
  const h = 164
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = s.base
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = s.border
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, w - 2, h - 2)
  ctx.fillStyle = s.header
  ctx.fillRect(14, 16, 62, 7)
  ctx.fillStyle = s.lines
  const lengths = [96, 88, 100, 70, 0, 94, 100, 82, 98, 60, 0, 90, 76]
  lengths.forEach((len, i) => {
    if (len) ctx.fillRect(14, 36 + i * 9, len, 2.5)
  })
  return c
}

export function getPageTexture(theme: SceneTheme): CanvasTexture {
  let t = textures[theme]
  if (!t) {
    t = new CanvasTexture(drawPage(theme))
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 4
    t.minFilter = LinearMipmapLinearFilter
    textures[theme] = t
  }
  return t
}

export function acquirePageTextures(): void {
  refs++
}

export function releasePageTextures(): void {
  refs = Math.max(0, refs - 1)
  if (refs > 0) return
  for (const key of Object.keys(textures) as SceneTheme[]) {
    textures[key]!.dispose()
    delete textures[key]
  }
}
