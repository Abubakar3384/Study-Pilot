// Starts the real backend (mock AI provider) on a throwaway database for the e2e run.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const backend = path.resolve(here, '../../backend')
const venv = path.join(backend, '.venv')
const python = [path.join(venv, 'Scripts/python.exe'), path.join(venv, 'bin/python')].find(existsSync)
if (!python) {
  console.error('Backend venv not found; set it up first (see README.md).')
  process.exit(1)
}
const port = process.env.SP_E2E_API_PORT ?? '8010'
// One folder per port, so parallel instances never touch each other's database.
const data = path.join(here, '.tmp', `e2e-backend-${port}`)
rmSync(data, { recursive: true, force: true })
mkdirSync(data, { recursive: true })

const child = spawn(python, ['-m', 'uvicorn', 'app.main:get_app', '--factory', '--port', port], {
  cwd: backend,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: `sqlite:///${path.join(data, 'e2e.db').split(path.sep).join('/')}`,
    UPLOAD_DIR: path.join(data, 'uploads'),
    AI_PROVIDER: 'mock',
    MOCK_MODE: 'ok',
    AI_RETRY_BACKOFF_SECONDS: '0',
    CORS_ORIGINS: 'http://localhost:4173',
  },
})
const stop = () => child.kill()
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
child.on('exit', (code) => process.exit(code ?? 0))
