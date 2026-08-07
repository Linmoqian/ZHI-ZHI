import { createServer } from 'node:http'
import { createApiHandler } from './http.ts'
import { TurnStoreRegistry } from './turnStoreRegistry.ts'
import { openDatabase } from './db.ts'

const host = process.env.ZHIZHI_HOST ?? '127.0.0.1'
const port = Number(process.env.ZHIZHI_PORT ?? 8787)

function resolveDataDir(): string {
  // dev.mjs 会注入默认值；此处兜底提供默认目录。
  return process.env.ZHIZHI_DATA_DIR?.trim() || '.zhizhi-data'
}

function createRegistry(): TurnStoreRegistry {
  const dataDir = resolveDataDir()
  const db = openDatabase(dataDir)

  const registry = new TurnStoreRegistry({ db })
  // 启动时从 SQLite 加载供应商配置并重建生效网关。
  registry.loadProviderSettings()
  return registry
}

async function main() {
  const registry = createRegistry()
  const server = createServer(createApiHandler(registry))

  server.listen(port, host, () => {
    console.log(
      `\u001B[36m[知枝后端]\u001B[0m 服务已启动：http://${host}:${port}`,
    )
  })

  function shutdown() {
    server.close(() => {
      console.log('\u001B[32m[知枝后端]\u001B[0m 服务已安全停止')
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

void main()
