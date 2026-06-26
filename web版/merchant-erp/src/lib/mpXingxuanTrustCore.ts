/**
 * 星选信任体系：档期冲突、顺路打包、履约信用、黑灰名单
 */
import type {
  MpCooperationPoolEntry,
  MpTalentWatchlistEntry,
  RegistryFile,
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpPrUser,
} from './opsRegistryTypes.js'
import { readVisitPlanDates, normalizeSlotCompareKey } from './mpRecruitmentVisitScheduleCore.js'
import { regionMatchesTalent } from './mpRecruitmentMatchShared.js'

export type TalentIdentityMatch = {
  key?: string
  talentMemberId?: string
  wxOpenId?: string
  platformAccount?: string
  lingqiTalentId?: string
  platform?: string
}

export type MpTalentCreditSummary = {
  score: number
  completedCount: number
  appliedCount: number
  passRate: number
  onTimeRate: number
  rejectCount: number
  scheduleDeclinedCount: number
  noShowCount: number
  lostContactCount: number
  badges: string[]
}

export type ScheduleConflictItem = {
  mpOrderId: string
  title: string
  dateKey: string
  assignedVisitAt: string
}

export type RouteBundleSuggestion = {
  id: string
  title: string
  region: string
  visitDates: string[]
  platform?: string
  matchReason: string
}

export type WatchlistHit = {
  list: 'blacklist' | 'graylist'
  entry: MpTalentWatchlistEntry
}

const COOP_TAG_PRESETS = ['转化好', '配合度高', '出片快', '已合作', '性价比高'] as const

export { COOP_TAG_PRESETS }

const nowIso = () => new Date().toISOString()

export function extractVisitDateKey(raw: string): string | null {
  const s = String(raw || '').trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const pad = (n: string) => String(Number(n)).padStart(2, '0')
    return `${iso[1]}-${pad(iso[2]!)}-${pad(iso[3]!)}`
  }
  const slash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (slash) {
    const pad = (n: string) => String(Number(n)).padStart(2, '0')
    return `${slash[1]}-${pad(slash[2]!)}-${pad(slash[3]!)}`
  }
  const cn = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (cn) {
    const pad = (n: string) => String(Number(n)).padStart(2, '0')
    return `${cn[1]}-${pad(cn[2]!)}-${pad(cn[3]!)}`
  }
  return null
}

export function applicantMatchesTalent(
  applicant: RegistryMpRecruitmentApplicant,
  match: TalentIdentityMatch,
): boolean {
  const memberId = String(match.talentMemberId || '').trim()
  const openId = String(match.wxOpenId || '').trim()
  const acc = String(match.platformAccount || '').trim().toLowerCase()
  const lq = String(match.lingqiTalentId || '').trim()

  const aMember = String(applicant.talentMemberId || '').trim()
  const aOpen = String(applicant.wxOpenId || '').trim()
  const aAcc = String(applicant.platformAccount || '').trim().toLowerCase()

  if (memberId && aMember && aMember === memberId) return true
  if (openId && aOpen && aOpen === openId) return true
  if (acc && aAcc && aAcc === acc) return true
  if (lq && aMember && aMember === lq) return true
  return false
}

export function watchlistEntryMatchesTalent(
  entry: MpTalentWatchlistEntry,
  match: TalentIdentityMatch,
): boolean {
  const memberId = String(match.talentMemberId || '').trim()
  const openId = String(match.wxOpenId || '').trim()
  const acc = String(match.platformAccount || '').trim().toLowerCase()
  const lq = String(match.lingqiTalentId || '').trim()

  if (memberId && entry.talentMemberId === memberId) return true
  if (openId && entry.wxOpenId === openId) return true
  if (acc && String(entry.platformAccount || '').trim().toLowerCase() === acc) return true
  if (lq && entry.lingqiTalentId === lq) return true
  if (lq && entry.talentMemberId === lq) return true
  return false
}

