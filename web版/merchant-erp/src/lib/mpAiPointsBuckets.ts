/**
 * 星选积分双桶：套餐额度（会员赠送）与充值积分分开存储；消耗时优先扣套餐。
 */
import type { MpLibraryRole } from './mpMembershipCatalog.js'
import type { RegistrySnapshot, RegistryTalentLibraryEntry } from './opsRegistryTypes.js'
import { findMemberForLibraryEntry } from './talentLibraryFilters.js'
import { shanghaiDateString } from '../../vite-plugins/aiTokenUsageCore.js'

export type MpPointsBuckets = {
  package: number
  recharge: number
  total: number
}

type PointsEntity = {
  mpAiPointsBalance?: number
  mpAiPointsPackageBalance?: number
  mpAiPointsRechargeBalance?: number
  mpAiPointsGiftMonth?: string
  mpAiPointsMonthlyGiftGranted?: number
}

function readNonNeg(n: unknown): number {
  const v = Math.floor(Number(n) || 0)
  return Number.isFinite(v) && v > 0 ? v : 0
}

export function readPointsBuckets(entity: PointsEntity | null | undefined): MpPointsBuckets {
  if (!entity) return { package: 0, recharge: 0, total: 0 }
  const pkg = readNonNeg(entity.mpAiPointsPackageBalance)
  const rech = readNonNeg(entity.mpAiPointsRechargeBalance)
  if (pkg > 0 || rech > 0) {
    return { package: pkg, recharge: rech, total: pkg + rech }
  }
  const legacy = readNonNeg(entity.mpAiPointsBalance)
  return { package: 0, recharge: legacy, total: legacy }
}

export function withPointsBuckets<T extends PointsEntity>(
  entity: T,
  buckets: MpPointsBuckets,
  patch?: Partial<Pick<PointsEntity, 'mpAiPointsGiftMonth' | 'mpAiPointsMonthlyGiftGranted'>>,
): T {
  return {
    ...entity,
    mpAiPointsPackageBalance: buckets.package,
    mpAiPointsRechargeBalance: buckets.recharge,
    mpAiPointsBalance: buckets.total,
    ...patch,
  }
}

export function currentGiftMonthKey(d = new Date()): string {
  return shanghaiDateString(d).slice(0, 7)
}

function syncTalentEntryBalance(data: RegistrySnapshot, targetId: string, buckets: MpPointsBuckets): void {
  const id = String(targetId || '').trim()
  if (!id) return
  const entries = data.talentLibraryEntries ?? []
  const eidx = entries.findIndex((e) => e.id === id || String(e.lingqiTalentId || '').trim() === id)
  if (eidx < 0) return
  entries[eidx] = withPointsBuckets({ ...entries[eidx]! } as RegistryTalentLibraryEntry, buckets)
  data.talentLibraryEntries = entries
}

export function readMpPointsBucketsForTarget(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
): MpPointsBuckets {
  const id = String(targetId || '').trim()
  if (!id) return { package: 0, recharge: 0, total: 0 }

  if (role === 'pr') {
    const user = (data.mpPrUsers ?? []).find((u) => u.id === id || u.lingqiPrId === id)
    return readPointsBuckets(user)
  }

  if (role === 'talent') {
    const members = data.mpTalentMembers ?? []
    const member = members.find((m) => m.id === id || String(m.lingqiTalentId || '').trim() === id)
    if (member) return readPointsBuckets(member)
    const entry = (data.talentLibraryEntries ?? []).find(
      (e) => e.id === id || String(e.lingqiTalentId || '').trim() === id,
    )
    return readPointsBuckets(entry)
  }

  const listKey = role === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
  const entry = (data[listKey] ?? []).find((e) => e.id === id)
  if (!entry?.memberId) return { package: 0, recharge: 0, total: 0 }
  const member = (data.mpTalentMembers ?? []).find((m) => m.id === entry.memberId)
  return readPointsBuckets(member)
}

