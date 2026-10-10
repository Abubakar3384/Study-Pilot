// Measures load, 3D and interaction performance on the production build, using this machine's GPU.
// Starts its own backend (mock AI, throwaway DB) and `vite preview`, so run `npm run build` first.
//
//   node scripts/measure-perf.mjs            -> prints a table and writes perf-results.json
//
// Profiles: "laptop" (no throttling) and "phone-approx" (4x CPU slowdown + Fast 4G network).
// The phone profile only approximates CPU and network; it cannot emulate a phone GPU.
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const API_PORT = 8040
const WEB_PORT = 4180
const BASE = `http://localhost:${WEB_PORT}`
const API = `http://localhost:${API_PORT}/api`
const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
const FIXTURE = 'e2e/fixtures/cell-biology.pdf'

const procs = []
function start(cmd, args, env) {
  const p = spawn(process.platform === 'win32' && cmd === 'npx' ? 'npx.cmd' : cmd, args, { env: { ...process.env, ...env }, stdio: 'ignore', shell: process.platform === 'win32' && cmd === 'npx' })
  procs.push(p)
}
async function waitFor(url, ms = 60_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`timeout waiting for ${url}`)
}

async function seed() {
  const form = new FormData()
  form.append('file', new Blob([readFileSync(FIXTURE)], { type: 'application/pdf' }), 'cell-biology.pdf')
  const doc = await (await fetch(`${API}/documents`, { method: 'POST', body: form })).json()
  await fetch(`${API}/documents/${doc.id}/concepts`, { method: 'POST' })
  await fetch(`${API}/documents/${doc.id}/summary`, { method: 'POST' })
  return doc
}

async function newPage(browser, profile) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  if (profile === 'phone-approx') {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (9 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    })
  }
  return { context, page }
}

const marks = (page) =>
  page.evaluate(() => {
    const out = {}
    for (const e of performance.getEntriesByType('mark')) if (e.name.startsWith('sp:')) out[e.name] ??= Math.round(e.startTime)
    for (const e of performance.getEntriesByType('paint')) out[e.name] = Math.round(e.startTime)
    const js = performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.js'))
    out.jsTransferredKB = Math.round(js.reduce((s, r) => s + r.transferSize, 0) / 1024)
    return out
  })

async function measureLoad(browser, profile, doc) {
  const { context, page } = await newPage(browser, profile)
  await page.goto(`${BASE}/d/${doc.id}?debug=perf`, { waitUntil: 'load' })
  await page.waitForFunction(() => performance.getEntriesByName('sp:canvas-first-frame').length > 0, null, { timeout: 60_000 })
  const m = await marks(page)
  await context.close()
  return m
}

async function measureFormation(browser, profile) {
  const { context, page } = await newPage(browser, profile)
  await page.goto(`${BASE}/?debug=perf`)
  await page.waitForFunction(() => window.__sp_debug?.canvas || document.querySelector('[aria-label="Upload a PDF"]'))
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload a PDF' }).first().click()
  await (await chooser).setFiles(FIXTURE)
  // Capture slow interactions (Event Timing) while the sequence plays; started after the file dialog,
  // whose click would otherwise count the time the native dialog was open.
  await page.evaluate(() => {
    window.__events = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__events.push({ name: e.name, duration: e.duration })
    }).observe({ type: 'event', durationThreshold: 16 })
  })
  await page.waitForFunction(() => window.__sp_debug?.canvas, null, { timeout: 60_000 })
  const resolvedBefore = await page.evaluate(() => performance.getEntriesByName('sp:graph-resolved').length)
  // Interact during formation: hover and click concepts in the search.
  await page.waitForTimeout(600)
  await page.mouse.move(700, 400)
  await page.mouse.move(760, 420)
  await page.getByRole('combobox', { name: 'Search concepts' }).click().catch(() => {})
  await page.keyboard.type('mi')
  await page.waitForFunction((n) => performance.getEntriesByName('sp:graph-resolved').length > n, resolvedBefore, { timeout: 60_000 })
  await page.waitForTimeout(400)
  const frames = await page.evaluate(() => window.__sp_debug.canvas.frames())
  const info = await page.evaluate(() => window.__sp_debug.canvas.info())
  const events = await page.evaluate(() => window.__events)
  await context.close()
  return { frames, drawCalls: info.calls, triangles: info.triangles, slowestInteractionMs: Math.round(Math.max(0, ...events.map((e) => e.duration))) }
}

