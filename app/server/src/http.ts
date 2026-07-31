import type {
  IncomingMessage,
  ServerResponse,
} from 'node:http'
import type {
  ContextMode,
  NodeStatus,
} from '../../shared/contracts.ts'
import { ApiError } from './errors.ts'
import {
  LearningStore,
  type CreateBranchInput,
  type UpdateNodeInput,
} from './learningStore.ts'

const MAX_BODY_BYTES = 64 * 1024

type JsonObject = Record<string, unknown>

export function createApiHandler(store = new LearningStore()) {
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

      if (
        request.method === 'POST' &&
        segments.length === 2 &&
        segments[0] === 'api' &&
        segments[1] === 'sessions'
      ) {
        const body = await readJson(request)
        const topic = requireString(body.topic, '学习主题不能为空')
        sendJson(response, 201, {
          session: store.createSession(topic),
        })
        return
      }

      const isSessionRoute =
        segments[0] === 'api' &&
        segments[1] === 'sessions' &&
        typeof segments[2] === 'string'

      if (
        isSessionRoute &&
        request.method === 'GET' &&
        segments.length === 3
      ) {
        sendJson(response, 200, {
          session: store.getSession(segments[2]),
        })
        return
      }

      const isNodeRoute =
        isSessionRoute &&
        segments[3] === 'nodes' &&
        typeof segments[4] === 'string'

      if (
        isNodeRoute &&
        request.method === 'PATCH' &&
        segments.length === 5
      ) {
        const body = await readJson(request)
        sendJson(
          response,
          200,
          store.updateNode(
            segments[2],
            segments[4],
            toUpdateNodeInput(body),
          ),
        )
        return
      }

      if (
        isNodeRoute &&
        request.method === 'POST' &&
        segments[5] === 'branches' &&
        segments.length === 6
      ) {
        const body = await readJson(request)
        sendJson(
          response,
          201,
          store.createBranch(
            segments[2],
            segments[4],
            toCreateBranchInput(body),
          ),
        )
        return
      }

      if (
        isNodeRoute &&
        request.method === 'POST' &&
        segments[5] === 'messages' &&
        segments.length === 6
      ) {
        const body = await readJson(request)
        const content = requireString(body.content, '消息内容不能为空')
        sendJson(
          response,
          201,
          store.sendMessage(segments[2], segments[4], content),
        )
        return
      }

      if (
        isNodeRoute &&
        request.method === 'POST' &&
        segments[5] === 'merge' &&
        segments.length === 6
      ) {
        sendJson(
          response,
          200,
          store.mergeBranch(segments[2], segments[4]),
        )
        return
      }

      if (
        isNodeRoute &&
        request.method === 'GET' &&
        segments[5] === 'context' &&
        segments.length === 6
      ) {
        sendJson(response, 200, {
          context: store.getCompiledContext(segments[2], segments[4]),
        })
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
  let receivedBytes = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    receivedBytes += buffer.length
    if (receivedBytes > MAX_BODY_BYTES) {
      throw new ApiError(413, 'BODY_TOO_LARGE', '请求内容不能超过 64KB')
    }
    chunks.push(buffer)
  }

  if (chunks.length === 0) {
    return {}
  }

  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('invalid body')
    }
    return value as JsonObject
  } catch {
    throw new ApiError(400, 'INVALID_JSON', '请求内容必须是 JSON 对象')
  }
}

function toCreateBranchInput(body: JsonObject): CreateBranchInput {
  const input: CreateBranchInput = {}

  if (typeof body.title === 'string') {
    input.title = body.title
  }
  if (body.contextMode !== undefined) {
    input.contextMode = body.contextMode as ContextMode
  }

  return input
}

function toUpdateNodeInput(body: JsonObject): UpdateNodeInput {
  const input: UpdateNodeInput = {}

  if (body.status !== undefined) {
    input.status = body.status as NodeStatus
  }
  if (body.contextMode !== undefined) {
    input.contextMode = body.contextMode as ContextMode
  }
  if (
    body.position &&
    typeof body.position === 'object' &&
    !Array.isArray(body.position)
  ) {
    const position = body.position as JsonObject
    input.position = {
      x: Number(position.x),
      y: Number(position.y),
    }
  }

  return input
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

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
) {
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
