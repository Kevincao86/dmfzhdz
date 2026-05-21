/**
 * 轻量 JSON 工具（无 node-mocks-http），供 /api/meoo-ai-chat 等高频函数冷启动使用。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return '{}'
  } catch {
    return '{}'
  }
}

export function sendMerchantJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
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

/** @returns true 若已处理 OPTIONS 并应结束 handler */
export function handleMerchantApiOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return true
  }
  return false
}
