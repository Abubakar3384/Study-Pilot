// Regenerates src/api/schema.gen.ts from the backend's OpenAPI schema.
import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const venv = path.resolve(here, '../../backend/.venv')
const python = [path.join(venv, 'Scripts/python.exe'), path.join(venv, 'bin/python')].find(existsSync)
if (!python) {
  console.error('Backend venv not found. Set it up first (see README.md).')
  process.exit(1)
}
const schema = execFileSync(python, [path.join(here, 'dump_openapi.py')], { encoding: 'utf8' })
const out = path.resolve(here, '../openapi.json')
writeFileSync(out, schema)
execFileSync('npx', ['-y', 'openapi-typescript@7', out, '-o', 'src/api/schema.gen.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  cwd: path.resolve(here, '..'),
})
