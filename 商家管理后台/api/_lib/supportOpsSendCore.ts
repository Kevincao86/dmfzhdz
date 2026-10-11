/**
 * 客服 ops 回复写入 support_relay_messages（供 HTTP send 与飞书回调共用）。
 */
import {
  readSupportRelaySupabaseAdminEnv,
  supportRelayAdminFetch,
  supportRelaySupabaseEnvConfigureHint,
} from '../../../web版/merchant-erp/vite-plugins/merchantSupabaseAdminEnv.js'

export type SupportOpsSendInput = {
  sessionId: string
  text: string
  id: string
}

export type SupportOpsSendResult =
  | { ok: true; supabaseHost: string; verified: boolean }
  | {
      ok: false
      status: number
      error: string
      detail?: string
      missing?: string[]
      hint?: string
      supabaseHost?: string
    }

/** 运营已回复则把该会话划出排队。失败不影响回复本身。 */
async function markSupportQueueDone(
  supabaseUrl: string,
  serviceRole: string,
  sessionId: string,
): Promise<void> {
  if (!sessionId || sessionId === '__lq_support_queue__') return
  const ts = Date.now()
  const nonce = Math.random().toString(36).slice(2, 8)
  try {
    const r = await supportRelayAdminFetch(`${supabaseUrl}/rest/v1/support_relay_messages`, {
      method: 'POST',
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        session_id: '__lq_support_queue__',
        customer_id: null,
        enterprise_name: null,
        from_role: 'system',
        text: `LQQUEUE DONE ${sessionId}`,
        ts,
        client_msg_id: `q-done-${sessionId}-${ts}-${nonce}`,
        author_user_id: null,
        guest_fingerprint: 'lq-mp:support-queue',
      }),
    })
    if (!r.ok) await r.text()
  } catch {
    /* 排队划除失败不阻断客服回复 */
  }
}

export async function insertSupportOpsReply(input: SupportOpsSendInput): Promise<SupportOpsSendResult> {
  const sessionId = input.sessionId.trim()
  const text = input.text.trim()
  const id = input.id.trim()
  if (!sessionId || !text || !id) {
    return { ok: false, status: 400, error: 'missing_fields' }
  }

  const { supabaseUrl, serviceRole, missingParts } = readSupportRelaySupabaseAdminEnv()
  if (missingParts.length > 0) {
    return {
      ok: false,
      status: 503,
      error: 'supabase_service_not_configured',
      missing: missingParts,
      hint: supportRelaySupabaseEnvConfigureHint(missingParts),
    }
  }

  let guestFingerprint: string | null = null
  try {
    const fpQ = new URLSearchParams({
      session_id: `eq.${sessionId}`,
      guest_fingerprint: 'not.is.null',
      select: 'guest_fingerprint',
      order: 'ts.desc',
      limit: '1',
    })
    const fpRes = await supportRelayAdminFetch(`${supabaseUrl}/rest/v1/support_relay_messages?${fpQ}`, {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    })
    if (fpRes.ok) {
      const fpRows = (await fpRes.json()) as Array<{ guest_fingerprint?: string }>
      const hit = Array.isArray(fpRows) ? String(fpRows[0]?.guest_fingerprint || '').trim() : ''
      if (hit) guestFingerprint = hit
    }
  } catch {
    /* ignore */
  }
  if (!guestFingerprint && /^(lq-mp|lq-erp)[-:]/i.test(sessionId)) {
    guestFingerprint = `lq-mp:${sessionId.replace(/^(lq-mp|lq-erp)[-:]/i, '').slice(0, 48)}`
  }

  const row = {
    session_id: sessionId,
    customer_id: null,
    enterprise_name: null,
    from_role: 'ops',
    text,
    ts: Date.now(),
    client_msg_id: id,
    author_user_id: null,
    guest_fingerprint: guestFingerprint,
  }

  let supabaseHost = ''
  try {
    supabaseHost = new URL(supabaseUrl).host
  } catch {
    supabaseHost = supabaseUrl
  }

  try {
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
      const t = await r.text()
      // 幂等：同 session + client_msg_id 已存在视为成功
      if (/duplicate|unique|23505/i.test(t)) {
        await markSupportQueueDone(supabaseUrl, serviceRole, sessionId)
        return { ok: true, supabaseHost, verified: true }
      }
      return {
        ok: false,
        status: 502,
        error: 'supabase_insert_failed',
        detail: t.slice(0, 500),
        supabaseHost,
      }
    }

    const verifyQ = new URLSearchParams({
      session_id: `eq.${sessionId}`,
      client_msg_id: `eq.${id}`,
      select: 'from_role,text,ts,client_msg_id',
    })
    const verifyRes = await supportRelayAdminFetch(
      `${supabaseUrl}/rest/v1/support_relay_messages?${verifyQ}`,
      {
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
        },
      },
    )
    let verified = false
    if (verifyRes.ok) {
      const rows = (await verifyRes.json()) as unknown
      verified = Array.isArray(rows) && rows.length > 0
    }

    await markSupportQueueDone(supabaseUrl, serviceRole, sessionId)
    return { ok: true, supabaseHost, verified }
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: 'support_send_failed',
      detail: e instanceof Error ? e.message : String(e),
      supabaseHost,
    }
  }
}
