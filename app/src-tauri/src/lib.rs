// 桌面薄层：Tauri 窗口壳与生命周期。
//
// 角色划分（见 docs/tauri-desktop-migration.md）：
// - 本 crate 只承担桌面外围：窗口创建、标题栏、侧边进程（Node 后端）托管。
// - 业务模型 / 持久化 / 模型网关全部在 Node 后端（app/server），
//   前端经 HTTP 访问，本层不注册业务 command。

use tauri::Manager;

/// 组装并启动桌面壳。业务后端由侧边进程直接拉起，不从这里调度。
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 桌面壳不需要额外初始化；窗口外观由 tauri.conf.json 定义。
            let _window = app.get_webview_window("main");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动知枝桌面壳失败")
}
