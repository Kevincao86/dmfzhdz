/**
 * POST /api/meoo-ai-agent-audit
 *
 * 商户 ERP 多模型 AI 网关在完成调用后可选转发审计事件（服务端对服务端）。
 * 请求头：`x-meoo-ai-audit-secret` 须与运营台 `MEOO_AI_AGENT_AUDIT_SECRET`、ERP `MEOO_AI_AGENT_AUDIT_SECRET` 一致。
 * 当前实现：结构化日志；后续可在此接入 Supabase 等持久化，勿在前端暴露密钥。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

function auditBody(req: VercelRequest): string {
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
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-meoo-ai-audit-secret')
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).setHeader('Content-Type', 'application/json; charset=utf-8')
    res.send(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
    return
  }

  const expected = (process.env.MEOO_AI_AGENT_AUDIT_SECRET ?? '').trim()
  const got =
    typeof req.headers['x-meoo-ai-audit-secret'] === 'string'
      ? req.headers['x-meoo-ai-audit-secret'].trim()
      : ''
  if (!expected || got !== expected) {
    res.status(401).setHeader('Content-Type', 'application/json; charset=utf-8')
    res.send(JSON.stringify({ ok: false, error: 'unauthorized' }))
    return
  }

  let payload: unknown
  try {
    payload = JSON.parse(auditBody(req) || '{}') as unknown
  } catch {
    res.status(400).setHeader('Content-Type', 'application/json; charset=utf-8')
    res.send(JSON.stringify({ ok: false, error: 'invalid_json' }))
    return
  }

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      channel: 'meoo_ai_agent_audit_ingress',
      payload,
    }),
  )

  res.status(200).setHeader('Content-Type', 'application/json; charset=utf-8')
  res.send(JSON.stringify({ ok: true, accepted: true }))
}