/** 将双桶写回计费目标（用于流水对齐纠偏） */
export function writeMpPointsBucketsToTarget(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
  buckets: MpPointsBuckets,
): boolean {
  const id = String(targetId || '').trim()
  if (!id) return false
  const next = {
    package: Math.max(0, Math.floor(Number(buckets.package) || 0)),
    recharge: Math.max(0, Math.floor(Number(buckets.recharge) || 0)),
    total: Math.max(0, Math.floor(Number(buckets.total) || 0)),
  }
  next.total = next.package + next.recharge

  if (role === 'pr') {
    const users = data.mpPrUsers ?? []
    const idx = users.findIndex((u) => u.id === id || u.lingqiPrId === id)
    if (idx < 0) return false
    users[idx] = withPointsBuckets({ ...users[idx]!, updatedAt: new Date().toISOString() }, next)
    data.mpPrUsers = users
    return true
  }

  if (role === 'talent') {
    const members = data.mpTalentMembers ?? []
    const midx = members.findIndex((m) => m.id === id || String(m.lingqiTalentId || '').trim() === id)
    if (midx >= 0) {
      members[midx] = withPointsBuckets({ ...members[midx]!, updatedAt: new Date().toISOString() }, next)
      data.mpTalentMembers = members
      syncTalentEntryBalance(data, id, next)
      return true
    }
    const entries = data.talentLibraryEntries ?? []
    const eidx = entries.findIndex((e) => e.id === id || String(e.lingqiTalentId || '').trim() === id)
    if (eidx < 0) return false
    entries[eidx] = withPointsBuckets({ ...entries[eidx]! } as RegistryTalentLibraryEntry, next)
    data.talentLibraryEntries = entries
    return true
  }

  const listKey = role === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
  const teamEntry = (data[listKey] ?? []).find((e) => e.id === id)
  if (!teamEntry?.memberId) return false
  const members = data.mpTalentMembers ?? []
  const midx = members.findIndex((m) => m.id === teamEntry.memberId)
  if (midx < 0) return false
  members[midx] = withPointsBuckets({ ...members[midx]!, updatedAt: new Date().toISOString() }, next)
  data.mpTalentMembers = members
  return true
}

export type PointsBucketMutationResult =
  | { ok: true; buckets: MpPointsBuckets; granted?: number }
  | { ok: false; error: string }

function spendFromBuckets(buckets: MpPointsBuckets, amount: number): MpPointsBuckets | null {
  const need = Math.floor(amount)
  if (need <= 0 || buckets.total < need) return null
  let left = need
  const fromPackage = Math.min(buckets.package, left)
  left -= fromPackage
  const fromRecharge = left
  return {
    package: buckets.package - fromPackage,
    recharge: buckets.recharge - fromRecharge,
    total: buckets.total - need,
  }
}

