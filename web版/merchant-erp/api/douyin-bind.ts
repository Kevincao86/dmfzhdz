/**
 * 独立入口：抖音来客绑定。生产路径：POST /api/douyin-bind
 * 使用动态 import(bindRuntime)，避免构建产物在个别环境下顶层初始化异常导致 FUNCTION_INVOCATION_FAILED。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendSafeJson } from './lib/safeJsonResponse'

export const config = { maxDuration: 60 }

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

    const { runDouyinMerchantBind } = await import('./merchant/douyin/bindRuntime')
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
      hint: '若为加载绑定模块失败，请查看 Vercel Logs；可确认 Root Directory 为 web版/merchant-erp 且已部署 api/douyin-bind。',
    })
  }
}
