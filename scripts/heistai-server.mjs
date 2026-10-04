// Starts the HeistAI voice server (heistai-server/server.py) on port 8766 for `npm run heistai`.
// Uses HEISTAI_PYTHON if set, else heistai-server/.venv, else python on PATH.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'heistai-server')
const venv = process.platform === 'win32' ? join(dir, '.venv', 'Scripts', 'python.exe') : join(dir, '.venv', 'bin', 'python')
const custom = process.env.HEISTAI_PYTHON
// A path in HEISTAI_PYTHON is relative to where you ran npm, not to heistai-server/.
const python = custom ? (/[\\/]/.test(custom) ? resolve(process.env.INIT_CWD || process.cwd(), custom) : custom) : existsSync(venv) ? venv : 'python'
const port = process.env.HEISTAI_PORT || '8766'

console.log(`heistai server: ${python} on http://127.0.0.1:${port}`)
const child = spawn(python, ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', port], {
  cwd: dir,
  stdio: 'inherit',
  env: { ...process.env, PYTHONUNBUFFERED: '1' }, // show the pipeline's timing logs as they happen
})
child.on('error', (e) => {
  console.error(`Couldn't start Python (${e.message}). See heistai-server/README.md for setup.`)
  process.exit(1)
})
child.on('exit', (code) => process.exit(code ?? 0))
