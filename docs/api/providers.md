# 模型供应商设置

涵盖模型供应商的查询、更新、切换与连通性测试接口。

## 接口元信息

| 项目 | 内容 |
| --- | --- |
| 接口标识 | `GET /api/settings/providers`、`PATCH /api/settings/providers/:id`、`PUT /api/settings/providers/active`、`POST /api/settings/providers/:id/test` |
| 用途 | 管理本地与云端两个方向的模型供应商，支持读取脱敏配置、更新字段、切换生效供应商与连通性测试 |
| 调用方 | 前端设置界面 `SettingsView` |
| 提供方 | 知枝后端 HTTP 服务 |
| 稳定性 | 稳定 |
| 引入版本 | 0.1.0 |
| 维护方 | 知枝后端 |
| 接口类型 | HTTP API |
| 调用方式 | 本地开发环境，默认 `http://127.0.0.1:8787` |
| 权限或认证 | 无；服务仅监听本地，不对外暴露 |
| Content-Type | 请求与响应均为 `application/json; charset=utf-8` |

## 请求

### GET /api/settings/providers

无请求参数。

### PATCH /api/settings/providers/:id

| 字段 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | path | string | 是 | — | 内置供应商 id | 目标供应商 |
| `label` | body | string | 否 | — | 非空 | 供应商显示名 |
| `endpoint` | body | string | 否 | — | 合法 URL | 推理服务端点 |
| `model` | body | string | 否 | — | 非空 | 模型名 |
| `apiKey` | body | string\|null | 否 | — | 字符串=设置新值；`null`=清除；省略=不变 | 仅云端供应商生效 |

### PUT /api/settings/providers/active

| 字段 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `providerId` | body | string | 是 | — | 已存在的供应商 id | 设为生效供应商 |

### POST /api/settings/providers/:id/test

| 字段 | 位置 | 类型 | 必填 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | path | string | 是 | — | 已存在的供应商 id | 待测供应商 |

## 响应

GET / PATCH / PUT active 成功返回 `ProviderSettingsDTO`，HTTP 200；POST test 返回 `TestProviderResponse`，HTTP 200。

ProviderSettingsDTO：

| 字段 | 类型 | 必定返回 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| `providers` | `ProviderConfig[]` | 是 | 至少含本地与云端各一项 | 全部供应商 |
| `providers[].id` | string | 是 | — | 供应商 id |
| `providers[].kind` | `'local'` \| `'cloud'` | 是 | — | 方向 |
| `providers[].label` | string | 是 | — | 显示名 |
| `providers[].endpoint` | string | 是 | URL | 推理端点 |
| `providers[].model` | string | 是 | — | 模型名 |
| `providers[].apiKeySet` | boolean | 是 | — | Key 是否已设置 |
| `providers[].apiKeyMasked` | string | 否 | 形如 `sk-****1234`；本地供应商不返回 | Key 脱敏片段，绝不返回明文 |
| `activeProviderId` | string | 是 | — | 当前生效供应商 id |
| `active` | `ActiveProvider` | 是 | — | 生效供应商摘要（id/kind/label） |

TestProviderResponse：

| 字段 | 类型 | 必定返回 | 约束 | 说明 |
| --- | --- | --- | --- | --- |
| `ok` | boolean | 是 | — | 连通是否成功 |
| `message` | string | 是 | — | 成功提示或失败原因 |

## 错误码

| 代码 | 含义 | 可重试 | 处理建议 |
| --- | --- | --- | --- |
| 400 `INVALID_INPUT` | 字段缺失或格式非法 | 否 | 修正请求体 |
| 404 `PROVIDER_NOT_FOUND` | 供应商 id 不存在 | 否 | 重新拉取列表 |
| 500 `INTERNAL_ERROR` | 服务端内部错误 | 是 | 稍后重试 |

## 权限与安全

- 服务默认仅监听 `127.0.0.1`，不对外暴露。
- API Key 仅保存在服务端 SQLite `provider_settings` 表，GET 接口对其脱敏（`apiKeyMasked`），永不返回明文。
- 环境变量 `ZHIZHI_DEEPSEEK_API_KEY` 与 `ZHIZHI_OLLAMA_ENDPOINT` 作为部署级覆盖，优先于数据库中的对应字段。
- 配置数据位于 `ZHIZHI_DATA_DIR/zhizhi.db`，该目录应纳入 `.gitignore`，不进版本库。

## 行为约束

- 副作用：PATCH/PUT 以事务写入 SQLite `provider_settings` 表；PUT active 额外重建当前生效网关，已有会话下次回合即生效，不重生成历史回合。
- 幂等性：PATCH 同值字段不会写入；PUT active 重复设置同一 id 安全。
- 超时与取消：complete 与 testConnection 各自带 120s / 15s 超时。
- 并发：配置写入串行（进程内单线程），无显式锁。
- 缓存：GET 响应 `Cache-Control: no-store`。

## 调用示例

### 请求示例

```text
PATCH /api/settings/providers/provider-cloud-deepseek HTTP/1.1
Content-Type: application/json

{"apiKey":"sk-demo-1234567890abcdef"}
```

```text
PUT /api/settings/providers/active HTTP/1.1
Content-Type: application/json

{"providerId":"provider-cloud-deepseek"}
```

### 响应示例

```text
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
  "providers": [
    {
      "id": "provider-local-ollama",
      "kind": "local",
      "label": "本地 Ollama",
      "endpoint": "http://127.0.0.1:11434",
      "model": "llama2:latest",
      "apiKeySet": false
    },
    {
      "id": "provider-cloud-deepseek",
      "kind": "cloud",
      "label": "DeepSeek",
      "endpoint": "https://api.deepseek.com",
      "model": "deepseek-chat",
      "apiKeySet": true,
      "apiKeyMasked": "sk-****cdef"
    }
  ],
  "activeProviderId": "provider-cloud-deepseek",
  "active": {
    "id": "provider-cloud-deepseek",
    "kind": "cloud",
    "label": "DeepSeek"
  }
}
```

### 错误示例

```text
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"error":{"code":"PROVIDER_NOT_FOUND","message":"供应商不存在"}}
```

## 兼容性与变更记录

- 兼容性说明：`ProviderConfig` 可新增可选字段；`kind` 当前仅 `local`/`cloud`，后续可能扩展枚举值，调用方需容忍。
- 废弃计划：无。

| 日期 | 版本 | 变更类型 | 内容 | 迁移说明 |
| --- | --- | --- | --- | --- |
| 2026-08-07 | 0.1.0 | 兼容 | 新增模型供应商设置接口 | 无 |
