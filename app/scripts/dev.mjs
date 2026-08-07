import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const serverEntry = resolve(scriptDir, '../server/src/index.ts')
const viteEntry = resolve(scriptDir, '../node_modules/vite/bin/vite.js')

// 默认启用持久化：会话（回合树）与供应商配置都落盘，重启可恢复。
// 用户显式传入 ZHIZHI_DATA_DIR 时覆盖默认值。
const defaultDataDir = resolve(scriptDir, '../../.zhizhi-data')
if (!process.env.ZHIZHI_DATA_DIR) {
  if (!existsSync(defaultDataDir)) {
    mkdirSync(defaultDataDir, { recursive: true })
  }
  process.env.ZHIZHI_DATA_DIR = defaultDataDir
}

const viteArguments = process.argv.slice(2)
const children = [
  spawn(process.execPath, ['--watch', serverEntry], {
    stdio: 'inherit',
    env: process.env,
  }),
  spawn(process.execPath, [viteEntry, ...viteArguments], {
    stdio: 'inherit',
    env: process.env,
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
