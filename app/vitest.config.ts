import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 前端测试配置：jsdom 环境，覆盖 tests/frontend/ 下的组件与工具测试。
// 后端测试由 node:test 负责（见 server:test 脚本），位于 tests/server/。
//
// 测试与源码分属不同目录（仓库根的 tests/ 与 app/），vitest 默认 root 为
// 配置文件所在目录（app/），无法解析其外的测试文件，故显式将 root 设为
// 仓库根目录，并放行文件系统访问范围。
const configDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(configDir, '..')

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // 允许 vite/vitest 访问仓库根之外（含 app/ 与 tests/）的文件。
      allow: [repoRoot],
    },
  },
  test: {
    root: repoRoot,
    environment: 'jsdom',
    include: ['tests/frontend/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
    setupFiles: ['app/src/test/setup.ts'],
  },
})
