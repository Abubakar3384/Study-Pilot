// Summarises dist/stats.yml (VIS_TEMPLATE=list npm run analyze) by package, gzip size.
import { readFileSync } from 'node:fs'

const text = readFileSync('dist/stats.yml', 'utf8')
const chunkFilter = process.argv[2]
const agg = {}
let chunk = ''
let mod = ''
for (const line of text.split('\n')) {
  if (/^\S.*:\s*$/.test(line)) chunk = line.trim().slice(0, -1)
  else if (/^  \S.*:\s*$/.test(line)) mod = line.trim().slice(0, -1)
  else if (/^\s+gzip: \d+/.test(line)) {
    if (chunkFilter && !chunk.includes(chunkFilter)) continue
    const pkg = mod.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1] ?? '(app)'
    agg[pkg] = (agg[pkg] ?? 0) + Number(line.split(':')[1])
  }
}
for (const [pkg, size] of Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${pkg}`)
}
