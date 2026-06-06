import { mpErpApiBase } from '../mpApiBase'
import { getToken } from '../mpSession'
import { buildMpErpApiUrl } from '../mpApiBase'
import {
  bootstrapTalentSecret,
  getCurrentParticipant,
  talentParticipantKey,
  type ChatParticipant,
  peerDisplay,
  unreadForMe,
} from './participant'
import { fetchMpRegistry } from '../mpApi'
import {
  canonicalTalentMemberIdFromRegistry,
  collectTalentChatKeyCandidates,
  participantForSession,
  sessionAuthKeyForMe,
  talentChatParticipantForKey,
} from './talentChatKeys'

export { participantForSession, sessionAuthKeyForMe }

const CHAT_PATH = '/api/meoo-ops-mp-talent-chat'
export const POLL_MS = 2500

export type ChatSession = Record<string, unknown>
export type ChatMessageRow = {
  id?: string
  client_msg_id?: string
  from_role: string
  text: string
  ts: number
}

export type UiChatMessage = {
  id: string
  fromRole: string
  text: string
  ts: number
  at: string
  mine: boolean
}

function throwApiError(data: Record<string, unknown>) {
  const detail = String(data.detail || '').trim()
  const hint = String(data.hint || '').trim()
  const code = String(data.error || 'request_failed').trim()
  const msg = [detail, hint, code].filter(Boolean).join(' — ')
  throw new Error(msg || '请求失败')
}

async function viaApi(payload: Record<string, unknown>) {
  const base = mpErpApiBase()
  if (!base) throw new Error('未配置 VITE_MP_API_BASE')
  const res = await fetch(buildMpErpApiUrl(base, CHAT_PATH), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { 'X-Mp-Session': getToken()! } : {}),
    },
    body: JSON.stringify(payload),
  })
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok || data.ok === false) throwApiError(data)
  return data
}

function sanitizeSnapshot(s: unknown) {
  if (!s || typeof s !== 'object') return null
  try {
    return JSON.parse(JSON.stringify(s)) as Record<string, unknown>
  } catch {
    return null
  }
}

export function canChat() {
  return !!mpErpApiBase()
}

export function formatChatError(err: unknown): string {
  const msg = String(err instanceof Error ? err.message : err || '未知错误')
  if (/42P01|relation .* does not exist|undefined table/i.test(msg)) {
    return 'ECS 数据库表未就绪：请执行迁移 20260528100000_mp_talent_chat.sql'
  }
  if (/fetch failed|ECONNREFUSED|8888|erp-api/i.test(msg)) {
    return 'ECS 暂不可用，请稍后重试或联系管理员检查消息服务。'
  }
  if (/pr_not_ready/i.test(msg)) {
    return '招募方尚未登录过消息页，请稍后再试，或由 PR 先发起会话'
  }
  if (/meoo_ops_mp_talent_chat_failed/i.test(msg)) {
    const inner = msg.replace(/^meoo_ops_mp_talent_chat_failed\s*/i, '').trim()
    if (inner && inner.length > 8) return inner
    return '消息服务暂时不可用，请稍后重试。'
  }
  return msg
}

export async function syncProfile(p?: ChatParticipant) {
  const part = p || getCurrentParticipant()
  await viaApi({
    action: 'sync_profile',
    participantKey: part.participantKey,
    deviceSecret: part.deviceSecret,
    role: part.role,
    displayName: part.displayName,
    avatarUrl: part.avatarUrl,
    memberSnapshot: sanitizeSnapshot(part.memberSnapshot),
  })
}

export async function listSessions(part?: ChatParticipant) {
  const p = part || getCurrentParticipant()
  const data = await viaApi({
    action: 'list_sessions',
    participantKey: p.participantKey,
    deviceSecret: p.deviceSecret,
  })
  return (data.sessions || []) as ChatSession[]
}

