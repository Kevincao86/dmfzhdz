/**
 * POST /api/meoo-douyin-life-webhook
 * 抖音林客 · 能力授权 Webhook（auth_with_bind）+ 探活 challenge
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/life.capacity.shop/auth_with_bind
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { finalizePartnerLinkeAuthWebhook } from '../src/lib/partnerLinkeOnboardCore.js'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { nodeSupabaseClientOptions } from '../src/lib/nodeSupabaseClientOptions.js'

export const config = { maxDuration: 60 }

function json(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function parsePayload(req: VercelRequest): Record<string, unknown> | null {
  try {
    const raw = req.body
    if (raw == null || raw === '') return null
    if (typeof raw === 'string') return JSON.parse(raw) as Record<string, unknown>
    if (Buffer.isBuffer(raw)) return JSON.parse(raw.toString('utf8')) as Record<string, unknown>
    if (typeof raw === 'object') return raw as Record<string, unknown>
  } catch {
    return null
  }
  return null
}

function extractChallenge(payload: Record<string, unknown>): unknown {
  const content = payload.content
  if (content && typeof content === 'object' && content !== null && 'challenge' in content) {
    return (content as Record<string, unknown>).challenge
  }
  if ('challenge' in payload) return payload.challenge
  return undefined
}

function parseAuthWithBindContent(contentRaw: unknown): {
  accountId?: string
  extra?: unknown
  outShopId?: string
  poiId?: string
} {
  if (contentRaw == null || contentRaw === '') return {}
  try {
    const parsed =
      typeof contentRaw === 'string' ? (JSON.parse(contentRaw) as Record<string, unknown>) : contentRaw
    if (!parsed || typeof parsed !== 'object') return {}
    const o = parsed as Record<string, unknown>
    return {
      accountId: typeof o.account_id === 'string' ? o.account_id : undefined,
      extra: o.extra,
      outShopId: typeof o.out_shop_id === 'string' ? o.out_shop_id : undefined,
      poiId: typeof o.poi_id === 'string' ? o.poi_id : undefined,
    }
  } catch {
    return {}
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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

  const payload = parsePayload(req)
  if (!payload) {
    json(res, 400, { error: 'invalid_json' })
    return
  }

  const challenge = extractChallenge(payload)
  if (challenge !== undefined && challenge !== null) {
    json(res, 200, { challenge })
    return
  }

  const event = String(payload.event || '').trim()
  if (event !== 'life_saas_cooperate_auth_with_bind') {
    json(res, 200, { ok: true, skipped: true, event: event || null })
    return
  }

  const msgId =
    typeof req.headers['msg-id'] === 'string'
      ? req.headers['msg-id']
      : typeof req.headers['Msg-Id'] === 'string'
        ? req.headers['Msg-Id']
        : null

  const parsed = parseAuthWithBindContent(payload.content)
  if (!parsed.accountId) {
    json(res, 400, { ok: false, error: 'missing_account_id' })
    return
  }

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length) {
    json(res, 503, { ok: false, error: 'supabase_not_configured' })
    return
  }

  const admin = createClient(supabaseUrl, serviceRole, nodeSupabaseClientOptions())
  const out = await finalizePartnerLinkeAuthWebhook({
    admin,
    msgId,
    accountId: parsed.accountId,
    extra: parsed.extra,
    outShopId: parsed.outShopId,
    poiId: parsed.poiId,
    autoCooperation: true,
    chargeType: 2,
  })

  if (!out.ok) {
    json(res, 200, { ok: false, message: out.message })
    return
  }

  json(res, 200, {
    ok: true,
    onboardingId: out.onboardingId,
    partnerClientId: out.partnerClientId,
    cooperationOrderId: out.cooperationOrderId ?? null,
  })
}
