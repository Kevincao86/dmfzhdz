/**
 * 达人招募小程序 PR ↔ 达人私信（ECS PostgREST RPC + REST，无 Realtime）
 */
import { PostgrestClient } from '@supabase/postgrest-js'

export type MpChatDb = PostgrestClient

export type MpChatRole = 'pr' | 'talent'

export type MpChatParticipantInput = {
  participantKey: string
  role: MpChatRole
  deviceSecret: string
  displayName: string
  avatarUrl?: string
  memberSnapshot?: Record<string, unknown>
}

export type MpChatSessionRow = {
  id: string
  session_key: string
  talent_key: string
  pr_key: string
  talent_name: string
  pr_name: string
  talent_avatar: string | null
  pr_avatar: string | null
  last_text: string
  last_ts: number
  talent_unread: number
  pr_unread: number
  updated_at: string
}

export type MpChatMessageRow = {
  id: string
  session_id: string
  from_role: MpChatRole
  sender_key: string
  text: string
  ts: number
  client_msg_id: string
}

/** 连 ECS PostgREST（/rest/v1），不初始化 Supabase Realtime，避免 Node 20 WebSocket 报错 */
export function createMpTalentChatAdmin(url: string, serviceRole: string): MpChatDb {
  const base = url.replace(/\/$/, '')
  return new PostgrestClient(`${base}/rest/v1`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  })
}

export async function upsertParticipant(
  sb: MpChatDb,
  p: MpChatParticipantInput,
): Promise<void> {
  const { error } = await sb.rpc('mp_talent_chat_upsert_participant', {
    p_key: p.participantKey,
    p_role: p.role,
    p_secret: p.deviceSecret,
    p_display_name: p.displayName,
    p_avatar_url: p.avatarUrl ?? null,
    p_member_snapshot: p.memberSnapshot ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function listSessions(
  sb: MpChatDb,
  participantKey: string,
  deviceSecret: string,
): Promise<MpChatSessionRow[]> {
  const { data, error } = await sb.rpc('mp_talent_chat_list_sessions', {
    p_key: participantKey,
    p_secret: deviceSecret,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as MpChatSessionRow[]
}

/** PR 侧：双方均发过消息的达人 participant_key 列表 */
export async function listPrMutualTalentKeys(
  sb: MpChatDb,
  prKey: string,
  prSecret: string,
): Promise<string[]> {
  const { data, error } = await sb.rpc('mp_talent_chat_pr_mutual_talent_keys', {
    p_key: prKey,
    p_secret: prSecret,
  })
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? data.map(String) : []
}

export async function fetchMessages(
  sb: MpChatDb,
  sessionId: string,
  participantKey: string,
  deviceSecret: string,
  sinceTs = 0,
): Promise<MpChatMessageRow[]> {
  const { data, error } = await sb.rpc('mp_talent_chat_fetch_messages', {
    p_session_id: sessionId,
    p_key: participantKey,
    p_secret: deviceSecret,
    p_since_ts: sinceTs,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as MpChatMessageRow[]
}

export async function sendMessage(
  sb: MpChatDb,
  input: {
    sessionId: string
    participantKey: string
    deviceSecret: string
    fromRole: MpChatRole
    text: string
    clientMsgId: string
    ts: number
  },
): Promise<void> {
  const { error } = await sb.rpc('mp_talent_chat_send_message', {
    p_session_id: input.sessionId,
    p_key: input.participantKey,
    p_secret: input.deviceSecret,
    p_from_role: input.fromRole,
    p_text: input.text,
    p_client_msg_id: input.clientMsgId,
    p_ts: input.ts,
  })
  if (error) throw new Error(error.message)
}

function isEnsureSessionRpcMissing(err: { message?: string; code?: string }): boolean {
  const m = String(err?.message || '')
  return (
    err?.code === 'PGRST202' ||
    /Could not find the function|schema cache|42883/i.test(m)
  )
}

export async function ensureSession(
  sb: MpChatDb,
  input: {
    talentKey: string
    prKey: string
    talentSecret: string
    prSecret: string
    talentName: string
    prName: string
    talentAvatar?: string
    prAvatar?: string
  },
): Promise<string> {
  const rpc7 = {
    p_talent_key: input.talentKey,
    p_pr_key: input.prKey,
    p_talent_secret: input.talentSecret,
    p_pr_secret: input.prSecret,
    p_talent_name: input.talentName,
    p_pr_name: input.prName,
    p_talent_avatar: input.talentAvatar ?? null,
  }
  const rpc8 = { ...rpc7, p_pr_avatar: input.prAvatar ?? null }

  let { data, error } = await sb.rpc('mp_talent_chat_ensure_session', rpc8)
  if (error && isEnsureSessionRpcMissing(error)) {
    const legacy = await sb.rpc('mp_talent_chat_ensure_session', rpc7)
    if (legacy.error) throw new Error(legacy.error.message)
    data = legacy.data
    if (String(input.prAvatar || '').trim()) {
      try {
        await upsertParticipant(sb, {
          participantKey: input.prKey,
          role: 'pr',
          deviceSecret: input.prSecret,
          displayName: input.prName,
          avatarUrl: input.prAvatar,
        })
      } catch {
        /* 旧库无 pr_avatar 列时仍可用 participants.avatar_url */
      }
    }
  } else if (error) {
    throw new Error(error.message)
  }
  return String(data)
}

export async function markSessionRead(
  sb: MpChatDb,
  sessionId: string,
  participantKey: string,
  deviceSecret: string,
): Promise<void> {
  const { error } = await sb.rpc('mp_talent_chat_mark_read', {
    p_session_id: sessionId,
    p_key: participantKey,
    p_secret: deviceSecret,
  })
  if (error) throw new Error(error.message)
}

export async function readParticipantProfile(
  sb: MpChatDb,
  participantKey: string,
): Promise<{ displayName: string; avatarUrl: string } | null> {
  const { data, error } = await sb
    .from('mp_talent_chat_participants')
    .select('display_name, avatar_url')
    .eq('participant_key', participantKey)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    displayName: String(data.display_name || '').trim(),
    avatarUrl: String(data.avatar_url || '').trim(),
  }
}

export async function readParticipantSecret(
  sb: MpChatDb,
  participantKey: string,
): Promise<string | null> {
  const { data, error } = await sb
    .from('mp_talent_chat_participants')
    .select('device_secret')
    .eq('participant_key', participantKey)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const sec = data && typeof data.device_secret === 'string' ? data.device_secret : ''
  return sec.length >= 16 ? sec : null
}