/** 达人端：按多个历史 participant_key 尝试拉取会话（修复 PR 用 TL/LQ id 建会话） */
export async function listSessionsForMe(part?: ChatParticipant) {
  const base = part || getCurrentParticipant()
  if (base.role === 'pr') return listSessions(base)

  let reg: Parameters<typeof collectTalentChatKeyCandidates>[0] = null
  try {
    reg = (await fetchMpRegistry()) as Parameters<typeof collectTalentChatKeyCandidates>[0]
  } catch {
    /* 无 registry 时仍用本地 id 候选 */
  }

  const tried = new Set<string>()
  let best: ChatSession[] = []

  for (const key of collectTalentChatKeyCandidates(reg)) {
    if (tried.has(key)) continue
    tried.add(key)
    const p = key === base.participantKey ? base : talentChatParticipantForKey(base, key)
    try {
      await syncProfile(p)
      const rows = await listSessions(p)
      if (rows.length > best.length) best = rows
    } catch {
      /* 尝试下一个 key */
    }
  }

  if (!best.length) {
    try {
      return await listSessions(base)
    } catch {
      return []
    }
  }
  return best
}

export async function fetchMessages(sessionId: string, sinceTs: number, part?: ChatParticipant) {
  const p = part || getCurrentParticipant()
  const data = await viaApi({
    action: 'fetch_messages',
    sessionId,
    participantKey: p.participantKey,
    deviceSecret: p.deviceSecret,
    sinceTs: sinceTs || 0,
  })
  return (data.messages || []) as ChatMessageRow[]
}

export async function sendMessage(sessionId: string, text: string, clientMsgId: string, part?: ChatParticipant) {
  const p = part || getCurrentParticipant()
  const ts = Date.now()
  await viaApi({
    action: 'send_message',
    sessionId,
    participantKey: p.participantKey,
    deviceSecret: p.deviceSecret,
    fromRole: p.role,
    text,
    clientMsgId,
    ts,
  })
  return ts
}

export async function markRead(sessionId: string, part?: ChatParticipant) {
  const p = part || getCurrentParticipant()
  await viaApi({
    action: 'mark_read',
    sessionId,
    participantKey: p.participantKey,
    deviceSecret: p.deviceSecret,
  })
}

async function ensureSessionRpc(input: Record<string, string>) {
  const data = await viaApi({
    action: 'ensure_session',
    participantKey: input.callerKey || input.prKey,
    deviceSecret: input.callerSecret || input.prSecret,
    talentKey: input.talentKey,
    prKey: input.prKey,
    talentSecret: input.talentSecret,
    prSecret: input.prSecret,
    talentName: input.talentName,
    prName: input.prName,
    talentAvatar: input.talentAvatar,
    prAvatar: input.prAvatar,
  })
  return String(data.sessionId)
}

export async function ensureSessionWithTalent(
  talent: {
    id: string
    talentMemberId?: string
    name?: string
    avatar?: string
  },
  reg?: { mpTalentMembers?: Record<string, unknown>[]; talentLibraryEntries?: Record<string, unknown>[] } | null,
) {
  const me = getCurrentParticipant()
  if (me.role !== 'pr') throw new Error('请切换为 PR 身份后发起沟通')
  const rawId = talent.talentMemberId || talent.id
  const memberId = canonicalTalentMemberIdFromRegistry(reg || null, rawId) || rawId
  const talentKey = talentParticipantKey({ id: memberId })
  const talentSecret = bootstrapTalentSecret(talentKey)
  return ensureSessionRpc({
    talentKey,
    prKey: me.participantKey,
    talentSecret,
    prSecret: me.deviceSecret,
    talentName: talent.name || '达人',
    prName: me.displayName,
    talentAvatar: talent.avatar || '',
    prAvatar: me.avatarUrl || '',
    callerKey: me.participantKey,
    callerSecret: me.deviceSecret,
  })
}

