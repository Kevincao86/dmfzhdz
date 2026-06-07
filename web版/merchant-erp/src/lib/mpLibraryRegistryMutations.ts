import type {
  RegistryMpTalentMember,
  RegistrySnapshot,
  RegistryTalentLibraryEntry,
} from './opsRegistryTypes.js'
import { talentLibraryDedupeKey } from './talentLibraryUpsert.js'

export type MpLibraryDeleteKind = 'talent' | 'shoot' | 'edit' | 'pr'

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))]
}

function platformAccountKeys(m: RegistryMpTalentMember): string[] {
  const keys: string[] = []
  const add = (platform: string, account?: string) => {
    const a = String(account || '').trim()
    if (a) keys.push(talentLibraryDedupeKey(platform, a))
  }
  if (m.douyin?.platformAccount) add('抖音', m.douyin.platformAccount)
  if (m.xiaohongshu?.platformAccount) add('小红书', m.xiaohongshu.platformAccount)
  const profiles = m.platformProfiles ?? {}
  for (const [pid, prof] of Object.entries(profiles)) {
    if (!prof?.platformAccount) continue
    const plat =
      pid === 'douyin' ? '抖音' : pid === 'xiaohongshu' ? '小红书' : pid === 'dianping' ? '大众点评' : pid
    add(plat, prof.platformAccount)
  }
  return keys
}

function memberMatchesTalentEntry(m: RegistryMpTalentMember, e: RegistryTalentLibraryEntry): boolean {
  const talentId = String(e.lingqiTalentId || '').trim()
  const memberId = String(m.lingqiTalentId || '').trim()
  if (talentId && memberId && talentId === memberId) return true
  const entryKey = talentLibraryDedupeKey(e.platform, e.platformAccount)
  return platformAccountKeys(m).includes(entryKey)
}

function purgeTalentMembersAndInbox(data: RegistrySnapshot, memberIds: Set<string>): void {
  if (!memberIds.size) return
  const contacts = new Set<string>()
  for (const m of data.mpTalentMembers ?? []) {
    if (!memberIds.has(m.id)) continue
    const c = String(m.contact || '').trim()
    if (c) contacts.add(c)
  }
  data.mpTalentMembers = (data.mpTalentMembers ?? []).filter((m) => !memberIds.has(m.id))
  data.mpTalentInbox = (data.mpTalentInbox ?? []).filter((item) => {
    if (item.talentMemberId && memberIds.has(item.talentMemberId)) return false
    const c = String(item.contact || '').trim()
    if (c && contacts.has(c)) return false
    return true
  })
}

export function deleteMpLibraryEntriesFromSnapshot(
  data: RegistrySnapshot,
  kind: MpLibraryDeleteKind,
  rawIds: unknown,
): { ok: true; deletedCount: number } | { ok: false; error: string; status: number } {
  const ids = normalizeIds(rawIds)
  if (!ids.length) return { ok: false, error: 'invalid_delete', status: 400 }
  const idSet = new Set(ids)

  if (kind === 'talent') {
    const entries = data.talentLibraryEntries ?? []
    const removed = entries.filter((e) => idSet.has(e.id))
    if (!removed.length) return { ok: false, error: 'not_found', status: 404 }
    data.talentLibraryEntries = entries.filter((e) => !idSet.has(e.id))
    const memberDrop = new Set<string>()
    for (const e of removed) {
      for (const m of data.mpTalentMembers ?? []) {
        if (memberMatchesTalentEntry(m, e)) memberDrop.add(m.id)
      }
    }
    purgeTalentMembersAndInbox(data, memberDrop)
    return { ok: true, deletedCount: removed.length }
  }

  if (kind === 'shoot' || kind === 'edit') {
    const listKey = kind === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
    const teamIdField = kind === 'shoot' ? 'lingqiShootTeamId' : 'lingqiEditTeamId'
    const entries = data[listKey] ?? []
    const removed = entries.filter((e) => idSet.has(e.id))
    if (!removed.length) return { ok: false, error: 'not_found', status: 404 }
    data[listKey] = entries.filter((e) => !idSet.has(e.id))
    const memberDrop = new Set<string>()
    const teamIds = new Set<string>()
    for (const e of removed) {
      if (e.memberId) memberDrop.add(String(e.memberId))
      const tid = String(e.lingqiTeamId || e.lingqiTalentId || '').trim()
      if (tid) teamIds.add(tid)
    }
    for (const m of data.mpTalentMembers ?? []) {
      if (memberDrop.has(m.id)) continue
      const tid = String(m[teamIdField] || '').trim()
      if (tid && teamIds.has(tid)) memberDrop.add(m.id)
    }
    purgeTalentMembersAndInbox(data, memberDrop)
    return { ok: true, deletedCount: removed.length }
  }

  if (kind === 'pr') {
    const users = data.mpPrUsers ?? []
    const removed = users.filter((u) => idSet.has(u.id) || idSet.has(u.lingqiPrId))
    if (!removed.length) return { ok: false, error: 'not_found', status: 404 }
    const dropIds = new Set(removed.map((u) => u.id))
    const dropPrIds = new Set(removed.map((u) => u.lingqiPrId))
    data.mpPrUsers = users.filter((u) => !dropIds.has(u.id) && !dropPrIds.has(u.lingqiPrId))
    return { ok: true, deletedCount: removed.length }
  }

  return { ok: false, error: 'invalid_kind', status: 400 }
}
