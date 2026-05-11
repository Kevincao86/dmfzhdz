/**
 * POST /api/douyin/webhook
 * 抖音开放平台 · Webhooks 请求网址校验：解析 verify_webhook 的 challenge 并原样 JSON 回显。
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/connect/partner/basic-config/webhooks
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

function json(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'method_not_allowed' })
    return
  }

  let payload: unknown
  try {
    const raw = req.body
    if (raw == null || raw === '') {
      json(res, 400, { error: 'empty_body' })
      return
    }
    payload = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
  } catch {
    json(res, 400, { error: 'invalid_json' })
    return
  }

  if (!payload || typeof payload !== 'object') {
    json(res, 400, { error: 'invalid_payload' })
    return
  }

  const obj = payload as Record<string, unknown>
  const content = obj.content
  let challenge: unknown
  if (content && typeof content === 'object' && content !== null && 'challenge' in content) {
    challenge = (content as Record<string, unknown>).challenge
  }
  if (challenge === undefined && 'challenge' in obj) {
    challenge = obj.challenge
  }

  if (challenge === undefined || challenge === null) {
    json(res, 400, { error: 'missing_challenge' })
    return
  }

  json(res, 200, { challenge })
}
