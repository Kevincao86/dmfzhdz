/**
 * 运营台轮询 Supabase 客服消息（service_role，仅服务端 Edge）。
 * 增量轮询到新商户消息时推送飞书群通知（去重字段 feishu_notified_at）。
 */
import { sendSupportMerchantMessageFeishu } from './supportFeishuNotify.js'

export const config = { runtime: 'edge' }

type DbRow = {
  session_id: string
  customer_id: string | null
  enterprise_name: string | null
  from_role: string
  text: string
  ts: number
  client_msg_id: string
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
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
    const r = await fetch(`${supabaseUrl}/rest/v1/support_relay_messages?${q}`, {
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return json(405, { ok: false, error: 'method_not_allowed' })
  }

  const expected = process.env.MEOO_SUPPORT_OPS_HTTP_TOKEN?.trim()
  if (!expected) {
    return json(503, {
      ok: false,
      error: 'support_poll_not_configured',
      hint: '配置 Vercel 环境变量 MEOO_SUPPORT_OPS_HTTP_TOKEN 与 SUPABASE_SERVICE_ROLE_KEY（及 SUPABASE_URL / VITE_SUPABASE_URL）。',
    })
  }

  const auth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')?.trim()
  if (auth !== expected) {
    return json(401, { ok: false, error: 'unauthorized' })
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)?.trim().replace(/\/$/, '')
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRole) {
    return json(503, {
      ok: false,
      error: 'supabase_service_not_configured',
      hint: '在商家管理后台 Vercel 项目中配置 SUPABASE_SERVICE_ROLE_KEY 与 SUPABASE_URL（或 VITE_SUPABASE_URL）。',
    })
  }

  const url = new URL(req.url)
  const sinceRaw = url.searchParams.get('sinceTs')
  const sinceTs = sinceRaw ? Number(sinceRaw) : 0
  const headers = serviceHeaders(serviceRole)

  try {
    let rows: DbRow[]
    const incremental = Number.isFinite(sinceTs) && sinceTs > 0
    if (!incremental) {
      const r = await fetch(
        `${supabaseUrl}/rest/v1/support_relay_messages?select=session_id,customer_id,enterprise_name,from_role,text,ts,client_msg_id&order=ts.desc&limit=400`,
        { headers },
      )
      if (!r.ok) {
        const t = await r.text()
        return json(502, { ok: false, error: 'supabase_fetch_failed', detail: t.slice(0, 500) })
      }
      rows = ((await r.json()) as DbRow[]).reverse()
    } else {
      const r = await fetch(
        `${supabaseUrl}/rest/v1/support_relay_messages?select=session_id,customer_id,enterprise_name,from_role,text,ts,client_msg_id&ts=gt.${sinceTs}&order=ts.asc`,
        { headers },
      )
      if (!r.ok) {
        const t = await r.text()
        return json(502, { ok: false, error: 'supabase_fetch_failed', detail: t.slice(0, 500) })
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

    return json(200, { ok: true, messages })
  } catch (e) {
    return json(502, {
      ok: false,
      error: 'support_poll_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}
