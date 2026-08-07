// 准备 Node sidecar 二进制：把当前运行中的 node 复制到
// src-tauri/binaries/node-<target-triple>，供 Tauri externalBin 打包。
//
// 本地与 CI 共用：CI 各平台 runner 自带 node，复制并重命名即可，
// 无需额外下载运行时。Tauri 会按 target 找到对应后缀的二进制。
//
// 注意：node 是自包含单文件可执行程序（含原生 prebuild），可独立分发；
// better-sqlite3 的原生模块已随 bundle 打包（含各平台 prebuild），不再依赖 node 自身。

import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptDir, '..')
const binDir = resolve(appRoot, 'src-tauri', 'binaries')

/** Rust target triple 与 platform/arch 的映射（仅覆盖 CI 用到的桌面 target）。 */
const TRIPLE_MAP = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
} 

const key = `${process.platform}-${process.arch}`
const target = TRIPLE_MAP[key]
if (!target) {
  throw new Error(`不支持的构建平台/架构：${key}。支持的桌面 target：${Object.keys(TRIPLE_MAP).join(', ')}`)
}

// current node 可执行文件（Windows 为 node.exe，其余为 node）。
const source = process.execPath
const ext = process.platform === 'win32' ? '.exe' : ''
const dest = resolve(binDir, `node-${target}${ext}`)

if (!existsSync(binDir)) {
  mkdirSync(binDir, { recursive: true })
}

if (process.platform === 'darwin') {
  // macOS .app 内的 node 与源码一致；直接复制。
  copyFileSync(source, dest)
} else {
  copyFileSync(source, dest)
}

// Unix 下保持可执行位；Windows 复制自带可执行位属性。
try {
  if (process.platform !== 'win32') {
    const { chmodSync } = await import('node:fs')
    chmodSync(dest, 0o755)
  }
} catch {
  // 某些平台 chmod 可能失败，忽略（构建期失败会由后续 tauri build 暴露）。
}

console.log(`[prepare-node-sidecar] ${source} -> ${dest}`)
