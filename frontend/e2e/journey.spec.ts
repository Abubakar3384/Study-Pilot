import { expect, test } from '@playwright/test'
import { FIXTURE } from './helpers'

/**
 * The main student journey on the production build: upload → real processing steps → concept map →
 * concept selection and sources → notes (edit + autosave) → quiz → results → review → flashcards → ask.
 * Headless Chromium has no GPU, so this runs the 2D map path; the 3D path is covered in canvas.spec.ts.
 */
test('upload a PDF and study it end to end', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible()

  // Upload with the hidden input behind the Upload button.
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload a PDF' }).first().click()
  await (await chooser).setFiles(FIXTURE)

  const steps = page.getByRole('list').filter({ hasText: 'Read pages' })
  await expect(steps.getByText('8 pages read')).toBeVisible()
  await expect(page.getByText('Ready', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: /Open document/ }).click()

  // Overview: map, accessible concept list, summary with page refs.
  await expect(page.getByRole('heading', { level: 1, name: 'Cell biology' })).toBeVisible()
  await expect(page.getByText('Concepts in document order')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible()

  // "/" focuses concept search; choosing a result selects it and syncs the URL.
  await page.keyboard.press('/')
  await expect(page.getByRole('combobox', { name: 'Search concepts' })).toBeFocused()
  await page.keyboard.type('mito')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/concept=mitochondria/)
  const panel = page.getByRole('region', { name: 'Selected concept' })
  await expect(panel.getByRole('heading', { name: 'Mitochondria' })).toBeVisible()

  // Source drawer opens at the cited page; Esc closes it and returns focus.
  await panel.getByRole('button', { name: /Open source page/ }).first().click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText(/Mitochondria carry out aerobic respiration/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()

  // Notes: generate, edit, autosave.
  await page.getByRole('link', { name: 'Notes', exact: true }).click()
  await page.getByRole('button', { name: 'Generate notes' }).click()
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: 'Point 1 of section 1' }).fill('All living things are made of cells.')
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('All living things are made of cells.')).toBeVisible()
  await expect(page.getByText('Edited by you')).toBeVisible()

  // Quiz: keyboard answering with per-question feedback, then results.
  await page.getByRole('link', { name: 'Quiz', exact: true }).click()
  await page.getByRole('button', { name: 'Start quiz' }).click()
  for (let i = 1; i <= 5; i++) {
    await expect(page.getByText(`Question ${i} of 5`)).toBeVisible()
    await page.getByRole('radiogroup', { name: 'Answer options' }).getByRole('radio').nth(i % 4).click()
    await page.getByRole('button', { name: 'Check answer' }).click()
    await expect(page.getByRole('status').filter({ hasText: /^(Correct|Not quite)/ })).toBeVisible()
    await page.getByRole('button', { name: i === 5 ? 'See results' : 'Next question' }).click()
  }
  await expect(page).toHaveURL(/\/attempts\//)
  await expect(page.getByText(/\d\/5/).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'By concept' })).toBeVisible()

  // Review aggregates the attempt.
  await page.getByRole('link', { name: 'Review', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What to revise next' })).toBeVisible()

  // Flashcards: generate, flip with Space, rate with a key.
  await page.getByRole('link', { name: 'Flashcards', exact: true }).click()
  await page.getByRole('button', { name: 'Generate 10 cards' }).click()
  await expect(page.getByText('Card 1 of 10')).toBeVisible()
  await page.keyboard.press(' ')
  await expect(page.getByRole('button', { name: /Known/ })).toBeVisible()
  await page.keyboard.press('2')
  await expect(page.getByText('Card 2 of 10')).toBeVisible()

  // Ask: grounded answer with a citation.
  await page.getByRole('link', { name: 'Ask', exact: true }).click()
  await page.getByRole('textbox', { name: 'Your question' }).fill('What do mitochondria produce?')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Sources')).toBeVisible()
  await expect(page).toHaveURL(/\/ask\/[a-f0-9]+/)

  // Dashboard now reflects real activity.
  await page.getByRole('link', { name: 'Home' }).first().click()
  await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Study overview' }).getByText(/Asked: What do mitochondria produce/).first()).toBeVisible()
})

test('rejects a non-PDF before uploading', async ({ page }) => {
  await page.goto('/')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload a PDF' }).first().click()
  await (await chooser).setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(page.getByRole('alert').filter({ hasText: 'is not a PDF' }).first()).toBeVisible()
})
