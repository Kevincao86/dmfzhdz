/**
 * ECS 本机 API（Auth + 运营客服轮询），供 Nginx 反代 /erp-api/
 */
import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { URL } from 'node:url'
import registerHandler from '../api/meoo-auth-register.ts'
import smsSendHandler from '../api/meoo-auth-sms-send.ts'
import smsLoginHandler from '../api/meoo-auth-sms-login.ts'
import pingHandler from '../api/meoo-auth-ping.ts'
import supportPollHandler from '../../../商家管理后台/api/support-poll.ts'
import supportOpsSendHandler from '../../../商家管理后台/api/support-ops-send.ts'

const PORT = Number(process.env.AUTH_API_PORT ?? 3001)

type VercelLikeHandler = (
  req: IncomingMessage & {
    method?: string
    url?: string
    body?: unknown
    query?: Record<string, string | string[]>
    headers?: IncomingMessage['headers']
  },
  res: ServerResponse,
) => Promise<void>

const routes: Record<string, VercelLikeHandler> = {
  '/api/meoo-auth-register': registerHandler as VercelLikeHandler,
  '/api/meoo-auth-sms-send': smsSendHandler as VercelLikeHandler,
  '/api/meoo-auth-sms-login': smsLoginHandler as VercelLikeHandler,
  '/api/meoo-auth-ping': pingHandler as VercelLikeHandler,
  '/api/support-poll': supportPollHandler as VercelLikeHandler,
  '/api/support-ops-send': supportOpsSendHandler as VercelLikeHandler,
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function adaptVercelResponse(res: ServerResponse): ServerResponse & {
  status: (code: number) => { send: (body: string) => void; end: () => void }
} {
  const r = res as ServerResponse & {
    status: (code: number) => { send: (body: string) => void; end: () => void }
  }
  r.status = (code: number) => {
    r.statusCode = code
    return {
      send: (body: string) => {
        r.end(body)
      },
      end: () => {
        r.end()
      },
    }
  }
  return r
}

function parseRequestUrl(req: IncomingMessage): { path: string; query: Record<string, string> } {
  const raw = req.url ?? '/'
  const u = new URL(raw.includes('://') ? raw : `http://127.0.0.1${raw.startsWith('/') ? raw : `/${raw}`}`)
  const query: Record<string, string> = {}
  u.searchParams.forEach((v, k) => {
    query[k] = v
  })
  return { path: u.pathname, query }
}

http
  .createServer(async (req, res) => {
    const vercelRes = adaptVercelResponse(res)
    const { path, query } = parseRequestUrl(req)
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      res.end()
      return
    }
    const handler = routes[path]
    if (!handler) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ ok: false, error: 'not_found', path }))
      return
    }
    try {
      const bodyBuf = req.method === 'POST' ? await readBody(req) : Buffer.alloc(0)
      let body: unknown = undefined
      if (bodyBuf.length) {
        const text = bodyBuf.toString('utf8')
        try {
          body = JSON.parse(text) as unknown
        } catch {
          body = text
        }
      }
      const vercelReq = Object.assign(req, { body, query, headers: req.headers })
      await handler(vercelReq, vercelRes)
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          ok: false,
          error: 'ecs_internal_api_error',
          detail: e instanceof Error ? e.message : String(e),
        }),
      )
    }
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`[ecs-internal-api] http://127.0.0.1:${PORT} (auth + support-poll)`)
  })