export function applyPackageGrantToTarget(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
  grantPts: number,
  month: string,
  monthlyGiftGranted: number,
): PointsBucketMutationResult {
  const delta = Math.max(0, Math.floor(Number(grantPts) || 0))
  if (delta <= 0) return { ok: false, error: 'invalid_amount' }
  const id = String(targetId || '').trim()
  if (!id) return { ok: false, error: 'missing_registry_target' }

  const patch = { mpAiPointsGiftMonth: month, mpAiPointsMonthlyGiftGranted: monthlyGiftGranted }

  if (role === 'pr') {
    const users = data.mpPrUsers ?? []
    const idx = users.findIndex((u) => u.id === id || u.lingqiPrId === id)
    if (idx < 0) return { ok: false, error: 'not_found' }
    const prev = users[idx]!
    const buckets = readPointsBuckets(prev)
    const next = {
      package: buckets.package + delta,
      recharge: buckets.recharge,
      total: buckets.total + delta,
    }
    users[idx] = withPointsBuckets({ ...prev, updatedAt: new Date().toISOString() }, next, patch)
    data.mpPrUsers = users
    return { ok: true, buckets: next, granted: delta }
  }

  if (role === 'talent') {
    const entries = data.talentLibraryEntries ?? []
    const members = data.mpTalentMembers ?? []
    const eidx = entries.findIndex((e) => e.id === id || String(e.lingqiTalentId || '').trim() === id)
    const midx = members.findIndex((m) => m.id === id || String(m.lingqiTalentId || '').trim() === id)

    if (midx >= 0) {
      const prev = members[midx]!
      const buckets = readPointsBuckets(prev)
      const next = {
        package: buckets.package + delta,
        recharge: buckets.recharge,
        total: buckets.total + delta,
      }
      members[midx] = withPointsBuckets({ ...prev, updatedAt: new Date().toISOString() }, next, patch)
      data.mpTalentMembers = members
      syncTalentEntryBalance(data, id, next)
      return { ok: true, buckets: next, granted: delta }
    }

    if (eidx >= 0) {
      const entry = entries[eidx]!
      const member = findMemberForLibraryEntry(entry, members)
      if (member) {
        const mi = members.findIndex((m) => m.id === member.id)
        if (mi >= 0) {
          const buckets = readPointsBuckets(member)
          const next = {
            package: buckets.package + delta,
            recharge: buckets.recharge,
            total: buckets.total + delta,
          }
          members[mi] = withPointsBuckets({ ...member, updatedAt: new Date().toISOString() }, next, patch)
          data.mpTalentMembers = members
          entries[eidx] = withPointsBuckets(entry, next)
          data.talentLibraryEntries = entries
          return { ok: true, buckets: next, granted: delta }
        }
      }
    }
    return { ok: false, error: 'not_found' }
  }

  const listKey = role === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
  const entry = (data[listKey] ?? []).find((e) => e.id === id)
  if (!entry?.memberId) return { ok: false, error: 'member_not_linked' }
  const members = data.mpTalentMembers ?? []
  const midx = members.findIndex((m) => m.id === entry.memberId)
  if (midx < 0) return { ok: false, error: 'not_found' }
  const prev = members[midx]!
  const buckets = readPointsBuckets(prev)
  const next = {
    package: buckets.package + delta,
    recharge: buckets.recharge,
    total: buckets.total + delta,
  }
  members[midx] = withPointsBuckets({ ...prev, updatedAt: new Date().toISOString() }, next, patch)
  data.mpTalentMembers = members
  return { ok: true, buckets: next, granted: delta }
}

