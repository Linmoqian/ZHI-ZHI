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

- 数据保存在进程内存中，后端重启后重置。
- 回答由确定性本地逻辑生成，尚未连接真实模型供应商。
- 暂不包含身份认证、数据库、附件、向量检索和持久化摘要树。
