import { createServer } from 'node:http'
import { createApiHandler } from './http.ts'

const host = process.env.ZHIZHI_HOST ?? '127.0.0.1'
const port = Number(process.env.ZHIZHI_PORT ?? 8787)
const server = createServer(createApiHandler())

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
