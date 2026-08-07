// 桌面薄层入口：只负责启动 Tauri，不承载业务逻辑。
// 业务数据事实来源是 Node HTTP 后端（app/server），经由 HTTP 访问。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    zhizhi_lib::run()
}