export function applyRechargeCreditToTarget(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
  delta: number,
): PointsBucketMutationResult {
  const credit = Math.max(0, Math.floor(Number(delta) || 0))
  if (credit <= 0) return { ok: false, error: 'invalid_amount' }
  const id = String(targetId || '').trim()
  if (!id) return { ok: false, error: 'missing_registry_target' }

  if (role === 'pr') {
    const users = data.mpPrUsers ?? []
    const idx = users.findIndex((u) => u.id === id || u.lingqiPrId === id)
    if (idx < 0) return { ok: false, error: 'not_found' }
    const prev = users[idx]!
    const buckets = readPointsBuckets(prev)
    const next = {
      package: buckets.package,
      recharge: buckets.recharge + credit,
      total: buckets.total + credit,
    }
    users[idx] = withPointsBuckets({ ...prev, updatedAt: new Date().toISOString() }, next)
    data.mpPrUsers = users
    return { ok: true, buckets: next }
  }

  if (role === 'talent') {
    const entries = data.talentLibraryEntries ?? []
    const members = data.mpTalentMembers ?? []
    const eidx = entries.findIndex((e) => e.id === id || String(e.lingqiTalentId || '').trim() === id)
    const midx = members.findIndex((m) => m.id === id || String(m.lingqiTalentId || '').trim() === id)

    if (midx >= 0) {
      const prev = members[midx]!
      const buckets = readPointsBuckets(prev)
      const next = {
        package: buckets.package,
        recharge: buckets.recharge + credit,
        total: buckets.total + credit,
      }
      members[midx] = withPointsBuckets({ ...prev, updatedAt: new Date().toISOString() }, next)
      data.mpTalentMembers = members
      if (eidx >= 0) {
        syncTalentEntryBalance(data, id, next)
      }
      return { ok: true, buckets: next }
    }

    if (eidx >= 0) {
      const entry = entries[eidx]!
      const member = findMemberForLibraryEntry(entry, members)
      if (member) {
        const mi = members.findIndex((m) => m.id === member.id)
        if (mi >= 0) {
          const buckets = readPointsBuckets(member)
          const next = {
            package: buckets.package,
            recharge: buckets.recharge + credit,
            total: buckets.total + credit,
          }
          members[mi] = withPointsBuckets({ ...member, updatedAt: new Date().toISOString() }, next)
          data.mpTalentMembers = members
          syncTalentEntryBalance(data, id, next)
          return { ok: true, buckets: next }
        }
      }
      const buckets = readPointsBuckets(entry)
      const next = {
        package: buckets.package,
        recharge: buckets.recharge + credit,
        total: buckets.total + credit,
      }
      entries[eidx] = withPointsBuckets(entry as RegistryTalentLibraryEntry, next)
      data.talentLibraryEntries = entries
      return { ok: true, buckets: next }
    }
    return { ok: false, error: 'not_found' }
  }

  const listKey = role === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
  const teamEntry = (data[listKey] ?? []).find((e) => e.id === id)
  if (!teamEntry?.memberId) return { ok: false, error: 'member_not_linked' }
  const members = data.mpTalentMembers ?? []
  const midx = members.findIndex((m) => m.id === teamEntry.memberId)
  if (midx < 0) return { ok: false, error: 'not_found' }
  const prev = members[midx]!
  const buckets = readPointsBuckets(prev)
  const next = {
    package: buckets.package,
    recharge: buckets.recharge + credit,
    total: buckets.total + credit,
  }
  members[midx] = withPointsBuckets({ ...prev, updatedAt: new Date().toISOString() }, next)
  data.mpTalentMembers = members
  return { ok: true, buckets: next }
}

