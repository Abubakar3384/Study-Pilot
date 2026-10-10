import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three'

/**
 * Shared, reference-counted GPU resources. The page texture is drawn procedurally (no download)
 * and shared by the document slab and every page surface.
 */

let pageTexture: CanvasTexture | null = null
let refs = 0

function drawPage(): HTMLCanvasElement {
  const w = 128
  const h = 164
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  // Greyscale on purpose: the material colour tints it per state.
  ctx.fillStyle = 'rgb(118,118,118)'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgb(225,225,225)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, w - 2, h - 2)
  ctx.fillStyle = 'rgb(230,230,230)'
  ctx.fillRect(14, 16, 62, 7)
  ctx.fillStyle = 'rgb(180,180,180)'
  const lengths = [96, 88, 100, 70, 0, 94, 100, 82, 98, 60, 0, 90, 76]
  lengths.forEach((len, i) => {
    if (len) ctx.fillRect(14, 36 + i * 9, len, 2.5)
  })
  return c
}

export function acquirePageTexture(): CanvasTexture {
  refs++
  if (!pageTexture) {
    pageTexture = new CanvasTexture(drawPage())
    pageTexture.colorSpace = SRGBColorSpace
    pageTexture.anisotropy = 4
    pageTexture.minFilter = LinearMipmapLinearFilter
  }
  return pageTexture
}

export function releasePageTexture(): void {
  refs = Math.max(0, refs - 1)
  if (refs === 0 && pageTexture) {
    pageTexture.dispose()
    pageTexture = null
  }
}
