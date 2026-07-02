import type {
  RegistryMpTalentMember,
  RegistryMpPrUser,
  RegistrySnapshot,
  RegistryTalentLibraryEntry,
} from './opsRegistryTypes.js'
import { mergePrFeatureAccessPatch, resolveFeatureAccess } from './prFeatureAccess.js'
import { findMemberForLibraryEntry } from './talentLibraryFilters.js'
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

export function patchPrUserFeatureAccessFromSnapshot(
  data: RegistrySnapshot,
  rawId: unknown,
  patch: MpLibraryFeaturePatch,
): { ok: true; user: RegistryMpPrUser } | { ok: false; error: string; status: number } {
  const id = String(rawId || '').trim()
  if (!id) return { ok: false, error: 'invalid_id', status: 400 }
  const users = data.mpPrUsers ?? []
  const idx = users.findIndex((u) => u.id === id || u.lingqiPrId === id)
  if (idx < 0) return { ok: false, error: 'not_found', status: 404 }
  const prev = users[idx]!
  const patchAccess: import('./prFeatureAccess.js').PrFeatureAccessPatch = {
    addons: patch.addons,
    recommendHall: patch.recommendHall,
    overrides: patch.permissionOverrides,
  }
  const nextAccess = mergePrFeatureAccessPatch(prev.prFeatureAccess, patchAccess)
  let updated: RegistryMpPrUser = {
    ...prev,
    prFeatureAccess: nextAccess,
  }
  updated = applyMembershipPlanPatch(updated, patch)
  users[idx] = updated
  data.mpPrUsers = users
  return { ok: true, user: updated }
}

export type MpLibraryFeaturePatch = {
  addons?: boolean
  recommendHall?: boolean
  membershipPlan?: string
  membershipExpiresAt?: string
  permissionOverrides?: Record<string, boolean | number | string>
}

function normalizeMembershipPlan(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const s = raw.trim().toLowerCase()
  if (!s) return undefined
  if (s === 'basic' || s === 'pro' || s === 'flagship' || s === 'enterprise') return s
  if (/^custom_[a-z0-9]+$/i.test(s)) return s
  if (/^[a-z][a-z0-9_]*$/i.test(s)) return s
  return undefined
}

function applyMembershipPlanPatch<T extends { mpMembershipPlan?: string; mpMembershipExpiresAt?: string }>(
  row: T,
  patch: MpLibraryFeaturePatch,
): T {
  let next = row
  const plan = normalizeMembershipPlan(patch.membershipPlan)
  if (plan) next = { ...next, mpMembershipPlan: plan }
  const expiresAt = String(patch.membershipExpiresAt || '').trim()
  if (expiresAt) next = { ...next, mpMembershipExpiresAt: expiresAt }
  return next
}

function patchMemberFeatureAccess(
  member: RegistryMpTalentMember,
  patch: MpLibraryFeaturePatch,
): RegistryMpTalentMember {
  const patchAccess: import('./prFeatureAccess.js').PrFeatureAccessPatch = {
    addons: patch.addons,
    recommendHall: patch.recommendHall,
    overrides: patch.permissionOverrides,
  }
  return {
    ...member,
    mpFeatureAccess: mergePrFeatureAccessPatch(member.mpFeatureAccess, patchAccess),
  }
}

function findTalentLibraryEntryIndex(
  entries: RegistryTalentLibraryEntry[],
  rawId: string,
): number {
  const id = String(rawId || '').trim()
  if (!id) return -1
  return entries.findIndex(
    (e) => e.id === id || String(e.lingqiTalentId || '').trim() === id,
  )
}

