import type { RegistryFile } from './opsRegistryTypes.js'
import type { MpChatDb, MpChatSessionRow } from './mpTalentChatSupabase.js'
import { listSessions } from './mpTalentChatSupabase.js'

export function bootstrapTalentChatSecret(talentKey: string): string {
  const core = String(talentKey || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 48)
  return `boot_${core || 'talent'}_meoo_chat_seed`
}

export type TalentChatIdentityHints = {
  lingqiTalentId?: string
  registryMemberId?: string
  contactPhone?: string
  wxOpenId?: string
}

function phoneTail(v: string): string {
  return String(v || '')
    .replace(/\D/g, '')
    .slice(-11)
}

/** 将 PR/卡片 id 解析为 registry 中的 MTM member id */
export function canonicalTalentMemberIdFromRegistry(
  reg: Partial<RegistryFile> | null | undefined,
  rawId: string,
): string {
  const id = String(rawId || '').trim()
  if (!id) return ''
  if (/^MTM-/i.test(id)) return id
  const members = Array.isArray(reg?.mpTalentMembers) ? reg!.mpTalentMembers! : []
  for (const m of members) {
    const mid = String(m.id || '').trim()
    if (!mid) continue
    if (mid === id) return mid
    if (String(m.lingqiTalentId || '').trim() === id) return mid
  }
  const lib = Array.isArray(reg?.talentLibraryEntries) ? reg!.talentLibraryEntries! : []
  for (const row of lib) {
    if (String(row.id || '').trim() !== id) continue
    const lq = String(row.lingqiTalentId || '').trim()
    if (!lq) break
    for (const m of members) {
      if (String(m.lingqiTalentId || '').trim() === lq) return String(m.id || '').trim()
    }
  }
  return id
}

/** 同一达人在历史上可能出现的全部 participant_key */
export function collectTalentParticipantKeys(
  reg: Partial<RegistryFile> | null | undefined,
  hints: TalentChatIdentityHints,
  extraKeys: string[] = [],
): string[] {
  const keys = new Set<string>()
  for (const k of extraKeys) {
    const key = String(k || '').trim()
    if (key) keys.add(key)
  }

  const memberId = String(hints.registryMemberId || '').trim()
  const lq = String(hints.lingqiTalentId || '').trim()
  const hintPhone = phoneTail(hints.contactPhone || '')
  const hintOpenId = String(hints.wxOpenId || '').trim()

  if (memberId) keys.add(`talent_${memberId}`)
  if (lq) keys.add(`talent_${lq}`)

  const members = Array.isArray(reg?.mpTalentMembers) ? reg!.mpTalentMembers! : []
  let matchedMember: (typeof members)[number] | undefined

  for (const m of members) {
    const mid = String(m.id || '').trim()
    const mlq = String(m.lingqiTalentId || '').trim()
    const mPhone = phoneTail(m.contact || m.wechatId || '')
    const mOpen = String(m.wxOpenId || '').trim()
    const hit =
      (memberId && mid === memberId) ||
      (lq && mlq === lq) ||
      (hintPhone.length >= 8 && mPhone === hintPhone) ||
      (hintOpenId && mOpen === hintOpenId)
    if (!hit) continue
    matchedMember = m
    if (mid) keys.add(`talent_${mid}`)
    if (mlq) keys.add(`talent_${mlq}`)
  }

  const lib = Array.isArray(reg?.talentLibraryEntries) ? reg!.talentLibraryEntries! : []
  const linkLq = String(matchedMember?.lingqiTalentId || lq || '').trim()
  for (const row of lib) {
    const libId = String(row.id || '').trim()
    const libLq = String(row.lingqiTalentId || '').trim()
    if (!libId) continue
    if (linkLq && libLq && libLq === linkLq) keys.add(`talent_${libId}`)
    if (libId && (libId === memberId || libId === lq)) keys.add(`talent_${libId}`)
  }

  return [...keys]
}

/** 达人须能证明至少掌握一个 alias 的密钥，才允许按 identity 拉全会话 */
export async function verifyTalentOwnsAnyKey(
  sb: MpChatDb,
  primaryKey: string,
  primarySecret: string,
  aliasKeys: string[],
): Promise<boolean> {
  const tried = new Set<string>()
  const keys = [primaryKey, ...aliasKeys].filter(Boolean)
  for (const key of keys) {
    if (tried.has(key)) continue
    tried.add(key)
    const secrets =
      key === primaryKey
        ? [primarySecret]
        : [primarySecret, bootstrapTalentChatSecret(key)]
    for (const sec of secrets) {
      if (String(sec || '').length < 16) continue
      try {
        await listSessions(sb, key, sec)
        return true
      } catch {
        /* 尝试下一个 */
      }
    }
  }
  return false
}

export async function listSessionsByTalentKeysAdmin(
  sb: MpChatDb,
  talentKeys: string[],
): Promise<MpChatSessionRow[]> {
  const uniq = [...new Set(talentKeys.map((k) => String(k || '').trim()).filter(Boolean))]
  if (!uniq.length) return []
  const { data, error } = await sb
    .from('mp_talent_chat_sessions')
    .select('*')
    .in('talent_key', uniq)
    .order('updated_at', { ascending: false })
    .limit(80)
  if (error) throw new Error(error.message)
  return (data ?? []) as MpChatSessionRow[]
}

export function mergeSessionsById(...groups: MpChatSessionRow[][]): MpChatSessionRow[] {
  const map = new Map<string, MpChatSessionRow>()
  for (const rows of groups) {
    for (const row of rows) {
      if (row?.id) map.set(String(row.id), row)
    }
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime(),
  )
}
