// 桌面薄层：Tauri 窗口壳与生命周期。
//
// 角色划分（见 docs/tauri-desktop-migration.md）：
// - 本 crate 只承担桌面外围：窗口创建、标题栏、侧边进程（Node 后端）托管。
// - 业务模型 / 持久化 / 模型网关全部在 Node 后端（app/server），
//   前端经 HTTP 访问，本层不注册业务 command。
//
// 生产构建（release）下，本层会以 Tauri sidecar 拉起打包进来的 Node 后端
// （见 scripts/build-server.mjs + tauri.conf.json 的 externalBin/resources），
// 并注入数据目录，使安装包开箱即用。开发模式（debug）仍由 dev.mjs 拉起后端，
// 本层完全不管后端，避免进程冲突。

use tauri::Manager;

#[cfg(not(debug_assertions))]
mod backend {
    use std::path::PathBuf;
    use tauri::{Emitter, Manager};
    use tauri_plugin_shell::process::CommandEvent;
    use tauri_plugin_shell::ShellExt;

    /// sidecar 程序名（externalBin 里的名字，不带平台后缀，Tauri 按 target 解析）。
    const NODE_SIDECAR: &str = "node";
    /// 后端入口相对资源目录的路径（resources 打包 server → 资源/server/server.js）。
    const SERVER_ENTRY_REL: &str = "server/server.js";

    /// 生产模式：以 sidecar 方式拉起 Node 后端。
    /// 仅 release 构建触发；debug(dev) 下后端由 dev.mjs 管理。
    pub(super) fn spawn(app: &tauri::AppHandle) {
        let resource_dir = match app.path().resource_dir() {
            Ok(dir) => dir,
            Err(err) => {
                eprintln!("[知枝] 无法解析资源目录，后端未启动：{err}");
                return;
            }
        };

        let server_entry = resource_dir.join(SERVER_ENTRY_REL);
        if !server_entry.exists() {
            eprintln!("[知枝] 未找到后端入口 {server_entry:?}，请确认构建包含 dist/server");
            return;
        }

        // 数据目录：优先用户显式 ZHIZHI_DATA_DIR，否则用各平台 app_data_dir，
        // 避免服务把数据写到工作目录导致数据库漂移。
        let data_dir = std::env::var("ZHIZHI_DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                app.path()
                    .app_data_dir()
                    .unwrap_or_else(|_| PathBuf::from("."))
            });

        // 服务目录作为 sidecar 工作目录，使 better-sqlite3 等相对解析稳定。
        let server_dir = resource_dir.join("server");

        let sidecar = match app.shell().sidecar(NODE_SIDECAR) {
            Ok(cmd) => cmd,
            Err(err) => {
                eprintln!("[知枝] 无法创建后端 sidecar：{err}");
                return;
            }
        };

        let (mut rx, _child) = match sidecar
            .arg("server.js")
            .current_dir(server_dir)
            .env("ZHIZHI_DATA_DIR", data_dir.to_string_lossy().to_string())
            .env("ZHIZHI_HOST", "127.0.0.1")
            .env("ZHIZHI_PORT", "8787")
            .spawn()
        {
            Ok(pair) => pair,
            Err(err) => {
                eprintln!("[知枝] 无法启动后端 sidecar：{err}");
                return;
            }
        };

        // 转发后端日志便于定位问题；进程异常退出时给出可感知提示（不静默失败）。
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        println!("[后端] {}", String::from_utf8_lossy(&line));
                    }
                    CommandEvent::Stderr(line) => {
                        eprintln!("[后端] {}", String::from_utf8_lossy(&line));
                    }
                    CommandEvent::Terminated(payload) => {
                        eprintln!(
                            "[知枝] 后端进程已退出，code={:?} signal={:?}",
                            payload.code, payload.signal
                        );
                        let _ = handle.emit("backend-exited", payload.code);
                        break;
                    }
                    _ => {}
                }
            }
        });
    }
}

/// 组装并启动桌面壳。生产模式下于 setup 中以 sidecar 拉起 Node 后端。
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            backend::spawn(app.handle());

            let _window = app.get_webview_window("main");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动知枝桌面壳失败")
}
