/**
 * 扁平绑定入口：POST /api/meoo-douyin-bind
 * 与 douyin-bind 同源逻辑；优先给前端调用，减少嵌套路由与打包追踪问题导致的 FUNCTION_INVOCATION_FAILED。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runDouyinMerchantBind } from './douyinMerchantBindCore'

export const config = { maxDuration: 60 }

function sendSafeJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  try {
    if (res.writableEnded) return
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(status).send(JSON.stringify(body))
  } catch {
    try {
      if (!res.writableEnded) res.end()
    } catch {
      /* noop */
    }
  }
}

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return '{}'
  } catch {
    return '{}'
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  try {
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    if (req.method !== 'POST') {
      sendSafeJson(res, 405, { message: 'Method Not Allowed' })
      return
    }

    const r = await runDouyinMerchantBind(rawBody(req))
    let payload: string
    try {
      payload = JSON.stringify(r.body)
    } catch {
      payload = JSON.stringify({ message: '绑定结果无法序列化为 JSON' })
    }
    if (!res.writableEnded) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.status(r.statusCode).send(payload)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendSafeJson(res, 500, {
      message: msg || '抖音绑定处理异常',
      hint: '模块加载失败时请查看 Vercel Logs；确认 Root Directory 为 web版/merchant-erp，且已部署 api/merchant/douyin/*。',
    })
  }
}