export function applySpendPackageFirstToTarget(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
  amount: number,
): PointsBucketMutationResult {
  const need = Math.floor(Number(amount) || 0)
  if (need <= 0) return { ok: false, error: 'invalid_amount' }
  const id = String(targetId || '').trim()
  if (!id) return { ok: false, error: 'missing_registry_target' }

  if (role === 'pr') {
    const users = data.mpPrUsers ?? []
    const idx = users.findIndex((u) => u.id === id || u.lingqiPrId === id)
    if (idx < 0) return { ok: false, error: 'not_found' }
    const prev = users[idx]!
    const buckets = readPointsBuckets(prev)
    const next = spendFromBuckets(buckets, need)
    if (!next) return { ok: false, error: 'insufficient_points' }
    users[idx] = withPointsBuckets({ ...prev, updatedAt: new Date().toISOString() }, next)
    data.mpPrUsers = users
    return { ok: true, buckets: next }
  }

  if (role === 'talent') {
    const entries = data.talentLibraryEntries ?? []
    const members = data.mpTalentMembers ?? []
    const eidx = entries.findIndex((e) => e.id === id || String(e.lingqiTalentId || '').trim() === id)
    const midx = members.findIndex((m) => m.id === id || String(m.lingqiTalentId || '').trim() === id)

    if (midx >= 0) {
      const prev = members[midx]!
      const buckets = readPointsBuckets(prev)
      const next = spendFromBuckets(buckets, need)
      if (!next) return { ok: false, error: 'insufficient_points' }
      members[midx] = withPointsBuckets({ ...prev, updatedAt: new Date().toISOString() }, next)
      data.mpTalentMembers = members
      if (eidx >= 0) {
        syncTalentEntryBalance(data, id, next)
      }
      return { ok: true, buckets: next }
    }

    if (eidx >= 0) {
      const entry = entries[eidx]!
      const member = findMemberForLibraryEntry(entry, members)
      if (member) {
        const mi = members.findIndex((m) => m.id === member.id)
        if (mi >= 0) {
          const buckets = readPointsBuckets(member)
          const next = spendFromBuckets(buckets, need)
          if (!next) return { ok: false, error: 'insufficient_points' }
          members[mi] = withPointsBuckets({ ...member, updatedAt: new Date().toISOString() }, next)
          data.mpTalentMembers = members
          syncTalentEntryBalance(data, id, next)
          return { ok: true, buckets: next }
        }
      }
      const buckets = readPointsBuckets(entry)
      const next = spendFromBuckets(buckets, need)
      if (!next) return { ok: false, error: 'insufficient_points' }
      entries[eidx] = withPointsBuckets(entry as RegistryTalentLibraryEntry, next)
      data.talentLibraryEntries = entries
      return { ok: true, buckets: next }
    }
    return { ok: false, error: 'not_found' }
  }

  const listKey = role === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
  const teamEntry = (data[listKey] ?? []).find((e) => e.id === id)
  if (!teamEntry?.memberId) return { ok: false, error: 'member_not_linked' }
  const members = data.mpTalentMembers ?? []
  const midx = members.findIndex((m) => m.id === teamEntry.memberId)
  if (midx < 0) return { ok: false, error: 'not_found' }
  const prev = members[midx]!
  const buckets = readPointsBuckets(prev)
  const next = spendFromBuckets(buckets, need)
  if (!next) return { ok: false, error: 'insufficient_points' }
  members[midx] = withPointsBuckets({ ...prev, updatedAt: new Date().toISOString() }, next)
  data.mpTalentMembers = members
  return { ok: true, buckets: next }
}

export function readMonthlyGiftGrantedForTarget(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
  month: string,
): number {
  const id = String(targetId || '').trim()
  if (!id) return 0

  let entity: PointsEntity | null | undefined
  if (role === 'pr') {
    entity = (data.mpPrUsers ?? []).find((u) => u.id === id || u.lingqiPrId === id)
  } else if (role === 'talent') {
    entity =
      (data.mpTalentMembers ?? []).find((m) => m.id === id || String(m.lingqiTalentId || '').trim() === id) ||
      (data.talentLibraryEntries ?? []).find((e) => e.id === id || String(e.lingqiTalentId || '').trim() === id)
  } else {
    const listKey = role === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
    const teamEntry = (data[listKey] ?? []).find((e) => e.id === id)
    entity = teamEntry?.memberId
      ? (data.mpTalentMembers ?? []).find((m) => m.id === teamEntry.memberId)
      : undefined
  }

  if (!entity || String(entity.mpAiPointsGiftMonth || '').trim() !== month) return 0
  return readNonNeg(entity.mpAiPointsMonthlyGiftGranted)
}

function sumMonthlySpendForAccount(
  data: RegistrySnapshot,
  accountId: string,
  monthKey: string,
): number {
  const id = String(accountId || '').trim()
  if (!id) return 0
  return (data.mpAiPointsSpendLedger ?? [])
    .filter((row) => {
      if (String(row.accountId || '') !== id) return false
      return String(row.createdAt || '').slice(0, 7) === monthKey
    })
    .reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.points) || 0)), 0)
}

function clearMonthlyGiftGrantOnTarget(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
): void {
  const id = String(targetId || '').trim()
  if (!id) return
  const patch = { mpAiPointsGiftMonth: '', mpAiPointsMonthlyGiftGranted: 0 }

  if (role === 'pr') {
    const users = data.mpPrUsers ?? []
    const idx = users.findIndex((u) => u.id === id || u.lingqiPrId === id)
    if (idx >= 0) {
      users[idx] = { ...users[idx]!, ...patch, updatedAt: new Date().toISOString() }
      data.mpPrUsers = users
    }
    return
  }

  if (role === 'talent') {
    const members = data.mpTalentMembers ?? []
    const midx = members.findIndex((m) => m.id === id || String(m.lingqiTalentId || '').trim() === id)
    if (midx >= 0) {
      members[midx] = { ...members[midx]!, ...patch, updatedAt: new Date().toISOString() }
      data.mpTalentMembers = members
      syncTalentEntryBalance(data, id, readPointsBuckets(members[midx]))
    }
  }
}

