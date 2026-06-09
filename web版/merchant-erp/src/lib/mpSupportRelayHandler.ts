import {
  readSupportRelaySupabaseAdminEnv,
  supportRelayAdminFetch,
  supportRelaySupabaseEnvConfigureHint,
} from '../../vite-plugins/merchantSupabaseAdminEnv.js'

const MP_SESSION_RE = /^lq-mp[-:]/i
const MP_GUEST_FP_RE = /^lq-mp:/i
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
  return MP_SESSION_RE.test(s) && s.length >= 12
}

function validMpGuestFingerprint(fp: string): boolean {
  const s = String(fp || '').trim()
  return MP_GUEST_FP_RE.test(s) && s.length >= 16
}

async function adminFetchMessages(
  supabaseUrl: string,
  serviceRole: string,
  sessionId: string,
): Promise<Record<string, unknown>[]> {
  const q =
    `session_id=eq.${encodeURIComponent(sessionId)}` +
    '&select=from_role,text,ts,client_msg_id&order=ts.asc&limit=200'
  const r = await supportRelayAdminFetch(`${supabaseUrl}/rest/v1/support_relay_messages?${q}`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  })
  if (!r.ok) {
    throw new Error((await r.text()).slice(0, 400) || `fetch_failed_${r.status}`)
  }
  const data = (await r.json()) as unknown
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : []
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
  if (!validMpSessionId(sessionId)) {
    return { status: 400, data: { ok: false, error: 'invalid_session_id' } }
  }

  const guestFingerprint = String(body.guestFingerprint || '').trim()
  if (!validMpGuestFingerprint(guestFingerprint)) {
    return { status: 400, data: { ok: false, error: 'invalid_guest_fingerprint' } }
  }

  try {
    if (action === 'fetch_messages') {
      const messages = await adminFetchMessages(supabaseUrl, serviceRole, sessionId)
      return { status: 200, data: { ok: true, messages } }
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
      await adminInsertMessage(supabaseUrl, serviceRole, {
        session_id: sessionId,
        customer_id: String(body.customerId || '').trim() || null,
        enterprise_name: String(body.enterpriseName || '').trim() || null,
        from_role: fromRole,
        text,
        ts: Number(body.ts) || Date.now(),
        client_msg_id: clientMsgId,
        guest_fingerprint: guestFingerprint,
        author_user_id: null,
      })
      return { status: 200, data: { ok: true } }
    }

    return { status: 400, data: { ok: false, error: 'unknown_action' } }
  } catch (e) {
    return relayErrorResponse(e)
  }
}