export function isApplicantConfirmedSchedule(a: RegistryMpRecruitmentApplicant): boolean {
  const assigned = String(a.assignedVisitAt || '').trim()
  if (!assigned) return false
  const st = String(a.visitAssignmentStatus || '').trim()
  if (st === 'declined') return false
  if (st === 'confirmed') return true
  if (st === 'pending_talent_confirm') return false
  if (a.prSelected || a.merchantSelected) {
    return st !== 'declined'
  }
  return false
}

export function collectTalentConfirmedSchedules(
  orders: RegistryMpRecruitmentOrder[],
  match: TalentIdentityMatch,
  excludeMpOrderId?: string,
): ScheduleConflictItem[] {
  const out: ScheduleConflictItem[] = []
  for (const order of orders) {
    if (excludeMpOrderId && order.id === excludeMpOrderId) continue
    for (const a of order.applicants ?? []) {
      if (!applicantMatchesTalent(a, match)) continue
      if (!isApplicantConfirmedSchedule(a)) continue
      const assigned = String(a.assignedVisitAt || '').trim()
      const dateKey = extractVisitDateKey(assigned)
      if (!dateKey) continue
      out.push({
        mpOrderId: order.id,
        title: String(order.title || order.storeName || order.id),
        dateKey,
        assignedVisitAt: assigned,
      })
    }
  }
  return out
}

export function orderVisitDateKeys(order: RegistryMpRecruitmentOrder): string[] {
  const keys = new Set<string>()
  for (const row of readVisitPlanDates(order)) {
    const k = extractVisitDateKey(row.date)
    if (k) keys.add(k)
  }
  const brief = (order.mpPublishMeta as Record<string, unknown> | undefined)?.briefStructured as
    | { visitDate?: string }
    | undefined
  if (brief?.visitDate) {
    const k = extractVisitDateKey(brief.visitDate)
    if (k) keys.add(k)
  }
  return [...keys]
}

export function checkApplyScheduleConflict(params: {
  orders: RegistryMpRecruitmentOrder[]
  targetOrder: RegistryMpRecruitmentOrder
  applicant: RegistryMpRecruitmentApplicant
  preferredVisitDate?: string
}): { ok: true } | { ok: false; message: string; conflicts: ScheduleConflictItem[] } {
  const match: TalentIdentityMatch = {
    talentMemberId: params.applicant.talentMemberId,
    wxOpenId: params.applicant.wxOpenId,
    platformAccount: params.applicant.platformAccount,
  }
  const existing = collectTalentConfirmedSchedules(params.orders, match, params.targetOrder.id)
  if (!existing.length) return { ok: true }

  const targetDates = new Set<string>()
  const pref = extractVisitDateKey(String(params.preferredVisitDate || '').trim())
  if (pref) targetDates.add(pref)
  for (const k of orderVisitDateKeys(params.targetOrder)) targetDates.add(k)

  const conflicts =
    targetDates.size > 0
      ? existing.filter((c) => targetDates.has(c.dateKey))
      : existing

  if (!conflicts.length) return { ok: true }

  const first = conflicts[0]!
  return {
    ok: false,
    message: `该日已有确认排期：${first.dateKey}「${first.title}」${first.assignedVisitAt ? `（${first.assignedVisitAt}）` : ''}`,
    conflicts,
  }
}

const CONFIRM_SCHEDULE_CONFLICT_MSG =
  '该日期时段已有其它探店档期，继续提交可能存在爽约风险'

function extractSlotTailFromVisitAt(raw: string): string {
  const s = String(raw || '').trim()
  const m = s.match(/\d{4}[\/\-年]\d{1,2}[\/\-月]\d{1,2}[日]?\s+(.+)$/i)
  return m ? String(m[1] || '').trim() : ''
}

