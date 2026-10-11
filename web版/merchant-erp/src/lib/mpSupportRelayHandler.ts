import { notifySupportUserMessageOnce } from '../../../../商家管理后台/api/_lib/supportFeishuNotify.js'
import {
  readSupportRelaySupabaseAdminEnv,
  supportRelayAdminFetch,
  supportRelaySupabaseEnvConfigureHint,
} from '../../vite-plugins/merchantSupabaseAdminEnv.js'

const MP_SESSION_RE = /^(lq-mp|lq-erp)[-:]/i
const MP_GUEST_FP_RE = /^lq-mp:/i
/** 人工排队共用会话。网页客服直写此 id；小程序走本接口，不能按普通会话号拒绝。 */
const MP_QUEUE_SESSION = '__lq_support_queue__'
const ALLOWED_FROM = new Set(['user', 'bot', 'agent', 'system'])

export type MpSupportRelayBody = {
  action?: string
  sessionId?: string
  guestFingerprint?: string
  fromRole?: string
  text?: string
  clientMsgId?: string
  ts?: number
  customerId?: string
  enterpriseName?: string
}

function relayErrorResponse(e: unknown): { status: number; data: Record<string, unknown> } {
  const msg = e instanceof Error ? e.message : String(e)
  const hint = /fetch failed|ECONNREFUSED|54321/i.test(msg)
    ? '本地 Supabase 未启动：先开 Docker 并 supabase start；或 .env.local 使用云端 SUPABASE_URL + SERVICE_ROLE_KEY'
    : /Could not find|PGRST202|schema cache|does not exist|42P01/i.test(msg)
      ? '请确认已执行迁移 support_relay_messages 与 20260514100000_support_relay_guest_login_page.sql'
      : '请核对 merchant-erp .env.local 的 Supabase 配置'
  return {
    status: 500,
    data: {
      ok: false,
      error: 'support_relay_supabase_error',
      detail: msg.slice(0, 800),
      hint,
    },
  }
}

function validMpSessionId(sessionId: string): boolean {
  const s = String(sessionId || '').trim()
  if (s === MP_QUEUE_SESSION) return true
  return MP_SESSION_RE.test(s) && s.length >= 12
}

function validMpGuestFingerprint(fp: string): boolean {
  const s = String(fp || '').trim()
  return MP_GUEST_FP_RE.test(s) && s.length >= 16
}

function normalizeRelayRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return []
  return (data as Record<string, unknown>[])
    .map((row) => ({
      from_role: row.from_role,
      text: row.text,
      ts: row.ts,
      client_msg_id: row.client_msg_id,
    }))
    .filter((row) => row.client_msg_id != null && row.from_role != null)
}

/**
 * 优先 service_role 按 session_id 直查（必含 from_role=ops 运营回复）。
 * 旧版 RPC 若按行过滤 guest_fingerprint，会丢掉未带指纹的 ops 行。
 */
