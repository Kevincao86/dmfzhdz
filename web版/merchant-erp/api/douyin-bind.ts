/**
 * 独立入口：POST /api/douyin-bind
 *
 * 勿使用单独的 `./lib/*` 小文件：Vercel Node ESM 产物曾出现
 * `ERR_MODULE_NOT_FOUND .../api/lib/safeJsonResponse`。辅助函数直接写在本文件内。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runDouyinMerchantBind } from './merchant/douyin/bindRuntime'

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
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Allow', 'POST, OPTIONS')
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
      hint: '若仍为模块加载错误，请查看 Vercel Logs；Root Directory 须为 web版/merchant-erp。',
    })
  }
}
