import {
  createMpTalentChatAdmin,
  ensureSession,
  fetchMessages,
  listSessions,
  listPrMutualTalentKeys,
  markSessionRead,
  readParticipantProfile,
  readParticipantSecret,
  sendMessage,
  upsertParticipant,
  type MpChatRole,
} from './mpTalentChatSupabase.js'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../../vite-plugins/merchantSupabaseAdminEnv.js'

function chatErrorResponse(e: unknown): { status: number; data: Record<string, unknown> } {
  const msg = e instanceof Error ? e.message : String(e)
  const hint = /fetch failed|ECONNREFUSED|54321/i.test(msg)
    ? '本地 Supabase 未启动：先开 Docker，在项目根目录执行 supabase start；或把 .env.local 改为云端项目的 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'
    : /Could not find|PGRST202|schema cache|does not exist|42P01/i.test(msg)
      ? '请确认已在当前 Supabase 项目执行迁移 20260528100000_mp_talent_chat.sql，并在 Dashboard → Settings → API → Reload schema'
      : '请核对 merchant-erp .env.local 的 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 与迁移是否为同一项目'
  return {
    status: 500,
    data: {
      ok: false,
      error: 'chat_supabase_error',
      detail: msg.slice(0, 800),
      hint,
    },
  }
}

export type MpTalentChatBody = {
  action?: string
  participantKey?: string
  deviceSecret?: string
  role?: MpChatRole
  displayName?: string
  avatarUrl?: string
  memberSnapshot?: Record<string, unknown>
  sessionId?: string
  sinceTs?: number
  text?: string
  clientMsgId?: string
  fromRole?: MpChatRole
  ts?: number
  talentKey?: string
  prKey?: string
  talentSecret?: string
  prSecret?: string
  talentName?: string
  prName?: string
  talentAvatar?: string
  prAvatar?: string
}

