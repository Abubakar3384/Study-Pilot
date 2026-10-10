// Gzip budgets for the production build. Run after `npm run build`.
// Initial JS = the entry chunk plus everything index.html preloads (modulepreload links).
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'

const dist = path.resolve('dist')
const assets = path.join(dist, 'assets')
if (!existsSync(assets)) {
  console.error('dist/assets not found. Run `npm run build` first.')
  process.exit(1)
}

const KB = 1024
// `formula` is KaTeX: downloaded only when a document actually contains $…$ maths.
const BUDGET = { initialJs: 160 * KB, css: 20 * KB, canvas: 240 * KB, route: 40 * KB, formula: 80 * KB }

const gz = (file) => gzipSync(readFileSync(path.join(assets, file))).length
const fmt = (n) => `${(n / KB).toFixed(1)} KB`

const html = readFileSync(path.join(dist, 'index.html'), 'utf8')
const initial = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1])
const files = readdirSync(assets)
const js = files.filter((f) => f.endsWith('.js'))
const css = files.filter((f) => f.endsWith('.css'))

const rows = []
let failed = false
const check = (name, size, budget) => {
  const ok = size <= budget
  failed ||= !ok
  rows.push([ok ? 'ok  ' : 'OVER', name, fmt(size), `≤ ${fmt(budget)}`])
}

check('initial JS (entry + preloads)', initial.reduce((s, f) => s + gz(f), 0), BUDGET.initialJs)
const initialCss = [...html.matchAll(/href="\/assets\/([^"]+\.css)"/g)].map((m) => m[1])
check('initial CSS', initialCss.reduce((s, f) => s + gz(f), 0), BUDGET.css)

// The canvas chunk is the KnowledgeCanvas entry plus the vendor chunks only it imports.
const canvasFiles = js.filter((f) => /^(KnowledgeCanvas|canvas)/i.test(f))
if (canvasFiles.length) check(`canvas chunk (${canvasFiles.join(', ')})`, canvasFiles.reduce((s, f) => s + gz(f), 0), BUDGET.canvas)

for (const f of js) {
  if (initial.includes(f) || canvasFiles.includes(f)) continue
  const budget = /^Formula/.test(f) ? BUDGET.formula : BUDGET.route
  check(`lazy: ${f}`, gz(f), budget)
}

const w = Math.max(...rows.map((r) => r[1].length))
for (const [status, name, size, budget] of rows) console.log(`${status} ${name.padEnd(w)}  ${size.padStart(9)}  ${budget}`)
if (failed) {
  console.error('\nBundle budget exceeded.')
  process.exit(1)
}
console.log('\nAll bundle budgets met.')
