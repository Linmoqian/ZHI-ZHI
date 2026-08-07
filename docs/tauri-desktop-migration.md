# Tauri 桌面化迁移规划

> 目标：将知枝从「Vite 前端 + Node HTTP 后端」的 Web 形态，迁移为带桌面体验的
> Tauri 2 桌面应用。
> **已确认方案：Rust 只做桌面薄层，采用 Node sidecar —— Node HTTP 后端仍是
> 业务数据的事实来源，前端继续通过 HTTP 访问后端，Rust 仅承担桌面窗口壳与
> 桌面专属交互。**（后续若需演进为 Rust 全量后端，见第 6 节演化选项。）
>
> 依据：`AGENTS.md` 的 TypeScript + Rust 技术路线、`docs/development/rust.md`、
> `docs/development/hot-reload.md`、`docs/development/api-documentation.md`。

## 1. 现状与目标架构

### 1.1 现状（迁移前）

```text
浏览器
 └─ React 19 + Vite (app/src)          ← fetch('/api/...')
      └─ Vite proxy /api → 127.0.0.1:8787
           └─ Node HTTP 后端 (app/server, ~2200 行 TS)
                ├─ TurnStoreRegistry / TurnStore  回合树领域
                ├─ sqlitePersistor (better-sqlite3, WAL)
                ├─ providerConfig                供应商配置
                └─ modelGateway (Ollama / 云端, 非流式)
数据: .zhizhi-data/zhizhi.db（4 表, schema 见 server/src/db.ts）
开发: npm run dev（scripts/dev.mjs 双进程）
```

### 1.2 目标（迁移后）

```text
Tauri 桌面窗口（无边框 + 自定义标题栏）
 └─ React 19 + Vite (app/src)          ← fetch('/api/...')（不变）
      ├─ Vite proxy /api → 127.0.0.1:8787（不变）
      ├─ Node HTTP 后端 (app/server)   ← 业务事实来源（不变）
      └─ Rust 桌面壳 (app/src-tauri/)  ← 薄层：窗口、标题栏、侧边进程
           ├─ main/lib.rs  启动、组装
           ├─ commands/    极少量 IPC（如窗口控制），无业务逻辑
           └─ capabilities windows/shell 最小授权，用于承载 Node sidecar
数据: 生产 app_data_dir/zhizhi.db（或沿用 ZHIZHI_DATA_DIR）；schema 不变
开发: npm run tauri dev（Tauri CLI 同时起 Vite、Node sidecar 与 Rust 壳）
```

### 1.3 角色划分（Rust 薄层边界）

| 层面 | 归属 | 说明 |
| --- | --- | --- |
| 业务模型 / 持久化 / 模型网关 | Node 后端（`app/server`） | 事实来源，迁移前后**不重写** |
| 前端状态编排 / 视图 | React（`app/src`） | 继续 fetch 后端 |
| 桌面窗口、无边框标题栏、窗口控制 | Rust 壳（`app/src-tauri`） | 仅桌面外围，无业务数据依赖 |
| Node 后端进程托管 | Rust 壳 / 开发脚本 | dev 用 Tauri CLI 统一拉起，生产 bundle sidecar |

## 2. 技术决策（方案 A）

| 决策点 | 结论 | 理由 |
| --- | --- | --- |
| 后端形态 | **保留 Node HTTP 后端，Rust 只做桌面薄层** | 工程师明确选择方案 A；最优改动、风险最低 |
| Node 托管 | dev：`beforeDevCommand`（或改造 dev.mjs）同时起 Vite + Node；生产：bundle Node sidecar | 桌面壳统一管理，无需前端感知 |
| 数据库 | 不变（better-sqlite3，schema 原样） | 无迁移成本 |
| IPC | 极小化；Rust 几乎不暴露业务 command | 业务仍走 HTTP，避免重复实现 |
| capabilities | `core:default` + shell（或进程）最小权限 | 满足 Node sidecar 启动所需，遵循最小授权 |
| 窗口 | `decorations: false` + 自研 TitleBar | 无边框桌面体验 |
| 前端依赖 | 新增 `@tauri-apps/api`、`@tauri-apps/cli`（dev）、`@tauri-apps/plugin-shell`（如需 shell） | Tauri 壳所需 |
| 标题栏 | 自封装 `TitleBar.tsx`（拖拽、窗口控制、键盘可达） | 契合 AGENTS.md 桌面组件要求 |
| 桌面专属系统项 | 禁用右键菜单、隐藏滚动条 | 迁移计划 Phase 3 已有收尾 |