function resolveOccupiedVisitSlot(
  a: RegistryMpRecruitmentApplicant,
): { dateKey: string; slotKey: string } | null {
  const st = String(a.visitAssignmentStatus || '').trim()
  if (st === 'declined') return null

  let rawAt = ''
  const slotHint = String(a.visitTimeSlot || '').trim()
  const assigned = String(a.assignedVisitAt || '').trim()
  const preferred = String(a.talentPreferredVisitAt || '').trim()
  const confirmedAt = String(a.scheduleConfirmedAt || '').trim()

  if (st === 'confirmed' || st === 'pending_talent_confirm') {
    rawAt = assigned
  } else if (preferred && confirmedAt) {
    rawAt = preferred
  } else if (assigned) {
    rawAt = assigned
  } else {
    return null
  }

  if (!rawAt) return null
  const dateKey = extractVisitDateKey(rawAt)
  if (!dateKey) return null
  const slotKey =
    normalizeSlotCompareKey(slotHint) || normalizeSlotCompareKey(extractSlotTailFromVisitAt(rawAt))
  if (!slotKey) return null
  return { dateKey, slotKey }
}

/** 确认档期时：同达人、其它商单、相同日期+时段则冲突 */
export function checkConfirmScheduleConflict(params: {
  orders: RegistryMpRecruitmentOrder[]
  targetOrderId: string
  applicant: RegistryMpRecruitmentApplicant
  visitDate?: string
  visitTimeSlot?: string
  assignedVisitAt?: string
}): { ok: true } | { ok: false; message: string; code: 'schedule_conflict' } {
  const match: TalentIdentityMatch = {
    talentMemberId: params.applicant.talentMemberId,
    wxOpenId: params.applicant.wxOpenId,
    platformAccount: params.applicant.platformAccount,
  }

  const targetDateKey =
    extractVisitDateKey(String(params.visitDate || '').trim()) ||
    extractVisitDateKey(String(params.assignedVisitAt || '').trim())
  const targetSlotKey =
    normalizeSlotCompareKey(String(params.visitTimeSlot || '').trim()) ||
    normalizeSlotCompareKey(extractSlotTailFromVisitAt(String(params.assignedVisitAt || '').trim()))

  if (!targetDateKey || !targetSlotKey) return { ok: true }

  for (const order of params.orders) {
    if (order.id === params.targetOrderId) continue
    for (const a of order.applicants ?? []) {
      if (!applicantMatchesTalent(a, match)) continue
      const occupied = resolveOccupiedVisitSlot(a)
      if (!occupied) continue
      if (occupied.dateKey === targetDateKey && occupied.slotKey === targetSlotKey) {
        return { ok: false, message: CONFIRM_SCHEDULE_CONFLICT_MSG, code: 'schedule_conflict' }
      }
    }
  }
  return { ok: true }
}

export function findOrderPrUser(
  data: RegistryFile,
  order: RegistryMpRecruitmentOrder,
): RegistryMpPrUser | null {
  const meta = (order.mpPublishMeta || {}) as Record<string, unknown>
  const pubPr = String(meta.prRegistryId || meta.prUserId || '').trim()
  const pubLq = String(meta.lingqiPrId || '').trim()
  const users = data.mpPrUsers ?? []
  if (pubPr) return users.find((u) => u.id === pubPr) ?? null
  if (pubLq) return users.find((u) => u.lingqiPrId === pubLq) ?? null
  return null
}

export function findTalentWatchlistHit(
  pr: RegistryMpPrUser | null | undefined,
  match: TalentIdentityMatch,
): WatchlistHit | null {
  if (!pr) return null
  for (const entry of pr.talentBlacklist ?? []) {
    if (watchlistEntryMatchesTalent(entry, match)) return { list: 'blacklist', entry }
  }
  for (const entry of pr.talentGraylist ?? []) {
    if (watchlistEntryMatchesTalent(entry, match)) return { list: 'graylist', entry }
  }
  return null
}

export function checkTalentBlacklistedOnApply(
  data: RegistryFile,
  order: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant,
): { blocked: false } | { blocked: true; message: string; reason?: string } {
  const pr = findOrderPrUser(data, order)
  const hit = findTalentWatchlistHit(pr, {
    talentMemberId: applicant.talentMemberId,
    wxOpenId: applicant.wxOpenId,
    platformAccount: applicant.platformAccount,
  })
  if (hit?.list === 'blacklist') {
    return {
      blocked: true,
      message: '该达人在团队黑名单中，无法报名此商单',
      reason: hit.entry.reason,
    }
  }
  return { blocked: false }
}

