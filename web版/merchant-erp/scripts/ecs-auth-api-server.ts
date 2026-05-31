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
import tenantsListHandler from '../../../商家管理后台/api/meoo-supabase-tenants-list.ts'
import tenantsPatchHandler from '../../../商家管理后台/api/meoo-supabase-tenants-patch.ts'
import tenantsResetPwdHandler from '../../../商家管理后台/api/meoo-supabase-tenants-reset-password.ts'
import paymentOrdersListHandler from '../../../商家管理后台/api/meoo-supabase-payment-orders-list.ts'
import paymentOrdersVerifyHandler from '../../../商家管理后台/api/meoo-supabase-payment-orders-verify.ts'
import paymentOrdersConfirmHandler from '../../../商家管理后台/api/meoo-supabase-payment-orders-confirm.ts'
import opsSyncRegistryGetHandler from '../api/meoo-ops-registry-ops-get.ts'
import opsSyncVendorKeysHandler from '../api/meoo-ops-sync-vendor-keys.ts'
import opsSyncAiHandler from '../api/meoo-ops-sync-ai.ts'
import opsSyncVideoAiHandler from '../api/meoo-ops-sync-video-ai.ts'

/** 404 响应中带此字段，便于确认 ECS 是否已拉取含注册表路由的版本 */
export const ECS_AUTH_API_ROUTE_REVISION = '20260529-registry-erp'

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
  '/api/meoo-supabase-tenants-list': tenantsListHandler as VercelLikeHandler,
  '/api/meoo-supabase-tenants-patch': tenantsPatchHandler as VercelLikeHandler,
  '/api/meoo-supabase-tenants-reset-password': tenantsResetPwdHandler as VercelLikeHandler,
  '/api/meoo-supabase-payment-orders-list': paymentOrdersListHandler as VercelLikeHandler,
  '/api/meoo-supabase-payment-orders-verify': paymentOrdersVerifyHandler as VercelLikeHandler,
  '/api/meoo-supabase-payment-orders-confirm': paymentOrdersConfirmHandler as VercelLikeHandler,
  /** 运营台注册表：Vercel 无法出站访问 ECS Supabase，由浏览器经 /erp-api 直连本机 */
  '/api/meoo-ops-sync-registry': opsSyncRegistryGetHandler as VercelLikeHandler,
  '/api/ops-sync/registry': opsSyncRegistryGetHandler as VercelLikeHandler,
  '/api/ops-sync/vendor-keys': opsSyncVendorKeysHandler as VercelLikeHandler,
  '/api/ops-sync/ai': opsSyncAiHandler as VercelLikeHandler,
  '/api/ops-sync/video-ai': opsSyncVideoAiHandler as VercelLikeHandler,
  // tokenmix 依赖 @supabase/supabase-js（须在 商家管理后台/node_modules）；ECS 仅走 Vercel /api/meoo-supabase-tenants-tokenmix
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
  let path = u.pathname
  if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '')
  return { path, query }
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
      res.end(
        JSON.stringify({
          ok: false,
          error: 'not_found',
          path,
          revision: ECS_AUTH_API_ROUTE_REVISION,
          hint: '请在 ECS 执行: cd ~/app && git pull && bash scripts/ecs-run-auth-api.sh（或 systemctl restart meoo-auth-api）',
        }),
      )
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
    const n = Object.keys(routes).length
    console.log(
      `[ecs-internal-api] http://127.0.0.1:${PORT} revision=${ECS_AUTH_API_ROUTE_REVISION} routes=${n} (含 meoo-ops-sync-registry)`,
    )
  })
