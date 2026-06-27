/**
 * 运营台轮询 ECS Postgres 客服消息（service_role）。
 * 增量轮询到新商户消息时推送飞书群通知（去重字段 feishu_notified_at）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendSupportMerchantMessageFeishu } from '../supportFeishuNotify.js'
import {
  readSupportRelaySupabaseAdminEnv,
  supportRelayAdminFetch,
  supportRelaySupabaseEnvConfigureHint,
} from '../../../web版/merchant-erp/vite-plugins/merchantSupabaseAdminEnv.js'

export const config = { maxDuration: 30 }

type DbRow = {
  session_id: string
  customer_id: string | null
  enterprise_name: string | null
  from_role: string
  text: string
  ts: number
  client_msg_id: string
}

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function serviceHeaders(serviceRole: string) {
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
  } as const
}

/** 原子 claim：仅首次将 feishu_notified_at 置位者返回 claimed */
async function claimSupportFeishuNotify(
  supabaseUrl: string,
  serviceRole: string,
  row: DbRow,
): Promise<'claimed' | 'already' | 'unavailable'> {
  const q = new URLSearchParams({
    session_id: `eq.${row.session_id}`,
    client_msg_id: `eq.${row.client_msg_id}`,
    from_role: 'eq.user',
    feishu_notified_at: 'is.null',
  })
  try {
    const r = await supportRelayAdminFetch(`${supabaseUrl}/rest/v1/support_relay_messages?${q}`, {
      method: 'PATCH',
      headers: {
        ...serviceHeaders(serviceRole),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ feishu_notified_at: new Date().toISOString() }),
    })
    if (!r.ok) {
      const detail = await r.text()
      if (/feishu_notified_at|42703|column|PGRST204/i.test(detail)) return 'unavailable'
      return 'unavailable'
    }
    const updated = (await r.json()) as unknown[]
    return Array.isArray(updated) && updated.length > 0 ? 'claimed' : 'already'
  } catch {
    return 'unavailable'
  }
}

async function notifyNewMerchantSupportMessages(
  supabaseUrl: string,
  serviceRole: string,
  rows: DbRow[],
): Promise<void> {
  for (const row of rows) {
    if (row.from_role !== 'user') continue
    const text = row.text.trim()
    if (!text) continue
    const claim = await claimSupportFeishuNotify(supabaseUrl, serviceRole, row)
    if (claim === 'already') continue
    await sendSupportMerchantMessageFeishu({
      sessionId: row.session_id,
      enterpriseName: row.enterprise_name ?? undefined,
      customerId: row.customer_id ?? undefined,
      text,
      ts: row.ts,
    })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const expected = process.env.MEOO_SUPPORT_OPS_HTTP_TOKEN?.trim()
  if (!expected) {
    sendJson(res, 503, {
      ok: false,
      error: 'support_poll_not_configured',
      hint: '配置 Vercel 环境变量 MEOO_SUPPORT_OPS_HTTP_TOKEN 与 SUPABASE_SERVICE_ROLE_KEY（及 MEOO_SUPABASE_ADMIN_URL=https://mofangdianai.com）。',
    })
    return
  }

  const auth = String(req.headers.authorization ?? '')
    .replace(/^Bearer\s+/i, '')
    .trim()
  if (auth !== expected) {
    sendJson(res, 401, { ok: false, error: 'unauthorized' })
    return
  }

  const { supabaseUrl, serviceRole, missingParts } = readSupportRelaySupabaseAdminEnv()
  if (missingParts.length > 0) {
    sendJson(res, 503, {
      ok: false,
      error: 'supabase_service_not_configured',
      missing: missingParts,
      hint: supportRelaySupabaseEnvConfigureHint(missingParts),
    })
    return
  }

  let supabaseHost = ''
  try {
    supabaseHost = new URL(supabaseUrl).host
  } catch {
    supabaseHost = supabaseUrl
  }

  const sinceRaw = typeof req.query.sinceTs === 'string' ? req.query.sinceTs : undefined
  const sinceTs = sinceRaw ? Number(sinceRaw) : 0
  const headers = serviceHeaders(serviceRole)

  try {
    let rows: DbRow[]
    const incremental = Number.isFinite(sinceTs) && sinceTs > 0
    if (!incremental) {
      const r = await supportRelayAdminFetch(
        `${supabaseUrl}/rest/v1/support_relay_messages?select=session_id,customer_id,enterprise_name,from_role,text,ts,client_msg_id&order=ts.desc&limit=400`,
        { headers },
      )
      if (!r.ok) {
        const t = await r.text()
        sendJson(res, 502, {
          ok: false,
          error: 'supabase_fetch_failed',
          detail: t.slice(0, 500),
          supabaseHost,
        })
        return
      }
      rows = ((await r.json()) as DbRow[]).reverse()
    } else {
      const r = await supportRelayAdminFetch(
        `${supabaseUrl}/rest/v1/support_relay_messages?select=session_id,customer_id,enterprise_name,from_role,text,ts,client_msg_id&ts=gt.${sinceTs}&order=ts.asc`,
        { headers },
      )
      if (!r.ok) {
        const t = await r.text()
        sendJson(res, 502, {
          ok: false,
          error: 'supabase_fetch_failed',
          detail: t.slice(0, 500),
          supabaseHost,
        })
        return
      }
      rows = (await r.json()) as DbRow[]
    }

    if (incremental && rows.length > 0) {
      await notifyNewMerchantSupportMessages(supabaseUrl, serviceRole, rows)
    }

    const messages = rows.map((row) => ({
      type: 'chat' as const,
      sessionId: row.session_id,
      from: row.from_role as 'user' | 'bot' | 'agent' | 'system' | 'ops',
      text: row.text,
      ts: row.ts,
      id: row.client_msg_id,
      customerId: row.customer_id ?? undefined,
      enterpriseName: row.enterprise_name ?? undefined,
    }))

    sendJson(res, 200, { ok: true, messages, supabaseHost })
  } catch (e) {
    sendJson(res, 502, {
      ok: false,
      error: 'support_poll_failed',
      detail: e instanceof Error ? e.message : String(e),
      supabaseHost,
    })
  }
}
