import { getAccount } from '../mpSession'
import {
  bootstrapTalentSecret,
  getCurrentParticipant,
  resolveTalentMemberId,
  type ChatParticipant,
} from './participant'
import { readMember } from './talentMember'

type RegistryLike = {
  mpTalentMembers?: Record<string, unknown>[]
  talentLibraryEntries?: Record<string, unknown>[]
} | null

/** 将卡片/库表 id 解析为 mpTalentMembers 的 MTM id（私信 participantKey 须一致） */
export function canonicalTalentMemberIdFromRegistry(reg: RegistryLike, rawId: string): string {
  const id = String(rawId || '').trim()
  if (!id) return ''
  if (/^MTM-/i.test(id)) return id
  const members = Array.isArray(reg?.mpTalentMembers) ? reg!.mpTalentMembers! : []
  for (const m of members) {
    const mem = m as Record<string, unknown>
    const mid = String(mem.id || '').trim()
    if (!mid) continue
    if (mid === id) return mid
    if (String(mem.lingqiTalentId || '').trim() === id) return mid
  }
  const lib = Array.isArray(reg?.talentLibraryEntries) ? reg!.talentLibraryEntries! : []
  for (const e of lib) {
    const row = e as Record<string, unknown>
    if (String(row.id || '').trim() !== id) continue
    const lq = String(row.lingqiTalentId || '').trim()
    if (!lq) break
    for (const m of members) {
      const mem = m as Record<string, unknown>
      if (String(mem.lingqiTalentId || '').trim() === lq) {
        return String(mem.id || '').trim()
      }
    }
  }
  return id
}

function phoneTail(v: string): string {
  return String(v || '')
    .replace(/\D/g, '')
    .slice(-11)
}

/** 达人侧可能历史会话绑定的 participant_key 候选 */
export function collectTalentChatKeyCandidates(reg?: RegistryLike): string[] {
  const acc = getAccount()
  const member = readMember()
  const memberId = resolveTalentMemberId()
  const lq = String(acc?.lingqiTalentId || '').trim()
  const hintPhone = phoneTail(acc?.loginName || String(member?.contact || ''))
  const hintOpenId = String(acc?.openid || '').trim()
  const rawIds = [
    acc?.registryMemberId,
    member?.id,
    acc?.lingqiTalentId,
    memberId,
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
  const keys = new Set<string>()
  for (const id of rawIds) {
    keys.add(`talent_${id}`)
  }

  if (reg) {
    const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
    const lib = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries : []
    let mem: Record<string, unknown> | undefined
    for (const m of members) {
      const row = m as Record<string, unknown>
      const mid = String(row.id || '').trim()
      const mlq = String(row.lingqiTalentId || '').trim()
      const mPhone = phoneTail(String(row.contact || row.wechatId || ''))
      const mOpen = String(row.wxOpenId || '').trim()
      const hit =
        (memberId && mid === memberId) ||
        (lq && mlq === lq) ||
        (hintPhone.length >= 8 && mPhone === hintPhone) ||
        (hintOpenId && mOpen === hintOpenId)
      if (!hit) continue
      mem = row
      if (mid) keys.add(`talent_${mid}`)
      if (mlq) keys.add(`talent_${mlq}`)
    }
    const linkLq = String(mem?.lingqiTalentId || lq || '').trim()
    for (const e of lib) {
      const row = e as Record<string, unknown>
      const libLq = String(row.lingqiTalentId || '').trim()
      const libId = String(row.id || '').trim()
      if (!libId) continue
      if (libLq && linkLq && libLq === linkLq) keys.add(`talent_${libId}`)
      if (libId && rawIds.includes(libId)) keys.add(`talent_${libId}`)
    }
  }

  return [...keys]
}

/** 达人 list_sessions 请求附带的身份字段（服务端按 registry 解析历史 alias） */
export function talentChatIdentityPayload(reg?: RegistryLike): Record<string, unknown> {
  const acc = getAccount()
  const member = readMember()
  const payload: Record<string, unknown> = {
    aliasParticipantKeys: collectTalentChatKeyCandidates(reg),
  }
  const lq = String(acc?.lingqiTalentId || '').trim()
  const mid = String(acc?.registryMemberId || member?.id || '').trim()
  const phone = String(acc?.loginName || member?.contact || '').trim()
  const openId = String(acc?.openid || '').trim()
  if (lq) payload.lingqiTalentId = lq
  if (mid) payload.registryMemberId = mid
  if (phone) payload.contactPhone = phone
  if (openId) payload.wxOpenId = openId
  return payload
}

/** 当前身份在该会话行上应用来鉴权的 participant_key */
export function sessionAuthKeyForMe(
  session: { talent_key?: string; pr_key?: string },
  me: ChatParticipant,
): string {
  if (me.role === 'talent') return String(session.talent_key || me.participantKey).trim()
  return String(session.pr_key || me.participantKey).trim()
}

/** 拉消息/发送时须用会话绑定的 key（达人侧常为 PR 建会话时的 talent_key） */
export function participantForSession(
  session: { talent_key?: string; pr_key?: string },
  base?: ChatParticipant,
): ChatParticipant {
  const me = base || getCurrentParticipant()
  const authKey = sessionAuthKeyForMe(session, me)
  if (me.role === 'talent') return talentChatParticipantForKey(me, authKey)
  if (authKey === me.participantKey) return me
  return { ...me, participantKey: authKey }
}

export function talentChatParticipantForKey(
  base: ChatParticipant,
  participantKey: string,
): ChatParticipant {
  return {
    ...base,
    participantKey,
    deviceSecret: bootstrapTalentSecret(participantKey),
  }
}
