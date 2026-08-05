# 知枝应用

## 本地运行

```bash
npm install
npm run dev
```

开发命令会同时启动：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8787`

Vite 会把 `/api` 请求代理到后端。

## 本地模型（Ollama）

助手回复由本地 Ollama 生成（走 `/api/chat`），默认使用参数量小的 `llama2:latest` 以避免低内存环境卡死：

```bash
ollama pull llama2:latest   # 若尚未拉取
ZHIZHI_MODEL=llama2:latest npm run dev
```

可通过 `ZHIZHI_MODEL` 指定其他本地模型。Ollama 不可用或生成失败时，后端会回退到本地规则模板，保证基础对话不中断。默认的后端 `/api/chat` 地址是 `http://127.0.0.1:11434`。

## 持久化

默认会话只保存在进程内存中。设置 `ZHIZHI_DATA_DIR` 后启用文件持久化：

```bash
ZHIZHI_DATA_DIR=.zhizhi-data npm run dev
```

每个会话以一份 JSON 快照写入该目录（原子替换），包含分支指针、消息父链与内容 Blob，可精确还原不可变 DAG 与上下文隔离语义。后端启动时会自动恢复已存在会话。

## 验证

```bash
npm run lint
npm run build
npm run server:test
```

## 后端接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查 |
| `POST` | `/api/sessions` | 创建学习会话 |
| `GET` | `/api/sessions/:id` | 获取会话快照 |
| `POST` | `/api/sessions/:id/nodes/:nodeId/branches` | 创建分支 |
| `POST` | `/api/sessions/:id/nodes/:nodeId/messages` | 在分支中发送消息 |
| `PATCH` | `/api/sessions/:id/nodes/:nodeId` | 更新状态、布局或上下文模式 |
| `POST` | `/api/sessions/:id/nodes/:nodeId/merge` | 将分支结论合并到父节点 |
| `GET` | `/api/sessions/:id/nodes/:nodeId/context` | 检查实际编译的上下文 |

## 上下文隔离规则

1. 消息不可变，并通过父指针组成 DAG；分支只保存创建基点和 HEAD。
2. 同级分支没有父指针关系，因此不会进入彼此的上下文。
3. `inherit` 只继承分支创建时的父节点快照，不读取父节点后续消息。
4. `isolated` 在分支基点处截断，只编译当前分支的本地消息。
5. 合并只向父分支写入整理后的结论，不复制分支原始消息。

## MVP 边界

- 数据默认保存在进程内存中；设置 `ZHIZHI_DATA_DIR` 后按会话快照持久化，重启可恢复。
- 回答优先由本地 Ollama 生成；模型不可用时回退到确定性本地逻辑。
- 暂不包含身份认证、数据库、附件、向量检索和持久化摘要树。
