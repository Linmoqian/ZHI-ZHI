import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const serverEntry = fileURLToPath(
  new URL('../server/src/index.ts', import.meta.url),
)
const viteEntry = fileURLToPath(
  new URL('../node_modules/vite/bin/vite.js', import.meta.url),
)
const viteArguments = process.argv.slice(2)
const children = [
  spawn(process.execPath, ['--watch', serverEntry], {
    stdio: 'inherit',
  }),
  spawn(process.execPath, [viteEntry, ...viteArguments], {
    stdio: 'inherit',
  }),
]
let stopping = false

function stop(signal = 'SIGTERM') {
  if (stopping) {
    return
  }
  stopping = true
  children.forEach((child) => {
    if (!child.killed) {
      child.kill(signal)
    }
  })
}

children.forEach((child) => {
  child.on('exit', (code, signal) => {
    if (!stopping) {
      process.exitCode = code ?? (signal ? 1 : 0)
      stop()
    }
  })
})

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))
