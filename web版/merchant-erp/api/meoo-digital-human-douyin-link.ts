/**
 * POST /api/meoo-digital-human-douyin-link — 抖音链接 → 口播文案 + 动作指令
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runDouyinLinkParseCore } from '../src/lib/digitalHumanDouyinLinkCore.js'

export const config = { maxDuration: 120 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'method_not_allowed' })
    return
  }

  let body: { url?: string; tenantId?: string }
  try {
    const raw =
      typeof req.body === 'string'
        ? req.body
        : req.body && typeof req.body === 'object'
          ? JSON.stringify(req.body)
          : ''
    body = JSON.parse(raw || '{}') as { url?: string; tenantId?: string }
  } catch {
    sendJson(res, 400, { ok: false, message: 'invalid_json' })
    return
  }

  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
  const { mergeMerchantAiEnvWithRegistrySnapshot } = await import(
    '../vite-plugins/merchantRegistryVendorEnv.js'
  )
  const env = await mergeMerchantAiEnvWithRegistrySnapshot(
    process.cwd(),
    process.env as Record<string, string>,
  )
  const out = await runDouyinLinkParseCore(
    { url: String(body.url ?? ''), tenantId: typeof body.tenantId === 'string' ? body.tenantId : undefined },
    env,
    auth,
  )
  if (!out.ok) {
    sendJson(res, 422, { ok: false, message: out.message })
    return
  }
  sendJson(res, 200, { ...out })
}
