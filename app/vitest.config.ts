import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 前端测试配置：jsdom 环境，仅覆盖 src/ 下的组件与工具，
// 排除 server/ 目录（后端测试由 node:test 负责，见 server:test 脚本）。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/', 'server/', 'dist/'],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
