import type {
  IncomingMessage,
  ServerResponse,
} from 'node:http'
import { ApiError } from './errors.ts'
import { TurnStoreRegistry } from './turnStoreRegistry.ts'

const MAX_BODY_BYTES = 64 * 1024

type JsonObject = Record<string, unknown>

export function createApiHandler(
  turnRegistry = new TurnStoreRegistry(),
) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    setCommonHeaders(response)

    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }

    try {
      const url = new URL(
        request.url ?? '/',
        `http://${request.headers.host ?? '127.0.0.1'}`,
      )
      const segments = url.pathname
        .split('/')
        .filter(Boolean)
        .map((segment) => decodeURIComponent(segment))

      if (
        request.method === 'GET' &&
        segments.length === 2 &&
        segments[0] === 'api' &&
        segments[1] === 'health'
      ) {
        sendJson(response, 200, {
          status: 'ok',
          service: 'zhizhi-backend',
        })
        return
      }

      // ----------------------------------------------------------------
      // 回合树路由（/api/turn-sessions）
      // ----------------------------------------------------------------

      const isTurnSessionRoot =
        segments.length === 2 &&
        segments[0] === 'api' &&
        segments[1] === 'turn-sessions'

      if (request.method === 'POST' && isTurnSessionRoot) {
        const body = await readJson(request)
        const userContent = requireString(
          body.userContent,
          '用户输入不能为空',
        )
        const turnStore = await turnRegistry.createSession(userContent)
        sendJson(response, 201, {
          session: turnRegistry.toSessionDTO(turnStore),
        })
        return
      }

      if (request.method === 'GET' && isTurnSessionRoot) {
        sendJson(response, 200, {
          sessions: await turnRegistry.listSessions(),
        })
        return
      }

      const isTurnSessionRoute =
        segments[0] === 'api' &&
        segments[1] === 'turn-sessions' &&
        typeof segments[2] === 'string'

      if (
        isTurnSessionRoute &&
        request.method === 'GET' &&
        segments.length === 3
      ) {
        const turnStore = await turnRegistry.getSession(segments[2])
        sendJson(response, 200, {
          session: turnRegistry.toSessionDTO(turnStore),
        })
        return
      }

      // /api/turn-sessions/:id/turns
      const isTurnsRoute = isTurnSessionRoute && segments[3] === 'turns'

      if (isTurnsRoute && request.method === 'POST' && segments.length === 4) {
        const body = await readJson(request)
        const parentId = requireString(body.parentId, '父回合不能为空')
        const userContent = requireString(
          body.userContent,
          '用户输入不能为空',
        )
        const turnStore = await turnRegistry.getSession(segments[2])
        const turn = await turnStore.appendTurn({ parentId, userContent })
        await turnStore.persist()
        sendJson(response, 201, {
          turn: turnRegistry.toTurnDTO(turnStore, turn.id),
        })
        return
      }

      // /api/turn-sessions/:id/turns/:turnId/fork
      if (
        isTurnsRoute &&
        request.method === 'POST' &&
        typeof segments[4] === 'string' &&
        segments[5] === 'fork'
      ) {
        const body = await readJson(request)
        const userContent = requireString(
          body.userContent,
          '用户输入不能为空',
        )
        const turnStore = await turnRegistry.getSession(segments[2])
        const turn = await turnStore.forkTurn({
          parentId: segments[4],
          userContent,
        })
        await turnStore.persist()
        sendJson(response, 201, {
          turn: turnRegistry.toTurnDTO(turnStore, turn.id),
        })
        return
      }

      // /api/turn-sessions/:id/turns/:turnId (PATCH 编辑)
      if (
        isTurnsRoute &&
        request.method === 'PATCH' &&
        typeof segments[4] === 'string' &&
        segments.length === 5
      ) {
        const body = await readJson(request)
        const turnStore = await turnRegistry.getSession(segments[2])
        const updated = turnStore.updateTurn(segments[4], {
          userContent:
            typeof body.userContent === 'string'
              ? body.userContent
              : undefined,
          assistantContent:
            typeof body.assistantContent === 'string'
              ? body.assistantContent
              : undefined,
        })
        await turnStore.persist()
        sendJson(response, 200, {
          turn: turnRegistry.toTurnDTO(turnStore, updated.id),
        })
        return
      }

      // /api/turn-sessions/:id/turns/:turnId/context
      if (
        isTurnsRoute &&
        request.method === 'GET' &&
        typeof segments[4] === 'string' &&
        segments[5] === 'context'
      ) {
        const turnStore = await turnRegistry.getSession(segments[2])
        const context = turnStore.compileContext(segments[4])
        sendJson(response, 200, { context })
        return
      }

      throw new ApiError(404, 'ROUTE_NOT_FOUND', '接口不存在')
    } catch (error) {
      sendError(response, error)
    }
  }
}

async function readJson(request: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = []
  const contentLength = Number(request.headers['content-length'] ?? 0)

  if (contentLength > MAX_BODY_BYTES) {
    throw new ApiError(413, 'BODY_TOO_LARGE', '请求体过大')
  }

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    chunks.push(buffer)
    if (Buffer.concat(chunks).length > MAX_BODY_BYTES) {
      throw new ApiError(413, 'BODY_TOO_LARGE', '请求体过大')
    }
  }

  if (chunks.length === 0) {
    return {}
  }

  try {
    const value: unknown = JSON.parse(
      Buffer.concat(chunks).toString('utf8'),
    )
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('invalid body')
    }
    return value as JsonObject
  } catch {
    throw new ApiError(400, 'INVALID_JSON', '请求内容必须是 JSON 对象')
  }
}

function requireString(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, 'INVALID_INPUT', message)
  }
  return value
}

function setCommonHeaders(response: ServerResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PATCH,OPTIONS',
  )
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  response.setHeader('Cache-Control', 'no-store')
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(value))
}

function sendError(response: ServerResponse, error: unknown) {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(500, 'INTERNAL_ERROR', '服务器处理请求时出错')

  sendJson(response, apiError.status, {
    error: {
      code: apiError.code,
      message: apiError.message,
    },
  })
}