## 3. 分阶段实施

### Phase 0 — Tauri 薄壳脚手架与桌面窗口（半天）

任务：

1. 在 `app/` 下创建 `src-tauri/`（而非 `npm create tauri-app` 重建整个前端），
   手写 `Cargo.toml`、`tauri.conf.json`、`src/main.rs`、`src/lib.rs`、capabilities。
2. 安装依赖：`@tauri-apps/api`（dep）、`@tauri-apps/cli`（dev）。
3. 配置 `tauri.conf.json`：
   - `build.beforeDevCommand: "npm run dev:backend-and-vite"` 或改造后脚本（同时起 Vite + Node）
   - `build.devUrl: "http://127.0.0.1:5173"`
   - 窗口：`decorations: false`、合理默认尺寸、`title: "知枝"`。
4. 新增 `src/components/TitleBar.tsx` 与配套样式：
   - `data-tauri-drag-region` 拖拽区；双击最大化/还原
   - 最小化 / 最大化还原 / 关闭三按钮（`getCurrentWindow()`）
   - 按钮可键盘聚焦，**不置于拖拽区**
5. 全局禁用默认右键菜单；隐藏视觉滚动条（沿用现有样式收尾）。
6. `main.tsx` 挂载 TitleBar；布局适配无边框窗口（顶部安全区）。
7. `.gitignore` 增加 `app/src-tauri/target/`。

验收：

- `npm run tauri dev` 启动无边框窗口 + Node 后端，前端经 HTTP 正常读写数据。
- 五类窗口操作可用且键盘可达；拖拽区与按钮无冲突。
- 右键无系统菜单；滚动条不可见但可滚动。

### Phase 1 — sidecar 生产化与进程托管（1~2 天）

1. 评估 Node 运行时打包：将 Node 二进制 + 精简后的 `server/` 作为 Tauri sidecar；
   或用 `tauri-plugin-shell` 以参数化方式启动 `node`。
2. capabilities 追加 shell / 外部进程权限，路径校验与最小授权。
3. 启动幂等：确保重复拉起后端不重复占用端口；后端退出时桌面提示而非静默失败。
4. 数据目录策略：生产 `app_data_dir`；`ZHIZHI_DATA_DIR` 覆盖沿用。

验收：

- 生产构建 `tauri build` 产出安装包，双击即起后端与窗口，旧库直读。
- 后端崩溃/退出有明确的用户反馈。

### Phase 2 — 桌面交互打磨与收尾（1 天）

1. 拖拽区、双击、三按钮与现有 `NavRail`/`SplitPane` 布局在无边框窗口下整体验证。
2. 滚动条隐藏、右键禁用与 ReactFlow 地图交互冲突排查。
3. 前端 Vitest 用例迁移：渲染 TitleBar 时 mock `@tauri-apps/api/window`。
4. 接口文档更新：`docs/api/providers.md` 迁移说明（HTTP over 桌面 none）；新增桌面窗口说明。

验收：

- 全部验证命令通过；核心流程（建会话→分支→设置→生成）在桌面端可用。

## 4. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| Node sidecar 打包体积与复杂度 | 安装包偏大、平台差异 | 方案 A 将打包推迟到 Phase 1；首版可 dev-only，生产打包单独立项 |
| 端口占用 / 后端重复启动 | 后端连接失败 | 幂等启动 + 端口探测；失败明确提示 |
| WebView 与浏览器行为差异 | 右键、滚动、焦点 | Phase 2 专项验证；桌面专属逻辑集中在 TitleBar 与全局事件 |
| Rust 薄层被误扩展成本体逻辑 | 边界模糊 | 严守 1.3 角色划分，README/文档标注 |

## 5. 里程碑

| 里程碑 | 内容 | 预估 |
| --- | --- | --- |
| M0 | Tauri 薄壳 + 无边框窗口跑通，Node 后端经 HTTP 可用 | Phase 0 |
| M1 | Node sidecar 生产化，桌面安装包可用 | Phase 1 |
| M2 | 桌面交互打磨，测试与文档齐备 | Phase 2 |

总预估：2~4 个工作日（远小于全量 Rust 重写的 9~12 天）。

## 6. 演化选项（非当前范围）

若后续决定转向 Rust 全量后端，可复用本规划建议的目录（`domain`/`services`/`state`/
`commands`/`dto`），将 `server/src` 各模块逐一移植，并原样保留 SQLite schema。该路径需
重新评估，方与「Rust 为业务事实来源」的原目标一致。
