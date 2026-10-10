import { expect, test } from '@playwright/test'
import { seedDocument } from './helpers'

test('generation errors are shown with a working retry, and nothing pretends to finish', async ({ page, request }) => {
  const fresh = await seedDocument(request)
  let fail = true
  await page.route(`**/api/documents/${fresh.id}/concepts`, async (route) => {
    if (route.request().method() === 'POST' && fail) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'ai_unavailable', message: 'down' } }),
      })
    }
    return route.continue()
  })
  await page.goto(`/d/${fresh.id}`)
  await page.getByRole('button', { name: 'Build concept map' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'not responding' })).toBeVisible()
  await expect(page.getByText('Concepts in document order')).toHaveCount(0)
  fail = false
  await page.getByRole('alert').getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText('Concepts in document order')).toBeVisible()
})