async function adminFetchMessages(
  supabaseUrl: string,
  serviceRole: string,
  sessionId: string,
  guestFingerprint: string,
): Promise<Record<string, unknown>[]> {
  const headers = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
  }

  const q =
    `session_id=eq.${encodeURIComponent(sessionId)}` +
    '&select=from_role,text,ts,client_msg_id,guest_fingerprint&order=ts.asc&limit=200'
  const r = await supportRelayAdminFetch(`${supabaseUrl}/rest/v1/support_relay_messages?${q}`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  })
  if (r.ok) {
    const rows = (await r.json()) as Record<string, unknown>[]
    if (Array.isArray(rows) && rows.length > 0) {
      const fp = String(guestFingerprint || '').trim()
      const sessionOwned =
        !fp ||
        rows.some((row) => String(row.guest_fingerprint || '').trim() === fp) ||
        rows.some((row) => String(row.from_role || '') === 'ops')
      if (sessionOwned) return normalizeRelayRows(rows)
    }
    if (Array.isArray(rows)) return normalizeRelayRows(rows)
  }

  const directErr = r.ok ? '' : (await r.text()).slice(0, 400)
  const rpcRes = await supportRelayAdminFetch(`${supabaseUrl}/rest/v1/rpc/support_relay_guest_fetch_session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_session_id: sessionId,
      p_guest_fingerprint: guestFingerprint,
    }),
  })
  if (rpcRes.ok) {
    return normalizeRelayRows(await rpcRes.json())
  }
  const rpcErr = (await rpcRes.text()).slice(0, 400)
  throw new Error(directErr || rpcErr || `fetch_failed_${r.status}`)
}

async function adminInsertMessage(
  supabaseUrl: string,
  serviceRole: string,
  row: Record<string, unknown>,
): Promise<void> {
  const r = await supportRelayAdminFetch(`${supabaseUrl}/rest/v1/support_relay_messages`, {
    method: 'POST',
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  })
  if (!r.ok) {
    throw new Error((await r.text()).slice(0, 400) || `insert_failed_${r.status}`)
  }
}

const QUEUE_FP = 'lq-mp:support-queue'

type QueueMark = { sid: string; kind: 'open' | 'done'; ts: number }

function validQueueUserSessionId(sessionId: string): boolean {
  const s = String(sessionId || '').trim()
  if (!s || s === MP_QUEUE_SESSION) return false
  if (s.length < 8 || s.length > 120) return false
  return !/[\s\r\n]/.test(s)
}

function normalizeQueueFingerprint(fp: string): string {
  const s = String(fp || '').trim()
  if (validMpGuestFingerprint(s)) return s
  const body = s.replace(/^lq-mp:/i, '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)
  const next = `lq-mp:${body || 'queue'}`
  return next.length >= 16 ? next : `lq-mp:queue_${Date.now()}`
}

function parseQueueMark(text: string, ts: number): QueueMark | null {
  const raw = String(text || '')
  if (raw.startsWith('LQQUEUE OPEN ')) {
    const sid = raw.slice('LQQUEUE OPEN '.length).trim()
    return sid ? { sid, kind: 'open', ts } : null
  }
  if (raw.startsWith('LQQUEUE DONE ')) {
    const sid = raw.slice('LQQUEUE DONE '.length).trim()
    return sid ? { sid, kind: 'done', ts } : null
  }
  return null
}

/** 同一会话以时间更晚的 OPEN/DONE 为准；同一时刻 DONE 优先，避免结束被同毫秒的入队盖住。 */
function latestQueueMarks(rows: Array<{ text?: unknown; ts?: unknown }>): Map<string, QueueMark> {
  const latest = new Map<string, QueueMark>()
  const sorted = [...rows].sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0))
  for (const row of sorted) {
    const mark = parseQueueMark(String(row.text || ''), Number(row.ts) || 0)
    if (!mark) continue
    const prev = latest.get(mark.sid)
    const newer =
      !prev ||
      mark.ts > prev.ts ||
      (mark.ts === prev.ts && mark.kind === 'done' && prev.kind === 'open')
    if (newer) latest.set(mark.sid, mark)
  }
  return latest
}

function waitingQueue(latest: Map<string, QueueMark>): Array<{ sid: string; ts: number }> {
  const waiting: Array<{ sid: string; ts: number }> = []
  for (const mark of latest.values()) {
    if (mark.kind === 'open') waiting.push({ sid: mark.sid, ts: mark.ts })
  }
  waiting.sort((a, b) => a.ts - b.ts || a.sid.localeCompare(b.sid))
  return waiting
}

async function fetchQueueRows(
  supabaseUrl: string,
  serviceRole: string,
): Promise<Array<{ text?: unknown; ts?: unknown }>> {
  const q =
    `session_id=eq.${encodeURIComponent(MP_QUEUE_SESSION)}` +
    '&select=text,ts&order=ts.desc&limit=500'
  const r = await supportRelayAdminFetch(`${supabaseUrl}/rest/v1/support_relay_messages?${q}`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  })
  if (!r.ok) {
    throw new Error((await r.text()).slice(0, 400) || `queue_fetch_failed_${r.status}`)
  }
  const rows = (await r.json()) as Array<{ text?: unknown; ts?: unknown }>
  return Array.isArray(rows) ? rows : []
}

async function insertQueueMark(
  supabaseUrl: string,
  serviceRole: string,
  kind: 'open' | 'done',
  sessionId: string,
  guestFingerprint: string,
): Promise<void> {
  const ts = Date.now()
  const nonce = Math.random().toString(36).slice(2, 8)
  const prefix = kind === 'open' ? 'q-open' : 'q-done'
  const label = kind === 'open' ? 'LQQUEUE OPEN ' : 'LQQUEUE DONE '
  try {
    await adminInsertMessage(supabaseUrl, serviceRole, {
      session_id: MP_QUEUE_SESSION,
      customer_id: null,
      enterprise_name: null,
      from_role: 'system',
      text: `${label}${sessionId}`,
      ts,
      client_msg_id: `${prefix}-${sessionId}-${ts}-${nonce}`,
      guest_fingerprint: guestFingerprint || QUEUE_FP,
      author_user_id: null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/duplicate|23505|unique/i.test(msg)) throw e
  }
}

async function sessionAnsweredSince(
  supabaseUrl: string,
  serviceRole: string,
  sessionId: string,
  openTs: number,
): Promise<boolean> {
  const q =
    `session_id=eq.${encodeURIComponent(sessionId)}` +
    `&from_role=eq.ops&ts=gte.${Math.max(0, openTs)}&select=ts&limit=1`
  const r = await supportRelayAdminFetch(`${supabaseUrl}/rest/v1/support_relay_messages?${q}`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  })
  if (!r.ok) return false
  const rows = (await r.json()) as unknown
  return Array.isArray(rows) && rows.length > 0
}

/** 客服已经回复过、但队列里还挂着 OPEN 的人，补一条 DONE，避免继续占「前方 N 人」。 */
async function reconcileAnsweredQueue(
  supabaseUrl: string,
  serviceRole: string,
): Promise<void> {
  const waiting = waitingQueue(latestQueueMarks(await fetchQueueRows(supabaseUrl, serviceRole))).slice(0, 40)
  for (let i = 0; i < waiting.length; i += 8) {
    const part = waiting.slice(i, i + 8)
    const hits = await Promise.all(
      part.map(async (item) => ({
        sid: item.sid,
        answered: await sessionAnsweredSince(supabaseUrl, serviceRole, item.sid, item.ts),
      })),
    )
    for (const hit of hits) {
      if (hit.answered) {
        await insertQueueMark(supabaseUrl, serviceRole, 'done', hit.sid, QUEUE_FP)
      }
    }
  }
}

async function handleSupportQueueAction(
  action: string,
  body: MpSupportRelayBody,
  supabaseUrl: string,
  serviceRole: string,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const sessionId = String(body.sessionId || '').trim()
  if (!validQueueUserSessionId(sessionId)) {
    return { status: 400, data: { ok: false, error: 'invalid_session_id' } }
  }
  const guestFingerprint = normalizeQueueFingerprint(String(body.guestFingerprint || ''))
  if (action === 'queue_leave') {
    await insertQueueMark(supabaseUrl, serviceRole, 'done', sessionId, guestFingerprint)
    return { status: 200, data: { ok: true } }
  }
  if (action === 'queue_join') {
    await reconcileAnsweredQueue(supabaseUrl, serviceRole)
    const current = latestQueueMarks(await fetchQueueRows(supabaseUrl, serviceRole)).get(sessionId)
    if (!current || current.kind === 'done') {
      await insertQueueMark(supabaseUrl, serviceRole, 'open', sessionId, guestFingerprint)
    }
    const waiting = waitingQueue(latestQueueMarks(await fetchQueueRows(supabaseUrl, serviceRole)))
    const idx = waiting.findIndex((item) => item.sid === sessionId)
    return {
      status: 200,
      data: { ok: true, ahead: idx <= 0 ? 0 : idx, waiting: waiting.length },
    }
  }
  return { status: 400, data: { ok: false, error: 'unknown_action' } }
}

export async function handleMpSupportRelayBody(
  body: MpSupportRelayBody,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const { supabaseUrl, serviceRole, missingParts } = readSupportRelaySupabaseAdminEnv()
  if (missingParts.length > 0) {
    return {
      status: 503,
      data: {
        ok: false,
        error: 'supabase_admin_not_configured',
        missing: missingParts,
        hint: supportRelaySupabaseEnvConfigureHint(missingParts),
      },
    }
  }

  const action = String(body.action || '').trim()
  const sessionId = String(body.sessionId || '').trim()
  if (action === 'queue_join' || action === 'queue_leave') {
    try {
      return await handleSupportQueueAction(action, body, supabaseUrl, serviceRole)
    } catch (e) {
      return relayErrorResponse(e)
    }
  }
  if (!validMpSessionId(sessionId)) {
    return { status: 400, data: { ok: false, error: 'invalid_session_id' } }
  }

  const guestFingerprint = String(body.guestFingerprint || '').trim()
  if (!validMpGuestFingerprint(guestFingerprint)) {
    return { status: 400, data: { ok: false, error: 'invalid_guest_fingerprint' } }
  }

  try {
    if (action === 'fetch_messages') {
      const messages = await adminFetchMessages(supabaseUrl, serviceRole, sessionId, guestFingerprint)
      let supabaseHost = ''
      try {
        supabaseHost = new URL(supabaseUrl).host
      } catch {
        supabaseHost = supabaseUrl
      }
      return { status: 200, data: { ok: true, messages, supabaseHost } }
    }

    if (action === 'send_message') {
      const fromRole = String(body.fromRole || '').trim()
      if (!ALLOWED_FROM.has(fromRole)) {
        return { status: 400, data: { ok: false, error: 'invalid_from_role' } }
      }
      const text = String(body.text || '').trim()
      const clientMsgId = String(body.clientMsgId || '').trim()
      if (!text || !clientMsgId) {
        return { status: 400, data: { ok: false, error: 'missing_text_or_id' } }
      }
      const ts = Number(body.ts) || Date.now()
      await adminInsertMessage(supabaseUrl, serviceRole, {
        session_id: sessionId,
        customer_id: String(body.customerId || '').trim() || null,
        enterprise_name: String(body.enterpriseName || '').trim() || null,
        from_role: fromRole,
        text,
        ts,
        client_msg_id: clientMsgId,
        guest_fingerprint: guestFingerprint,
        author_user_id: null,
      })
      if (fromRole === 'user') {
        void notifySupportUserMessageOnce({
          sessionId,
          customerId: String(body.customerId || '').trim() || undefined,
          enterpriseName: String(body.enterpriseName || '').trim() || undefined,
          text,
          ts,
          clientMsgId,
        }).catch(() => {})
      }
      return { status: 200, data: { ok: true } }
    }

    return { status: 400, data: { ok: false, error: 'unknown_action' } }
  } catch (e) {
    return relayErrorResponse(e)
  }
}
