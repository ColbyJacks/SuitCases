// Starts the face swap server (backend/server.py) on port 8001 for `npm run faceswap`.
// Uses FACESWAP_PYTHON if set, else backend/.venv, else python on PATH.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'backend')
const venv = process.platform === 'win32' ? join(dir, '.venv', 'Scripts', 'python.exe') : join(dir, '.venv', 'bin', 'python')
const custom = process.env.FACESWAP_PYTHON
// A path in FACESWAP_PYTHON is relative to where you ran npm, not to backend/.
const python = custom ? (/[\/]/.test(custom) ? resolve(process.env.INIT_CWD || process.cwd(), custom) : custom) : existsSync(venv) ? venv : 'python'

console.log(`face swap server: ${python} on http://127.0.0.1:8001`)
const child = spawn(python, ['server.py'], { cwd: dir, stdio: 'inherit', env: { ...process.env, PYTHONUNBUFFERED: '1' } })
child.on('error', (e) => {
  console.error(`Couldn't start Python (${e.message}). See backend/README.md for setup.`)
  process.exit(1)
})
child.on('exit', (code) => process.exit(code ?? 0))
