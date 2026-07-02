import type { MpLibraryRole } from './mpMembershipCatalog.js'
import type {
  RegistryMpPointsCheckoutRequest,
  RegistryMpPrUser,
  RegistryMpTalentMember,
  RegistrySnapshot,
  RegistryTalentLibraryEntry,
} from './opsRegistryTypes.js'
import { findRegistryMemberForAccount, findRegistryPrForAccount } from './mpRegistryProfileGet.js'
import type { MpAccountRow } from './mpAccountAuth.js'

import { findMemberForLibraryEntry } from './talentLibraryFilters.js'

function readBalanceFromPr(user: RegistryMpPrUser | null | undefined): number {
  const n = Number(user?.mpAiPointsBalance)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function readBalanceFromMember(member: RegistryMpTalentMember | null | undefined): number {
  const n = Number(member?.mpAiPointsBalance)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function readMpAiPointsBalanceForTarget(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
): number {
  const id = String(targetId || '').trim()
  if (!id) return 0

  if (role === 'pr') {
    const user = (data.mpPrUsers ?? []).find((u) => u.id === id || u.lingqiPrId === id)
    return readBalanceFromPr(user)
  }

  if (role === 'talent') {
    const entry = (data.talentLibraryEntries ?? []).find(
      (e) => e.id === id || String(e.lingqiTalentId || '').trim() === id,
    )
    const members = data.mpTalentMembers ?? []
    const member =
      members.find((m) => m.id === id || String(m.lingqiTalentId || '').trim() === id) ||
      (entry ? findMemberForLibraryEntry(entry, members) : undefined)
    if (member) return readBalanceFromMember(member)
    if (entry) {
      const n = Number(entry.mpAiPointsBalance)
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
    }
    return 0
  }

  const listKey = role === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
  const entry = (data[listKey] ?? []).find((e) => e.id === id)
  if (!entry?.memberId) return 0
  const member = (data.mpTalentMembers ?? []).find((m) => m.id === entry.memberId)
  return readBalanceFromMember(member)
}

export function readAccountMpAiPointsBalance(data: RegistrySnapshot, account: MpAccountRow): number {
  const pr = findRegistryPrForAccount(data, account)
  if (pr) return readBalanceFromPr(pr)
  const member = findRegistryMemberForAccount(data, account)
  return readBalanceFromMember(member)
}

export function creditMpAiPointsFromSnapshot(
  data: RegistrySnapshot,
  checkout: RegistryMpPointsCheckoutRequest,
): { ok: true; newBalance: number } | { ok: false; error: string } {
  const delta = Math.floor(Number(checkout.points) || 0)
  if (delta <= 0) return { ok: false, error: 'invalid_points' }

  const target = String(checkout.registryTargetId || checkout.lingqiId || '').trim()
  if (!target) return { ok: false, error: 'missing_registry_target' }

  if (checkout.role === 'pr') {
    const users = data.mpPrUsers ?? []
    const idx = users.findIndex((u) => u.id === target || u.lingqiPrId === target)
    if (idx < 0) return { ok: false, error: 'not_found' }
    const prev = users[idx]!
    const newBalance = readBalanceFromPr(prev) + delta
    users[idx] = { ...prev, mpAiPointsBalance: newBalance, updatedAt: new Date().toISOString() }
    data.mpPrUsers = users
    return { ok: true, newBalance }
  }

  if (checkout.role === 'talent') {
    const entries = data.talentLibraryEntries ?? []
    const members = data.mpTalentMembers ?? []
    const eidx = entries.findIndex((e) => e.id === target || String(e.lingqiTalentId || '').trim() === target)
    const midx = members.findIndex((m) => m.id === target || String(m.lingqiTalentId || '').trim() === target)

    if (midx >= 0) {
      const prev = members[midx]!
      const newBalance = readBalanceFromMember(prev) + delta
      members[midx] = { ...prev, mpAiPointsBalance: newBalance, updatedAt: new Date().toISOString() }
      data.mpTalentMembers = members
      if (eidx >= 0) {
        const entry = entries[eidx]!
        entries[eidx] = { ...entry, mpAiPointsBalance: newBalance }
        data.talentLibraryEntries = entries
      }
      return { ok: true, newBalance }
    }

    if (eidx >= 0) {
      const entry = entries[eidx]!
      const member = findMemberForLibraryEntry(entry, members)
      if (member) {
        const mid = members.findIndex((m) => m.id === member.id)
        if (mid >= 0) {
          const newBalance = readBalanceFromMember(member) + delta
          members[mid] = { ...member, mpAiPointsBalance: newBalance, updatedAt: new Date().toISOString() }
          data.mpTalentMembers = members
          entries[eidx] = { ...entry, mpAiPointsBalance: newBalance }
          data.talentLibraryEntries = entries
          return { ok: true, newBalance }
        }
      }
      const newBalance = (Number(entry.mpAiPointsBalance) || 0) + delta
      entries[eidx] = { ...entry, mpAiPointsBalance: newBalance }
      data.talentLibraryEntries = entries
      return { ok: true, newBalance }
    }

    return { ok: false, error: 'not_found' }
  }

  const listKey = checkout.role === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
  const entries = data[listKey] ?? []
  const entry = entries.find((e) => e.id === target)
  if (!entry?.memberId) return { ok: false, error: 'member_not_linked' }
  const members = data.mpTalentMembers ?? []
  const midx = members.findIndex((m) => m.id === entry.memberId)
  if (midx < 0) return { ok: false, error: 'not_found' }
  const prev = members[midx]!
  const newBalance = readBalanceFromMember(prev) + delta
  members[midx] = { ...prev, mpAiPointsBalance: newBalance, updatedAt: new Date().toISOString() }
  data.mpTalentMembers = members
  return { ok: true, newBalance }
}