/** 旧版仅 mpAiPointsBalance 字段 → 写入充值桶，便于双端一致读取 */
export function normalizeLegacyPointsBucketsOnTarget(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
): boolean {
  const id = String(targetId || '').trim()
  if (!id) return false

  const apply = (entity: PointsEntity, writer: (next: PointsEntity) => void): boolean => {
    const buckets = readPointsBuckets(entity)
    const legacy = readNonNeg(entity.mpAiPointsBalance)
    if (buckets.total > 0 || legacy <= 0) return false
    writer(withPointsBuckets({ ...entity }, { package: 0, recharge: legacy, total: legacy }))
    return true
  }

  if (role === 'pr') {
    const users = data.mpPrUsers ?? []
    const idx = users.findIndex((u) => u.id === id || u.lingqiPrId === id)
    if (idx < 0) return false
    const changed = apply(users[idx]!, (next) => {
      users[idx] = { ...users[idx]!, ...next, updatedAt: new Date().toISOString() }
      data.mpPrUsers = users
    })
    return changed
  }

  if (role === 'talent') {
    const members = data.mpTalentMembers ?? []
    const midx = members.findIndex((m) => m.id === id || String(m.lingqiTalentId || '').trim() === id)
    if (midx >= 0) {
      const changed = apply(members[midx]!, (next) => {
        members[midx] = { ...members[midx]!, ...next, updatedAt: new Date().toISOString() }
        data.mpTalentMembers = members
        syncTalentEntryBalance(data, id, readPointsBuckets(members[midx]))
      })
      if (changed) return true
    }
  }
  return false
}

/** 发放套餐额度（自然月首次或升级补差至当前档赠送积分） */
export function grantPackagePointsDeltaToTarget(
  data: RegistrySnapshot,
  role: MpLibraryRole,
  targetId: string,
  tierGiftQuota: number,
  opts?: { repairAccountId?: string },
): { granted: number; newBalance: number } {
  const month = currentGiftMonthKey()
  const quota = Math.max(0, Math.floor(Number(tierGiftQuota) || 0))
  if (quota <= 0) {
    return { granted: 0, newBalance: readMpPointsBucketsForTarget(data, role, targetId).total }
  }

  normalizeLegacyPointsBucketsOnTarget(data, role, targetId)

  let prevGranted = readMonthlyGiftGrantedForTarget(data, role, targetId, month)
  let delta = Math.max(0, quota - prevGranted)
  const bucketsNow = readMpPointsBucketsForTarget(data, role, targetId)

  if (delta <= 0 && prevGranted > 0 && bucketsNow.total <= 0) {
    const repairAccountId = String(opts?.repairAccountId || '').trim()
    const spent = repairAccountId ? sumMonthlySpendForAccount(data, repairAccountId, month) : 0
    if (spent < Math.max(0, prevGranted - 50)) {
      clearMonthlyGiftGrantOnTarget(data, role, targetId)
      prevGranted = 0
      delta = quota
    }
  }

  if (delta <= 0) {
    return { granted: 0, newBalance: readMpPointsBucketsForTarget(data, role, targetId).total }
  }

  const applied = applyPackageGrantToTarget(data, role, targetId, delta, month, prevGranted + delta)
  if (!applied.ok) {
    return { granted: 0, newBalance: readMpPointsBucketsForTarget(data, role, targetId).total }
  }
  return { granted: delta, newBalance: applied.buckets.total }
}
