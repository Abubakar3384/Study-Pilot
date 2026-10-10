import { expect, test } from '@playwright/test'
import { canvasDebug, recordCanvasChunk, seedDocument, SOFTWARE_WEBGL, type Doc } from './helpers'

// Software WebGL for the whole file, so these checks exercise a device that *would* use 3D:
// "never downloads the chunk" must hold even when the 3D tier is available.
test.use({ launchOptions: { args: SOFTWARE_WEBGL } })

let doc: Doc
test.beforeAll(async ({ request }) => {
  doc = await seedDocument(request, { concepts: true, summary: true })
})

test.describe('loading strategy', () => {
  for (const tab of ['notes', 'quiz', 'cards', 'ask']) {
    test(`/${tab} never downloads the 3D chunk`, async ({ page }) => {
      const chunk = recordCanvasChunk(page)
      await page.goto(`/d/${doc.id}/${tab}?canvas=3d`)
      await expect(page.getByRole('navigation', { name: 'Study tools' })).toBeVisible()
      await page.waitForLoadState('networkidle')
      expect(chunk).toEqual([])
    })
  }

  test('navigation and upload are usable before the 3D chunk arrives', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    await page.route(/KnowledgeCanvas-.*\.js$/, async (route) => {
      await gate
      await route.continue()
    })
    await page.goto(`/d/${doc.id}?canvas=3d`)
    // Shell, tabs, upload and the concept list all work while the chunk is held back.
    await expect(page.getByRole('button', { name: 'Upload a PDF' }).first()).toBeEnabled()
    await expect(page.getByText('Concepts in document order')).toBeVisible()
    await page.getByRole('link', { name: 'Notes', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'No notes yet' })).toBeVisible()
    release()
  })
})

test.describe('3D canvas (software WebGL)', () => {
  // ?debug=perf exposes renderer stats (window.__sp_debug) in production builds.

  test('renders once, survives tab switches without rebuilding, and leaks nothing', async ({ page }) => {
    await page.goto(`/d/${doc.id}?canvas=3d&debug=perf`)
    await expect.poll(() => canvasDebug(page), { timeout: 20_000 }).not.toBeNull()
    await expect(page.locator('canvas')).toHaveCount(1)
    const before = await canvasDebug(page)

    for (let i = 0; i < 8; i++) {
      await page.getByRole('link', { name: 'Notes', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'No notes yet' })).toBeVisible()
      await page.getByRole('link', { name: 'Overview', exact: true }).click()
      await expect(page.getByText('Concepts in document order')).toBeVisible()
    }
    await expect(page.locator('canvas')).toHaveCount(1)
    const after = await canvasDebug(page)
    expect(after!.geometries).toBe(before!.geometries)
    expect(after!.textures).toBe(before!.textures)
    expect(after!.programs).toBe(before!.programs)
    // The whole scene stays within a handful of draw calls.
    expect(after!.calls).toBeLessThanOrEqual(10)
  })

  test('selecting a concept in the list highlights it in the scene and the URL', async ({ page }) => {
    await page.goto(`/d/${doc.id}?canvas=3d&debug=perf`)
    await expect.poll(() => canvasDebug(page), { timeout: 20_000 }).not.toBeNull()
    await page.getByRole('list', { name: 'Concepts' }).getByRole('button', { name: /Mitochondria/ }).click()
    await expect(page).toHaveURL(/concept=mitochondria/)
    await expect(page.locator('.kc-label[data-state="selected"]')).toHaveCount(1)
  })

  test('falls back to the 2D map if the 3D chunk fails to load', async ({ page }) => {
    await page.route(/KnowledgeCanvas-.*\.js$/, (route) => route.abort())
    await page.goto(`/d/${doc.id}?canvas=3d&debug=perf`)
    await expect(page.getByRole('alert').filter({ hasText: '3D map could not be loaded' })).toBeVisible()
    await expect(page.locator('svg circle').first()).toBeVisible()
    await expect(page.getByText('Concepts in document order')).toBeVisible()
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('defaults to the 2D map, with 3D still available and instant', async ({ page }) => {
    await page.goto(`/d/${doc.id}?canvas=3d&debug=perf`)
    const view = page.getByRole('radiogroup', { name: 'Map view' })
    await expect(view.getByRole('radio', { name: '2D' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('svg circle').first()).toBeVisible()
    await view.getByRole('radio', { name: '3D' }).click()
    await expect.poll(() => canvasDebug(page), { timeout: 20_000 }).not.toBeNull()
    await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0)
  })
})