function parseTs(raw: unknown): number | null {
  const s = String(raw || '').trim()
  if (!s) return null
  const t = Date.parse(s.replace(/\//g, '-'))
  return Number.isFinite(t) ? t : null
}

function isLateVideoSubmit(assignedVisitAt: string, videoSubmittedAt: string): boolean {
  const visit = parseTs(assignedVisitAt)
  const submit = parseTs(videoSubmittedAt)
  if (!visit || !submit) return false
  const deadline = visit + 3 * 24 * 60 * 60 * 1000
  return submit > deadline
}

function isProbableNoShow(a: RegistryMpRecruitmentApplicant): boolean {
  if (a.visitStatus === 'no_show') return true
  const assigned = String(a.assignedVisitAt || '').trim()
  if (!assigned || !isApplicantConfirmedSchedule(a)) return false
  const visitDay = extractVisitDateKey(assigned)
  if (!visitDay) return false
  const visitEnd = Date.parse(`${visitDay}T23:59:59`)
  if (!Number.isFinite(visitEnd) || Date.now() < visitEnd + 24 * 60 * 60 * 1000) return false
  if (a.visitCheckInAt || a.videoSubmittedAt) return false
  return !!(a.prSelected || a.merchantSelected)
}

function isProbableLostContact(a: RegistryMpRecruitmentApplicant): boolean {
  if (!(a.prSelected || a.merchantSelected)) return false
  if (a.videoSubmittedAt || a.douyinPublishUrl || a.taskStatus === 'approved') return false
  const selectedAt = parseTs(a.scheduleConfirmedAt || a.appliedAt)
  if (!selectedAt) return false
  return Date.now() - selectedAt > 14 * 24 * 60 * 60 * 1000
}

export function computeTalentCredit(
  orders: RegistryMpRecruitmentOrder[],
  match: TalentIdentityMatch,
): MpTalentCreditSummary {
  let appliedCount = 0
  let completedCount = 0
  let rejectCount = 0
  let passCount = 0
  let submitCount = 0
  let scheduleDeclinedCount = 0
  let noShowCount = 0
  let lostContactCount = 0
  let onTimeEligible = 0
  let onTimeHits = 0

  for (const order of orders) {
    for (const a of order.applicants ?? []) {
      if (!applicantMatchesTalent(a, match)) continue
      appliedCount += 1
      if (a.visitAssignmentStatus === 'declined') scheduleDeclinedCount += 1
      if (isProbableNoShow(a)) noShowCount += 1
      if (isProbableLostContact(a)) lostContactCount += 1
      if (a.videoStatus === 'rejected' || a.scriptStatus === 'rejected') rejectCount += 1
      if (a.videoSubmittedAt || a.scriptSubmittedAt) submitCount += 1
      if (a.videoStatus === 'passed' || a.scriptStatus === 'passed' || a.douyinPublishUrl) passCount += 1
      if (a.taskStatus === 'approved' || a.douyinPublishUrl || a.aiVerifyStatus === 'passed') {
        completedCount += 1
      }
      const assigned = String(a.assignedVisitAt || '').trim()
      const submitted = String(a.videoSubmittedAt || '').trim()
      if (assigned && submitted && (a.prSelected || a.merchantSelected)) {
        onTimeEligible += 1
        if (!isLateVideoSubmit(assigned, submitted)) onTimeHits += 1
      }
    }
  }

  const passRate = submitCount > 0 ? Math.round((passCount / submitCount) * 100) : 100
  const onTimeRate =
    onTimeEligible > 0 ? Math.round((onTimeHits / onTimeEligible) * 100) : completedCount > 0 ? 85 : 100

  let score = 60
  score += Math.min(25, completedCount * 3)
  score += Math.min(15, Math.round(passRate / 10))
  score += Math.min(10, Math.round(onTimeRate / 15))
  score -= Math.min(20, rejectCount * 4)
  score -= Math.min(15, scheduleDeclinedCount * 5)
  score -= Math.min(20, noShowCount * 8)
  score -= Math.min(15, lostContactCount * 6)
  score = Math.max(0, Math.min(100, score))

  const badges: string[] = []
  if (completedCount >= 5) badges.push('履约达人')
  if (passRate >= 85) badges.push('低驳回率')
  if (onTimeRate >= 85) badges.push('按时交片')
  if (completedCount >= 20) badges.push('资深合作')
  if (score >= 90) badges.push('星选优选')
  if (noShowCount >= 2) badges.push('爽约风险')
  if (lostContactCount >= 2) badges.push('失联记录')

  return {
    score,
    completedCount,
    appliedCount,
    passRate,
    onTimeRate,
    rejectCount,
    scheduleDeclinedCount,
    noShowCount,
    lostContactCount,
    badges,
  }
}

export function batchComputeTalentCredit(
  orders: RegistryMpRecruitmentOrder[],
  queries: TalentIdentityMatch[],
): Record<string, MpTalentCreditSummary> {
  const out: Record<string, MpTalentCreditSummary> = {}
  for (const q of queries) {
    const key = String(q.key || q.talentMemberId || q.wxOpenId || q.platformAccount || '').trim()
    if (!key) continue
    out[key] = computeTalentCredit(orders, q)
  }
  return out
}

export function findCooperationPoolEntry(
  pr: RegistryMpPrUser | null | undefined,
  match: TalentIdentityMatch,
): MpCooperationPoolEntry | null {
  if (!pr) return null
  for (const entry of pr.cooperationPool ?? []) {
    if (entry.talentMemberId && match.talentMemberId && entry.talentMemberId === match.talentMemberId) {
      return entry
    }
    if (entry.lingqiTalentId && match.lingqiTalentId && entry.lingqiTalentId === match.lingqiTalentId) {
      return entry
    }
    if (
      entry.platformAccount &&
      match.platformAccount &&
      String(entry.platformAccount).trim().toLowerCase() === String(match.platformAccount).trim().toLowerCase()
    ) {
      return entry
    }
  }
  return null
}

export function listPrWatchlist(
  pr: RegistryMpPrUser,
  list: 'blacklist' | 'graylist',
): MpTalentWatchlistEntry[] {
  const raw = list === 'blacklist' ? pr.talentBlacklist : pr.talentGraylist
  return Array.isArray(raw) ? [...raw] : []
}

export function upsertWatchlistEntry(
  pr: RegistryMpPrUser,
  list: 'blacklist' | 'graylist',
  entry: Omit<MpTalentWatchlistEntry, 'id' | 'addedAt'> & { id?: string },
): RegistryMpPrUser {
  const field = list === 'blacklist' ? 'talentBlacklist' : 'talentGraylist'
  const prev = listPrWatchlist(pr, list)
  const id = String(entry.id || `wl-${Date.now()}`).trim()
  const next: MpTalentWatchlistEntry = {
    id,
    talentMemberId: entry.talentMemberId,
    lingqiTalentId: entry.lingqiTalentId,
    platformAccount: entry.platformAccount,
    wxOpenId: entry.wxOpenId,
    displayName: String(entry.displayName || '达人').trim(),
    platform: entry.platform,
    reason: entry.reason,
    addedAt: prev.find((r) => r.id === id)?.addedAt ?? nowIso(),
    addedBy: entry.addedBy,
  }
  const deduped = prev.filter((r) => !watchlistEntryMatchesTalent(r, next))
  const ix = deduped.findIndex((r) => r.id === id)
  if (ix >= 0) deduped[ix] = next
  else deduped.unshift(next)
  return { ...pr, [field]: deduped.slice(0, 200), updatedAt: nowIso() }
}

export function removeWatchlistEntry(
  pr: RegistryMpPrUser,
  list: 'blacklist' | 'graylist',
  entryId: string,
): RegistryMpPrUser {
  const field = list === 'blacklist' ? 'talentBlacklist' : 'talentGraylist'
  const id = String(entryId || '').trim()
  return {
    ...pr,
    [field]: listPrWatchlist(pr, list).filter((r) => r.id !== id),
    updatedAt: nowIso(),
  }
}

export function watchlistEntryFromApplicant(
  applicant: RegistryMpRecruitmentApplicant,
  reason?: string,
): Omit<MpTalentWatchlistEntry, 'id' | 'addedAt'> {
  return {
    talentMemberId: applicant.talentMemberId,
    platformAccount: applicant.platformAccount,
    wxOpenId: applicant.wxOpenId,
    displayName: String(applicant.platformNickname || applicant.name || '达人').trim(),
    platform: applicant.platform,
    reason,
  }
}

function regionOverlap(orderRegion: string, targetRegion: string, talentCity?: string): boolean {
  const a = String(orderRegion || '').trim()
  const b = String(targetRegion || '').trim()
  if (!a || !b) return false
  if (a.includes(b) || b.includes(a)) return true
  if (talentCity) {
    const city = talentCity.trim()
    const levels = [
      regionMatchesTalent(a, city, '', b),
      regionMatchesTalent(b, city, '', a),
    ]
    return levels.some((loc) => loc === 'same_city' || loc === 'same_province' || loc === 'national')
  }
  return false
}

export function suggestRouteBundledOrders(params: {
  orders: RegistryMpRecruitmentOrder[]
  targetOrder: RegistryMpRecruitmentOrder
  talentCity?: string
  preferredVisitDate?: string
  limit?: number
}): RouteBundleSuggestion[] {
  const target = params.targetOrder
  const targetDates = new Set(orderVisitDateKeys(target))
  const pref = extractVisitDateKey(String(params.preferredVisitDate || '').trim())
  if (pref) targetDates.add(pref)
  const targetRegion = String(target.region || target.storeName || '').trim()
  const limit = Math.max(1, Math.min(10, params.limit ?? 5))
  const out: RouteBundleSuggestion[] = []

  for (const order of params.orders) {
    if (order.id === target.id) continue
    if (order.status !== 'open' && order.status !== 'collecting') continue
    const region = String(order.region || order.storeName || '').trim()
    if (!regionOverlap(region, targetRegion, params.talentCity)) continue

    const dates = orderVisitDateKeys(order)
    const overlap =
      targetDates.size > 0 ? dates.filter((d) => targetDates.has(d)) : dates.slice(0, 1)
    if (!overlap.length && targetDates.size > 0) continue

    const reason =
      overlap.length > 0
        ? `同区域 · 探店日 ${overlap.join('、')}`
        : `同区域 · ${region.split('·')[0]?.trim() || region}`

    out.push({
      id: order.id,
      title: String(order.title || order.storeName || order.id),
      region,
      visitDates: overlap.length ? overlap : dates.slice(0, 3),
      platform: order.platform,
      matchReason: reason,
    })
    if (out.length >= limit) break
  }

  return out.sort((a, b) => (a.visitDates[0] || '').localeCompare(b.visitDates[0] || ''))
}

export function formatCreditLabel(credit: MpTalentCreditSummary): string {
  return `信用 ${credit.score} · 完成 ${credit.completedCount} · 驳回 ${credit.rejectCount} · 准时 ${credit.onTimeRate}%`
}

export function batchWatchlistHitsForApplicants(
  pr: RegistryMpPrUser | null | undefined,
  queries: TalentIdentityMatch[],
): Record<string, WatchlistHit | null> {
  const out: Record<string, WatchlistHit | null> = {}
  for (const q of queries) {
    const key = String(q.key || q.talentMemberId || q.wxOpenId || q.platformAccount || '').trim()
    if (!key) continue
    out[key] = findTalentWatchlistHit(pr, q)
  }
  return out
}

export function batchCooperationPoolHits(
  pr: RegistryMpPrUser | null | undefined,
  queries: TalentIdentityMatch[],
): Record<string, MpCooperationPoolEntry | null> {
  const out: Record<string, MpCooperationPoolEntry | null> = {}
  for (const q of queries) {
    const key = String(q.key || q.talentMemberId || q.wxOpenId || q.platformAccount || '').trim()
    if (!key) continue
    out[key] = findCooperationPoolEntry(pr, q)
  }
  return out
}
