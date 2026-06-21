import type { RegistryMpPrUser, RegistryMpTalentMember } from '../meooRegistryShared/opsRegistryTypes'
import { timestampInRange, type DashboardRange } from './opsDashboardRange'

export type MpUserDashboardStats = {
  talentRegistered: number
  talentActive: number
  prRegistered: number
  prActive: number
}

export type MpUserDashboardDailyPoint = {
  date: string
  talentRegistered: number
  talentActive: number
  prRegistered: number
  prActive: number
}

function eachDayKeys(range: DashboardRange): string[] {
  const keys: string[] = []
  const cur = new Date(range.start)
  cur.setHours(0, 0, 0, 0)
  const end = new Date(range.end)
  end.setHours(0, 0, 0, 0)
  while (cur.getTime() <= end.getTime()) {
    keys.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return keys
}

function dayKey(iso: string): string | null {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return null
  return t.toISOString().slice(0, 10)
}

function isRegisterOnlyBump(registeredAt: string, updatedAt: string, range: DashboardRange): boolean {
  if (!timestampInRange(registeredAt, range)) return false
  const created = new Date(registeredAt).getTime()
  const updated = new Date(updatedAt).getTime()
  if (Number.isNaN(created) || Number.isNaN(updated)) return false
  return updated - created < 120_000
}

function countTalentActive(members: RegistryMpTalentMember[], range: DashboardRange): number {
  let n = 0
  for (const m of members) {
    if (!timestampInRange(m.updatedAt, range)) continue
    if (isRegisterOnlyBump(m.registeredAt, m.updatedAt, range)) continue
    n += 1
  }
  return n
}

function countPrActive(users: RegistryMpPrUser[], range: DashboardRange): number {
  let n = 0
  for (const u of users) {
    if (!timestampInRange(u.updatedAt, range)) continue
    if (isRegisterOnlyBump(u.registeredAt, u.updatedAt, range)) continue
    n += 1
  }
  return n
}

export function computeMpUserDashboardStats(
  members: RegistryMpTalentMember[],
  prUsers: RegistryMpPrUser[],
  range: DashboardRange,
): MpUserDashboardStats {
  let talentRegistered = 0
  let prRegistered = 0
  for (const m of members) {
    if (timestampInRange(m.registeredAt, range)) talentRegistered += 1
  }
  for (const u of prUsers) {
    if (timestampInRange(u.registeredAt, range)) prRegistered += 1
  }
  return {
    talentRegistered,
    talentActive: countTalentActive(members, range),
    prRegistered,
    prActive: countPrActive(prUsers, range),
  }
}

export function computeMpUserDashboardDailySeries(
  members: RegistryMpTalentMember[],
  prUsers: RegistryMpPrUser[],
  range: DashboardRange,
): MpUserDashboardDailyPoint[] {
  const days = eachDayKeys(range)
  const talentReg = new Map<string, number>()
  const talentAct = new Map<string, number>()
  const prReg = new Map<string, number>()
  const prAct = new Map<string, number>()
  for (const d of days) {
    talentReg.set(d, 0)
    talentAct.set(d, 0)
    prReg.set(d, 0)
    prAct.set(d, 0)
  }

  for (const m of members) {
    const rk = dayKey(m.registeredAt)
    if (rk && talentReg.has(rk) && timestampInRange(m.registeredAt, range)) {
      talentReg.set(rk, (talentReg.get(rk) ?? 0) + 1)
    }
    const uk = dayKey(m.updatedAt)
    if (uk && talentAct.has(uk) && timestampInRange(m.updatedAt, range)) {
      if (!isRegisterOnlyBump(m.registeredAt, m.updatedAt, range)) {
        talentAct.set(uk, (talentAct.get(uk) ?? 0) + 1)
      }
    }
  }

  for (const u of prUsers) {
    const rk = dayKey(u.registeredAt)
    if (rk && prReg.has(rk) && timestampInRange(u.registeredAt, range)) {
      prReg.set(rk, (prReg.get(rk) ?? 0) + 1)
    }
    const uk = dayKey(u.updatedAt)
    if (uk && prAct.has(uk) && timestampInRange(u.updatedAt, range)) {
      if (!isRegisterOnlyBump(u.registeredAt, u.updatedAt, range)) {
        prAct.set(uk, (prAct.get(uk) ?? 0) + 1)
      }
    }
  }

  return days.map((date) => ({
    date,
    talentRegistered: talentReg.get(date) ?? 0,
    talentActive: talentAct.get(date) ?? 0,
    prRegistered: prReg.get(date) ?? 0,
    prActive: prAct.get(date) ?? 0,
  }))
}