export function patchTalentLibraryFeatureAccessFromSnapshot(
  data: RegistrySnapshot,
  rawId: unknown,
  patch: MpLibraryFeaturePatch,
): { ok: true; entry: RegistryTalentLibraryEntry } | { ok: false; error: string; status: number } {
  const id = String(rawId || '').trim()
  if (!id) return { ok: false, error: 'invalid_id', status: 400 }
  const entries = data.talentLibraryEntries ?? []
  const idx = findTalentLibraryEntryIndex(entries, id)
  if (idx < 0) return { ok: false, error: 'not_found', status: 404 }
  const prev = entries[idx]!
  const patchAccess: import('./prFeatureAccess.js').PrFeatureAccessPatch = {
    addons: patch.addons,
    recommendHall: patch.recommendHall,
    overrides: patch.permissionOverrides,
  }
  const nextAccess = mergePrFeatureAccessPatch(prev.mpFeatureAccess, patchAccess)
  let updated: RegistryTalentLibraryEntry = {
    ...prev,
    mpFeatureAccess: nextAccess,
  }
  updated = applyMembershipPlanPatch(updated, patch)
  entries[idx] = updated
  data.talentLibraryEntries = entries

  const member = findMemberForLibraryEntry(updated, data.mpTalentMembers ?? [])
  if (member) {
    const members = data.mpTalentMembers ?? []
    const midx = members.findIndex((m) => m.id === member.id)
    if (midx >= 0) {
      let patched = patchMemberFeatureAccess(members[midx]!, patch)
      patched = applyMembershipPlanPatch(patched, patch)
      members[midx] = patched
      data.mpTalentMembers = members
    }
  }
  return { ok: true, entry: updated }
}

export function patchSupplierTeamFeatureAccessFromSnapshot(
  data: RegistrySnapshot,
  role: 'shoot' | 'edit',
  rawId: unknown,
  patch: MpLibraryFeaturePatch,
): { ok: true; member: RegistryMpTalentMember } | { ok: false; error: string; status: number } {
  const id = String(rawId || '').trim()
  if (!id) return { ok: false, error: 'invalid_id', status: 400 }
  const listKey = role === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
  const entries = data[listKey] ?? []
  const entry = entries.find((e) => e.id === id)
  if (!entry?.memberId) return { ok: false, error: 'member_not_linked', status: 404 }
  const members = data.mpTalentMembers ?? []
  const midx = members.findIndex((m) => m.id === entry.memberId)
  if (midx < 0) return { ok: false, error: 'not_found', status: 404 }
  let updated = patchMemberFeatureAccess(members[midx]!, patch)
  updated = applyMembershipPlanPatch(updated, patch)
  members[midx] = updated
  data.mpTalentMembers = members
  return { ok: true, member: updated }
}

export function batchPatchLibraryFeatureAccessFromSnapshot(
  data: RegistrySnapshot,
  kind: 'pr' | 'talent',
  rawRows: unknown,
): {
  ok: true
  updatedCount: number
  skippedIds: string[]
} | { ok: false; error: string; status: number } {
  if (!Array.isArray(rawRows) || !rawRows.length) {
    return { ok: false, error: 'invalid_rows', status: 400 }
  }
  let updatedCount = 0
  const skippedIds: string[] = []
  for (const row of rawRows) {
    if (!row || typeof row !== 'object') continue
    const r = row as { id?: unknown; addons?: unknown; recommendHall?: unknown; membershipPlan?: unknown }
    const id = String(r.id || '').trim()
    if (!id) continue
    const patch: MpLibraryFeaturePatch = {}
    if (typeof r.addons === 'boolean') patch.addons = r.addons
    if (typeof r.recommendHall === 'boolean') patch.recommendHall = r.recommendHall
    if (typeof r.membershipPlan === 'string') patch.membershipPlan = normalizeMembershipPlan(r.membershipPlan)
    if (!Object.keys(patch).length) {
      skippedIds.push(id)
      continue
    }
    if (kind === 'pr') {
      const result = patchPrUserFeatureAccessFromSnapshot(data, id, patch)
      if (!result.ok) {
        skippedIds.push(id)
        continue
      }
      updatedCount += 1
      continue
    }
    const result = patchTalentLibraryFeatureAccessFromSnapshot(data, id, patch)
    if (!result.ok) {
      skippedIds.push(id)
      continue
    }
    updatedCount += 1
  }
  if (!updatedCount) return { ok: false, error: 'nothing_updated', status: 400 }
  return { ok: true, updatedCount, skippedIds }
}

export function readTalentLibraryFeatureAccess(
  entry: RegistryTalentLibraryEntry,
  members: RegistryMpTalentMember[],
): { addons: boolean; recommendHall: boolean } {
  const member = findMemberForLibraryEntry(entry, members)
  const raw = member?.mpFeatureAccess ?? entry.mpFeatureAccess
  return resolveFeatureAccess(raw)
}
