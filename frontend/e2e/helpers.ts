import { readFileSync } from 'node:fs'
import type { APIRequestContext, Page } from '@playwright/test'

export const FIXTURE = 'e2e/fixtures/cell-biology.pdf'
export const API = 'http://localhost:8010/api'

/** Headless Chromium only has software WebGL; these flags enable it for the 3D-path tests. */
export const SOFTWARE_WEBGL = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist']

export interface Doc {
  id: string
  page_count: number
}

/** Upload the fixture through the API (fast setup for tests that aren't about uploading). */
export async function seedDocument(request: APIRequestContext, opts: { concepts?: boolean; summary?: boolean } = {}): Promise<Doc> {
  const res = await request.post(`${API}/documents`, {
    multipart: { file: { name: 'cell-biology.pdf', mimeType: 'application/pdf', buffer: readFileSync(FIXTURE) } },
  })
  if (!res.ok()) throw new Error(`seed upload failed: ${res.status()}`)
  const doc = (await res.json()) as Doc
  if (opts.concepts) await request.post(`${API}/documents/${doc.id}/concepts`)
  if (opts.summary) await request.post(`${API}/documents/${doc.id}/summary`)
  return doc
}

/** Records every request for the lazy 3D chunk, to assert when it is (not) downloaded. */
export function recordCanvasChunk(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (r) => {
    if (/\/assets\/KnowledgeCanvas-[^/]+\.js$/.test(r.url())) urls.push(r.url())
  })
  return urls
}

interface CanvasInfo {
  geometries: number
  textures: number
  programs: number
  calls: number
  triangles: number
}

export async function canvasDebug(page: Page): Promise<CanvasInfo | null> {
  return page.evaluate(() => {
    const dbg = (window as unknown as { __sp_debug?: { canvas?: { info: () => CanvasInfo } } }).__sp_debug
    return dbg?.canvas?.info() ?? null
  })
}