export async function ensureSessionWithPr(pr: {
  prParticipantKey?: string
  prKey?: string
  prWxNickName?: string
  prDisplayName?: string
  prName?: string
  prWxAvatarUrl?: string
}) {
  const me = getCurrentParticipant()
  if (me.role !== 'talent') throw new Error('请切换为达人身份后联系招募方')
  const prKey = String(pr.prParticipantKey || pr.prKey || '').trim()
  if (!prKey) throw new Error('该招募单暂未绑定 PR 私信，请稍后再试')
  const prName = String(pr.prWxNickName || pr.prDisplayName || pr.prName || '招募方').trim() || 'PR'
  const data = await viaApi({
    action: 'ensure_session_from_talent',
    participantKey: me.participantKey,
    deviceSecret: me.deviceSecret,
    talentKey: me.participantKey,
    prKey,
    talentName: me.displayName,
    prName,
    talentAvatar: me.avatarUrl || '',
    prAvatar: String(pr.prWxAvatarUrl || '').trim() || undefined,
  })
  return String(data.sessionId)
}

export function totalUnreadCount(sessions: ChatSession[], myKey: string) {
  return (sessions || []).reduce((n, s) => n + unreadForMe(s, myKey), 0)
}

function sessionHasMutualMessages(msgs: ChatMessageRow[]) {
  if (!msgs.length) return false
  let hasPr = false
  let hasTalent = false
  for (const m of msgs) {
    if (m.from_role === 'pr') hasPr = true
    if (m.from_role === 'talent') hasTalent = true
    if (hasPr && hasTalent) return true
  }
  return false
}

function isMissingMutualRpcError(err: unknown) {
  const msg = String(err instanceof Error ? err.message : err || '')
  return /PGRST202|could not find the function|schema cache|mp_talent_chat_pr_mutual|unknown_action/i.test(msg)
}

export async function listMutualTalentKeysForPr(part?: ChatParticipant) {
  const p = part || getCurrentParticipant()
  if (p.role !== 'pr') return []
  try {
    const data = await viaApi({
      action: 'mutual_talent_keys',
      participantKey: p.participantKey,
      deviceSecret: p.deviceSecret,
    })
    return Array.isArray(data.talentKeys) ? data.talentKeys.map(String) : []
  } catch (e) {
    if (!isMissingMutualRpcError(e)) throw e
  }
  const sessions = await listSessions(p)
  const keys: string[] = []
  for (const s of sessions) {
    if (!s || s.pr_key !== p.participantKey) continue
    try {
      const msgs = await fetchMessages(String(s.id), 0, p)
      if (sessionHasMutualMessages(msgs)) keys.push(String(s.talent_key))
    } catch {
      /* skip */
    }
  }
  return keys
}

export function formatTime(ts: number) {
  try {
    const d = new Date(Number(ts) || 0)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return ''
  }
}

export function rowToUiMessage(row: ChatMessageRow, myRole: string): UiChatMessage {
  return {
    id: String(row.client_msg_id || row.id),
    fromRole: row.from_role,
    text: String(row.text || ''),
    ts: Number(row.ts) || 0,
    at: formatTime(row.ts),
    mine: row.from_role === myRole,
  }
}

export function mergeMessages(prev: UiChatMessage[], rows: ChatMessageRow[], myRole: string) {
  const map = new Map<string, UiChatMessage>()
  for (const m of prev) {
    if (m?.id) map.set(m.id, m)
  }
  for (const r of rows) {
    const m = rowToUiMessage(r, myRole)
    if (m.id) map.set(m.id, m)
  }
  return [...map.values()].sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.id.localeCompare(b.id)))
}

export function newMsgId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function sessionPreviewTime(ts: number) {
  return formatTime(ts)
}

export function sessionPeerFromRow(session: ChatSession, myKey: string) {
  return peerDisplay(session, myKey)
}

/** 轮流回复：上一条是自己发的则暂不可再发 */
export function canSendNextMessage(messages: UiChatMessage[], myRole: string): { ok: boolean; hint: string } {
  if (!messages.length) return { ok: true, hint: '' }
  const last = messages[messages.length - 1]
  if (last.fromRole === myRole) {
    return { ok: false, hint: '等待对方回复后可继续发送' }
  }
  return { ok: true, hint: '' }
}

export const CHAT_TURN_HINT =
  '温馨提示：双方需轮流回复，发送一条消息后需等待对方回复才能继续发送。'
