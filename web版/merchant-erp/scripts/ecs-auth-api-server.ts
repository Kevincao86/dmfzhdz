/**
 * ECS 本机 Auth API（注册/短信/登录），供 Nginx 反代 /erp-api/
 */
import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import registerHandler from '../api/meoo-auth-register.ts'
import smsSendHandler from '../api/meoo-auth-sms-send.ts'
import smsLoginHandler from '../api/meoo-auth-sms-login.ts'
import pingHandler from '../api/meoo-auth-ping.ts'

const PORT = Number(process.env.AUTH_API_PORT ?? 3001)

type VercelLikeHandler = (
  req: IncomingMessage & { method?: string; url?: string; body?: unknown },
  res: ServerResponse,
) => Promise<void>

const routes: Record<string, VercelLikeHandler> = {
  '/api/meoo-auth-register': registerHandler as VercelLikeHandler,
  '/api/meoo-auth-sms-send': smsSendHandler as VercelLikeHandler,
  '/api/meoo-auth-sms-login': smsLoginHandler as VercelLikeHandler,
  '/api/meoo-auth-ping': pingHandler as VercelLikeHandler,
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

http
  .createServer(async (req, res) => {
    const vercelRes = adaptVercelResponse(res)
    const path = (req.url ?? '').split('?')[0]
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
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
      const vercelReq = Object.assign(req, {
        body: bodyBuf.length ? bodyBuf.toString('utf8') : undefined,
      })
      await handler(vercelReq, vercelRes)
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          ok: false,
          error: 'auth_api_server_error',
          detail: e instanceof Error ? e.message : String(e),
        }),
      )
    }
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`[ecs-auth-api] http://127.0.0.1:${PORT}`)
  })
