/**
 * 独立入口：抖音来客绑定。勿放在带 `includeFiles: vite-plugins/**` 的通配函数里，否则 bundle 过大易 OOM → FUNCTION_INVOCATION_FAILED。
 * 生产路径：POST /api/douyin-bind
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runDouyinMerchantBind } from './merchant/douyin/bindRuntime'

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
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS')
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).send(JSON.stringify({ message: 'Method Not Allowed' }))
    return
  }

  try {
    const r = await runDouyinMerchantBind(rawBody(req))
    let payload: string
    try {
      payload = JSON.stringify(r.body)
    } catch {
      payload = JSON.stringify({ message: '绑定结果无法序列化为 JSON' })
    }
    res.status(r.statusCode).send(payload)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    try {
      if (!res.writableEnded) {
        res.status(500).send(JSON.stringify({ message: msg || '抖音绑定处理异常' }))
      }
    } catch {
      try {
        if (!res.writableEnded) res.end()
      } catch {
        /* noop */
      }
    }
  }
}
