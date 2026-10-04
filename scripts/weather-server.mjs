import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const windows = process.platform === 'win32'
const child = spawn(windows ? 'mvnw.cmd' : './mvnw', ['spring-boot:run'], {
  cwd: fileURLToPath(new URL('../backend/', import.meta.url)),
  stdio: 'inherit',
  shell: windows,
})
child.on('error', error => {
  console.error(`Could not start the weather backend: ${error.message}. Install JDK 21 and check JAVA_HOME.`)
  process.exitCode = 1
})
child.on('exit', code => { process.exitCode = code ?? 0 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
