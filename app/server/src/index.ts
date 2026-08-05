import { createServer } from 'node:http'
import { createApiHandler } from './http.ts'
import { LearningStore } from './learningStore.ts'
import { createFileSessionPersistor } from './journal.ts'
import { createOllamaGateway, resolveModelFromEnv } from './modelGateway.ts'

const host = process.env.ZHIZHI_HOST ?? '127.0.0.1'
const port = Number(process.env.ZHIZHI_PORT ?? 8787)

async function createStore(): Promise<LearningStore> {
  const dataDir = process.env.ZHIZHI_DATA_DIR?.trim()
  const persistor = dataDir ? createFileSessionPersistor(dataDir) : undefined
  const store = new LearningStore({
    modelGateway: createOllamaGateway({
      model: resolveModelFromEnv(process.env),
    }),
    persistor,
  })

  if (persistor) {
    const ids = await persistor.listSessionIds()
    let restored = 0
    for (const id of ids) {
      const dump = await persistor.load(id)
      if (dump) {
        try {
          store.restoreSession(dump)
          restored += 1
        } catch {
          // 单个会话损坏时跳过，不影响其余会话恢复。
        }
      }
    }
    console.log(
      `[知枝后端] 已从 ${dataDir} 恢复 ${restored}/${ids.length} 个会话`,
    )
  }
  return store
}

const store = await createStore()
const server = createServer(createApiHandler(store))

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
