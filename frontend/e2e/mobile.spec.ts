import { expect, test } from '@playwright/test'
import { seedDocument } from './helpers'

test('phone layout: bottom navigation, stacked map and list, no horizontal scroll', async ({ page, request }) => {
  const doc = await seedDocument(request, { concepts: true })
  for (const path of ['/', `/d/${doc.id}`, `/d/${doc.id}/quiz`, '/library']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0)
  }
  await page.goto(`/d/${doc.id}`)
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.filter({ hasText: 'Upload' }).last()).toBeVisible()
  await expect(page.getByText('Concepts in document order')).toBeVisible()
  // Touch targets in the bottom bar are at least 44px tall.
  const box = await page.getByRole('link', { name: 'Library' }).last().boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
})
