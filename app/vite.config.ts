import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 避免前端刷新覆盖 Rust 编译错误输出（hot-reload.md）。
  clearScreen: false,
  server: {
    // 绑定 127.0.0.1（IPv4）：tauri devUrl 与 Vite 开发地址保持一致，
    // 避免 localhost 解析到 ::1 导致 Tauri 无法就绪。
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