export async function handleMpTalentChatBody(
  body: MpTalentChatBody,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    return {
      status: 503,
      data: {
        ok: false,
        error: 'supabase_admin_not_configured',
        missing: missingParts,
        hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
      },
    }
  }

  const action = String(body.action || '').trim()
  let sb
  try {
    sb = createMpTalentChatAdmin(supabaseUrl, serviceRole)
  } catch (e) {
    return chatErrorResponse(e)
  }

  try {
  if (action === 'sync_profile') {
    const participantKey = String(body.participantKey || '').trim()
    const deviceSecret = String(body.deviceSecret || '').trim()
    const role = body.role === 'pr' ? 'pr' : body.role === 'talent' ? 'talent' : null
    if (!participantKey || !deviceSecret || !role) {
      return { status: 400, data: { ok: false, error: 'invalid_participant' } }
    }
    if (deviceSecret.length < 16) {
      return { status: 400, data: { ok: false, error: 'invalid_participant', detail: 'deviceSecret 长度不足' } }
    }
    await upsertParticipant(sb, {
      participantKey,
      role,
      deviceSecret,
      displayName: String(body.displayName || '').trim() || (role === 'pr' ? 'PR' : '达人'),
      avatarUrl: body.avatarUrl,
      memberSnapshot: body.memberSnapshot,
    })
    return { status: 200, data: { ok: true } }
  }

  const participantKey = String(body.participantKey || '').trim()
  const deviceSecret = String(body.deviceSecret || '').trim()
  if (!participantKey || !deviceSecret) {
    return { status: 400, data: { ok: false, error: 'invalid_credentials' } }
  }

  if (action === 'list_sessions') {
    const sessions = await listSessions(sb, participantKey, deviceSecret)
    return { status: 200, data: { ok: true, sessions } }
  }

  if (action === 'mutual_talent_keys') {
    const talentKeys = await listPrMutualTalentKeys(sb, participantKey, deviceSecret)
    return { status: 200, data: { ok: true, talentKeys } }
  }

  if (action === 'fetch_messages') {
    const sessionId = String(body.sessionId || '').trim()
    if (!sessionId) {
      return { status: 400, data: { ok: false, error: 'session_required' } }
    }
    const messages = await fetchMessages(
      sb,
      sessionId,
      participantKey,
      deviceSecret,
      Number(body.sinceTs) || 0,
    )
    return { status: 200, data: { ok: true, messages } }
  }

  if (action === 'send_message') {
    const sessionId = String(body.sessionId || '').trim()
    const text = String(body.text || '').trim()
    const clientMsgId = String(body.clientMsgId || '').trim()
    const fromRole = body.fromRole === 'pr' ? 'pr' : body.fromRole === 'talent' ? 'talent' : null
    const ts = Number(body.ts) || Date.now()
    if (!sessionId || !text || !clientMsgId || !fromRole) {
      return { status: 400, data: { ok: false, error: 'invalid_message' } }
    }
    await sendMessage(sb, {
      sessionId,
      participantKey,
      deviceSecret,
      fromRole,
      text,
      clientMsgId,
      ts,
    })
    return { status: 200, data: { ok: true } }
  }

  if (action === 'mark_read') {
    const sessionId = String(body.sessionId || '').trim()
    if (!sessionId) {
      return { status: 400, data: { ok: false, error: 'session_required' } }
    }
    await markSessionRead(sb, sessionId, participantKey, deviceSecret)
    return { status: 200, data: { ok: true } }
  }

  if (action === 'ensure_session') {
    const talentKey = String(body.talentKey || '').trim()
    const prKey = String(body.prKey || '').trim()
    const talentSecret = String(body.talentSecret || deviceSecret).trim()
    const prSecret = String(body.prSecret || deviceSecret).trim()
    if (!talentKey || !prKey) {
      return { status: 400, data: { ok: false, error: 'invalid_session_parties' } }
    }
    await upsertParticipant(sb, {
      participantKey: talentKey,
      role: 'talent',
      deviceSecret: talentSecret,
      displayName: String(body.talentName || '').trim() || '达人',
      avatarUrl: body.talentAvatar,
    })
    await upsertParticipant(sb, {
      participantKey: prKey,
      role: 'pr',
      deviceSecret: prSecret,
      displayName: String(body.prName || '').trim() || 'PR',
      avatarUrl: body.prAvatar,
    })
    const sessionId = await ensureSession(sb, {
      talentKey,
      prKey,
      talentSecret,
      prSecret,
      talentName: String(body.talentName || '').trim(),
      prName: String(body.prName || '').trim(),
      talentAvatar: body.talentAvatar,
      prAvatar: body.prAvatar,
    })
    return { status: 200, data: { ok: true, sessionId } }
  }

  if (action === 'ensure_session_from_talent') {
    const talentKey = String(body.talentKey || body.participantKey || '').trim()
    const prKey = String(body.prKey || '').trim()
    const talentSecret = String(body.deviceSecret || '').trim()
    if (!talentKey || !prKey || !talentSecret) {
      return { status: 400, data: { ok: false, error: 'invalid_session_parties' } }
    }
    await upsertParticipant(sb, {
      participantKey: talentKey,
      role: 'talent',
      deviceSecret: talentSecret,
      displayName: String(body.talentName || '').trim() || '达人',
      avatarUrl: body.talentAvatar,
    })
    const prSecret = await readParticipantSecret(sb, prKey)
    if (!prSecret) {
      return {
        status: 404,
        data: {
          ok: false,
          error: 'pr_not_ready',
          hint: '招募方尚未在消息页登录过，请稍后再试或由 PR 先发起沟通',
        },
      }
    }
    const prProf = await readParticipantProfile(sb, prKey)
    const sessionId = await ensureSession(sb, {
      talentKey,
      prKey,
      talentSecret,
      prSecret,
      talentName: String(body.talentName || '').trim(),
      prName: String(body.prName || prProf?.displayName || '').trim() || 'PR',
      talentAvatar: body.talentAvatar,
      prAvatar: prProf?.avatarUrl,
    })
    return { status: 200, data: { ok: true, sessionId } }
  }

  return { status: 400, data: { ok: false, error: 'unknown_action' } }
  } catch (e) {
    return chatErrorResponse(e)
  }
}
