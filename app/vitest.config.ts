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
  // root 保持 app/，使 vite 能正常解析 node_modules（react 等装在 app/node_modules）。
  // 测试文件用相对仓库根的 glob 引入，并放宽 fs 访问范围。
  root: configDir,
  resolve: {
    alias: {
      // 测试文件位于仓库根 tests/，vite 从该目录向上找不到 app/node_modules；
      // 显式别名把 testing-library 指回 app/node_modules。
      '@testing-library/react': resolve(
        configDir,
        'node_modules/@testing-library/react',
      ),
      '@testing-library/user-event': resolve(
        configDir,
        'node_modules/@testing-library/user-event',
      ),
      react: resolve(configDir, 'node_modules/react'),
      'react-dom': resolve(configDir, 'node_modules/react-dom'),
      motion: resolve(configDir, 'node_modules/motion'),
      // 桌面壳 IPC 包同样位于 app/node_modules，测试侧需要解析到同一文件，
      // 否则 vi.mock 的注册路径与真实模块不一致，mock 不会生效。
      '@tauri-apps/api/window': resolve(
        configDir,
        'node_modules/@tauri-apps/api/window.js',
      ),
    },
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
    deps: {
      // 让 vite 在 interop 裸依赖时也查找 app/node_modules。
      moduleDirectories: ['node_modules', resolve(configDir, 'node_modules')],
    },
  },
  test: {
    environment: 'jsdom',
    include: ['../tests/frontend/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
    setupFiles: ['src/test/setup.ts'],
  },
})
