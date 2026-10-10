import { expect, test } from '@playwright/test'
import { recordCanvasChunk, seedDocument, type Doc } from './helpers'

test.use({ launchOptions: { args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] } })

let doc: Doc
test.beforeAll(async ({ request }) => {
  doc = await seedDocument(request, { concepts: true })
})

test('shows the 2D map, keeps every interaction, and never fetches the 3D chunk', async ({ page }) => {
  const chunk = recordCanvasChunk(page)
  await page.goto(`/d/${doc.id}`)
  await expect(page.locator('svg circle').first()).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Map view' })).toHaveCount(0)
  await page.getByRole('list', { name: 'Concepts' }).getByRole('button', { name: /Mitochondria/ }).click()
  await expect(page.getByRole('region', { name: 'Selected concept' }).getByRole('heading', { name: 'Mitochondria' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(chunk).toEqual([])
})
