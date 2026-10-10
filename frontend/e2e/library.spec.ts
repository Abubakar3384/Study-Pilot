import { expect, test } from '@playwright/test'
import { API, seedDocument } from './helpers'

test('delete a document from the library, with confirmation and cancel', async ({ page, request }) => {
  const doc = await seedDocument(request, { concepts: true })
  await page.goto('/library')
  const row = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: /Cell biology/ }) })
  await expect(row.first()).toBeVisible()
  const before = await row.count()
  expect(before).toBeGreaterThan(0)

  // Cancel keeps it.
  await row.first().getByRole('button', { name: /^Delete / }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this document?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(row).toHaveCount(before)

  // Confirm deletes it on the server and removes the row.
  await row.first().getByRole('button', { name: /^Delete / }).click()
  await dialog.getByRole('button', { name: 'Delete document' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Deleted' })).toBeVisible()
  await expect(row).toHaveCount(before - 1)
  const remaining = (await (await request.get(`${API}/documents`)).json()).items.length
  expect(remaining).toBe(before - 1)
  void doc
})

test('delete from the document page returns to the library', async ({ page, request }) => {
  const doc = await seedDocument(request)
  await page.goto(`/d/${doc.id}`)
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete document' }).click()
  await expect(page).toHaveURL(/\/library$/)
  expect((await request.get(`${API}/documents/${doc.id}`)).status()).toBe(404)
})
