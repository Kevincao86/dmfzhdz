/**
 * 显式路由：部分 CDN / 托管对 catch-all 的 POST 返回 405，单独暴露绑定接口。
 * 绑定逻辑走同目录 `bindRuntime.ts`（轻量），勿直接 import 整份 douyinMerchantGateway，以免 Vercel 打包过大触发 FUNCTION_INVOCATION_FAILED。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runDouyinMerchantBind } from './bindRuntime'

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
