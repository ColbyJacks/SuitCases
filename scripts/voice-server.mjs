// Starts the RVC voice server (voice-server/server.py) on port 8765 for `npm run voice`.
// Uses VOICE_PYTHON if set, else voice-server/.venv, else python on PATH.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'voice-server')
const venv = process.platform === 'win32' ? join(dir, '.venv', 'Scripts', 'python.exe') : join(dir, '.venv', 'bin', 'python')
const custom = process.env.VOICE_PYTHON
// A path in VOICE_PYTHON is relative to where you ran npm, not to voice-server/.
const python = custom ? (/[\\/]/.test(custom) ? resolve(process.env.INIT_CWD || process.cwd(), custom) : custom) : existsSync(venv) ? venv : 'python'
const port = process.env.VOICE_PORT || '8765'

console.log(`voice server: ${python} on http://127.0.0.1:${port}`)
const child = spawn(python, ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', port], { cwd: dir, stdio: 'inherit' })
child.on('error', (e) => {
  console.error(`Couldn't start Python (${e.message}). See voice-server/README.md for setup.`)
  process.exit(1)
})
child.on('exit', (code) => process.exit(code ?? 0))
