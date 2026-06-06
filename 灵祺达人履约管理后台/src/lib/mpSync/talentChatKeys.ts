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

/** 达人侧可能历史会话绑定的 participant_key 候选 */
export function collectTalentChatKeyCandidates(reg?: RegistryLike): string[] {
  const acc = getAccount()
  const member = readMember()
  const memberId = resolveTalentMemberId()
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
    const mem = members.find((m) => String((m as Record<string, unknown>).id || '').trim() === memberId) as
      | Record<string, unknown>
      | undefined
    const lq = String(mem?.lingqiTalentId || acc?.lingqiTalentId || '').trim()
    if (lq) keys.add(`talent_${lq}`)
    for (const e of lib) {
      const row = e as Record<string, unknown>
      const libLq = String(row.lingqiTalentId || '').trim()
      const libId = String(row.id || '').trim()
      if (!libId) continue
      if (libLq && lq && libLq === lq) keys.add(`talent_${libId}`)
      if (libId && rawIds.includes(libId)) keys.add(`talent_${libId}`)
    }
  }

  return [...keys]
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