async function measureNavigation(browser, doc) {
  const { context, page } = await newPage(browser, 'laptop')
  await page.goto(`${BASE}/d/${doc.id}?debug=perf`)
  await page.waitForFunction(() => window.__sp_debug?.canvas)
  const heap = () => page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)
  const cdp = await context.newCDPSession(page)
  const gc = () => cdp.send('HeapProfiler.collectGarbage')
  await gc()
  const before = { heap: await heap(), gpu: await page.evaluate(() => window.__sp_debug.canvas.info()) }
  try {
    for (let i = 0; i < 20; i++) {
      await page.getByRole('link', { name: 'Notes', exact: true }).click()
      await page.getByRole('link', { name: 'Overview', exact: true }).click()
      await page.getByText('Concepts in document order').waitFor()
    }
  } catch (err) {
    await page.screenshot({ path: 'perf-navigation-failure.png' })
    console.error('navigation cycle failed at', page.url(), '|', (await page.locator('main').innerText()).slice(0, 400))
    throw err
  }
  await page.getByRole('link', { name: 'Home' }).first().click()
  await page.waitForURL((u) => u.pathname === '/')
  await page.getByRole('link', { name: 'Library' }).first().click()
  await page.waitForURL((u) => u.pathname === '/library')
  await page.goBack()
  await page.waitForURL((u) => u.pathname === '/')
  await page.goBack()
  await page.waitForURL((u) => u.pathname.startsWith('/d/'))
  await page.getByText('Concepts in document order').waitFor()
  await page.waitForFunction(() => document.querySelectorAll('canvas').length === 1)
  await gc()
  const after = { heap: await heap(), gpu: await page.evaluate(() => window.__sp_debug.canvas.info()), canvases: await page.locator('canvas').count() }
  await context.close()
  return { heapMB: [before.heap, after.heap].map((b) => +(b / 1048576).toFixed(1)), gpuBefore: before.gpu, gpuAfter: after.gpu, canvases: after.canvases }
}

try {
  start('node', ['e2e/start-backend.mjs'], { SP_E2E_API_PORT: String(API_PORT) })
  await waitFor(`${API}/health`)
  start('npx', ['vite', 'preview', '--port', String(WEB_PORT), '--strictPort'], { SP_API_TARGET: `http://localhost:${API_PORT}` })
  await waitFor(BASE)
  const doc = await seed()

  const browser = await chromium.launch({ args: GPU_ARGS })
  const gpu = await (await browser.newPage()).evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    const i = gl?.getExtension('WEBGL_debug_renderer_info')
    return i ? gl.getParameter(i.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  const results = { date: new Date().toISOString(), chromium: browser.version(), gpu, profiles: {} }
  for (const profile of ['laptop', 'phone-approx']) {
    const loads = []
    for (let i = 0; i < 3; i++) loads.push(await measureLoad(browser, profile, doc))
    const median = (k) => loads.map((l) => l[k]).sort((a, b) => a - b)[1]
    results.profiles[profile] = {
      load: Object.fromEntries(Object.keys(loads[0]).map((k) => [k, median(k)])),
      formation: await measureFormation(browser, profile),
    }
  }
  results.navigation = await measureNavigation(browser, doc)
  await browser.close()
  writeFileSync('perf-results.json', JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally {
  for (const p of procs) p.kill()
  if (process.platform === 'win32') for (const p of procs) spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' })
}
