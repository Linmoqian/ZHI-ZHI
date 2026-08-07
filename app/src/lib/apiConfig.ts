// 后端 API 访问地址配置。
//
// 开发模式（npm run tauri:dev）下后端由 scripts/dev.mjs 起在 127.0.0.1:8787；
// 打包后的生产模式由 Rust 壳以 sidecar 拉起，同样固定监听 127.0.0.1:8787
// （见 src-tauri/src/lib.rs 的 ZHIZHI_PORT 注入）。
// 因此前后端地址固定一致，这里统一使用显式绝对地址，避免打包后相对路径
// 请求打到 WebView 自身（tauri://localhost）导致「无法解析的响应」。

const API_HOST = '127.0.0.1'
const API_PORT = 8787

export const API_BASE_URL = `http://${API_HOST}:${API_PORT}`
