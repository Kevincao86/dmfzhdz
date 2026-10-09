/**
 * 运营台轮询 ECS Postgres 客服消息（service_role）。
 * 增量轮询到新商户消息时推送飞书群通知（去重字段 feishu_notified_at）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { notifySupportUserMessageOnce } from '../supportFeishuNotify.js'
import { supportOpsHttpAuthorized } from '../supportOpsHttpAuth.js'
import {
  readSupportRelaySupabaseAdminEnv,
  supportRelayAdminFetch,
  supportRelaySupabaseEnvConfigureHint,
} from '../../../../web版/merchant-erp/vite-plugins/merchantSupabaseAdminEnv.js'

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

/** 只推最近窗口内的商户消息，避免首屏 400 条历史把飞书堵住 */
function freshUserRows(rows: DbRow[], sinceTs: number, incremental: boolean): DbRow[] {
  const cutoff = incremental && sinceTs > 0 ? sinceTs : Date.now() - 90_000
  return rows
    .filter((row) => {
      if (row.from_role !== 'user') return false
      if (!row.text.trim()) return false
      if (row.session_id.startsWith('__')) return false
      return row.ts > cutoff
    })
    .slice(-20)
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  if (!supportOpsHttpAuthorized(req.headers.authorization)) {
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
    const fresh = freshUserRows(rows, sinceTs, incremental)
    if (fresh.length > 0) {
      void Promise.all(
        fresh.map((row) =>
          notifySupportUserMessageOnce({
            sessionId: row.session_id,
            enterpriseName: row.enterprise_name ?? undefined,
            customerId: row.customer_id ?? undefined,
            text: row.text,
            ts: row.ts,
            clientMsgId: row.client_msg_id,
          }),
        ),
      ).catch(() => {})
    }
  } catch (e) {
    sendJson(res, 502, {
      ok: false,
      error: 'support_poll_failed',
      detail: e instanceof Error ? e.message : String(e),
      supabaseHost,
    })
  }
}
