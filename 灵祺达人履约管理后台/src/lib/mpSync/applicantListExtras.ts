import type { MpRegistry } from '../mpRecruitment/types'
import {
  enrichOrderAiPayload,
  fallbackOrderMatchScore,
  type OrderMatchPayload,
  type TalentMatchProfile,
} from '@merchant/lib/mpRecruitmentMatchShared'
import { resolveRequiredCategoryTagsText } from '../mpRecruitment/listFilters'
import { recruitTargetFromMp } from '../mpRecruitment/orderCard'

export type ApplicantListFilters = {
  searchQuery?: string
  filterSalesLevel?: string
  filterTag?: string
  filterNotified?: '' | 'yes' | 'no'
}

export function buildNotifiedApplicantIdSet(reg: MpRegistry, mpOrderId: string): Set<string> {
  const inbox = Array.isArray(reg.mpTalentInbox) ? reg.mpTalentInbox : []
  const set = new Set<string>()
  const orderId = String(mpOrderId || '').trim()
  if (!orderId) return set
  for (const row of inbox) {
    const r = row as Record<string, unknown>
    if (String(r.mpOrderId || '') !== orderId) continue
    const aid = String(r.applicantId || '').trim()
    if (!aid) continue
    if (r.noticeType === 'selection' || /恭喜入选/.test(String(r.title || ''))) {
      set.add(aid)
    }
  }
  return set
}

export function orderMatchPayloadFromMp(mp: Record<string, unknown>): OrderMatchPayload {
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  const payload: OrderMatchPayload = {
    id: String(mp.id || ''),
    title: String(mp.title || ''),
    platform: String(mp.platform || '抖音'),
    region: String(mp.region || ''),
    category: String(mp.category || ''),
    categoryTagsText: resolveRequiredCategoryTagsText(mp, String(mp.category || '')),
    budgetText: String(mp.budgetText || ''),
    fansRequirement: String(mp.fansRequirement || '不限'),
    recruitTarget: recruitTargetFromMp(mp),
    urgent: !!mp.urgent,
    summary: String(mp.recruitmentInfo || mp.merchantRequirements || '').slice(0, 120),
    talentTags: Array.isArray(meta.talentTags) ? (meta.talentTags as string[]) : [],
    recruitmentInfo: String(mp.recruitmentInfo || ''),
    merchantRequirements: String(mp.merchantRequirements || ''),
    taskDetail: String(mp.taskDetail || ''),
  }
  return enrichOrderAiPayload(payload)
}

export function applicantTalentProfileFromRow(
  applicant: Record<string, unknown>,
  recruitTarget: string,
): TalentMatchProfile {
  const province = String(applicant.province || '').trim()
  const city = String(applicant.city || '').trim()
  const region = String(applicant.region || '').trim()
  const parts = region.split('·').map((s) => s.trim())
  return {
    workIdentity: recruitTarget === 'shoot' ? 'shoot' : recruitTarget === 'edit' ? 'edit' : 'talent',
    recruitTarget,
    platform: String(applicant.platform || '抖音'),
    followers:
      typeof applicant.followers === 'string' || typeof applicant.followers === 'number'
        ? applicant.followers
        : undefined,
    city: city || parts[1] || parts[0] || '',
    province: province || parts[0] || '',
    accountTags: Array.isArray(applicant.accountTags) ? (applicant.accountTags as string[]) : [],
    douyinSalesLevel: String(applicant.douyinSalesLevel || '').trim(),
  }
}

export function enrichApplicantWithExtras<T extends Record<string, unknown>>(
  row: T,
  notifiedIds: Set<string>,
  orderPayload: OrderMatchPayload,
): T & { selectionNotified: boolean; matchScore: number } {
  const id = String(row.id || '')
  const recruitTarget = String(orderPayload.recruitTarget || 'talent')
  const profile = applicantTalentProfileFromRow(row, recruitTarget)
  const { score } = fallbackOrderMatchScore(orderPayload, profile)
  return {
    ...row,
    selectionNotified: notifiedIds.has(id),
    matchScore: score,
  }
}

export function collectApplicantTagOptions(rows: Record<string, unknown>[]): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    const tags = Array.isArray(r.accountTags) ? (r.accountTags as string[]) : []
    for (const t of tags) {
      const s = String(t || '').trim()
      if (s) set.add(s)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export function collectSalesLevelOptions(rows: Record<string, unknown>[]): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    for (const raw of [r.douyinSalesLevel, r.displaySalesLevel]) {
      const lv = String(raw || '').trim()
      if (lv && lv !== '—') set.add(lv)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export function normalizeSearchDigits(v: string): string {
  return String(v || '').replace(/\D/g, '')
}

function salesLevelMatches(row: Record<string, unknown>, filterLevel: string): boolean {
  const want = String(filterLevel || '').trim().toLowerCase()
  if (!want) return true
  for (const raw of [row.douyinSalesLevel, row.displaySalesLevel]) {
    const lv = String(raw || '').trim().toLowerCase()
    if (lv === want || lv.includes(want)) return true
  }
  return false
}

function rowMatchesSearchQuery(row: Record<string, unknown>, query: string): boolean {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  const phoneQ = normalizeSearchDigits(query)
  const acct = String(row.platformAccount || '').trim().toLowerCase()
  const name = String(row.displayName || row.platformNickname || row.name || '')
    .trim()
    .toLowerCase()
  const contact = normalizeSearchDigits(String(row.contact || ''))
  const wechat = String(row.wechatId || '').trim().toLowerCase()
  if (acct.includes(q)) return true
  if (name.includes(q)) return true
  if (phoneQ && contact.includes(phoneQ)) return true
  if (wechat.includes(q)) return true
  return false
}

export function filterApplicantRows<T extends Record<string, unknown>>(
  rows: T[],
  filters: ApplicantListFilters,
): T[] {
  const searchQ = String(filters.searchQuery || '').trim()
  const salesLv = String(filters.filterSalesLevel || '').trim()
  const tag = String(filters.filterTag || '').trim()
  const notified = filters.filterNotified || ''

  return rows.filter((r) => {
    if (searchQ && !rowMatchesSearchQuery(r, searchQ)) return false
    if (salesLv && !salesLevelMatches(r, salesLv)) return false
    if (tag) {
      const tags = Array.isArray(r.accountTags) ? (r.accountTags as string[]) : []
      if (!tags.includes(tag)) return false
    }
    if (notified === 'yes' && !r.selectionNotified) return false
    if (notified === 'no' && r.selectionNotified) return false
    return true
  })
}

export function sortApplicantsByMatchScore<T extends Record<string, unknown>>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      (Number(b.matchScore) || 0) - (Number(a.matchScore) || 0) ||
      (Number(a.index) || 0) - (Number(b.index) || 0),
  )
}

export function enrichAndSortApplicants<T extends Record<string, unknown>>(
  rows: T[],
  reg: MpRegistry,
  mp: Record<string, unknown>,
  mpOrderId: string,
): Array<T & { selectionNotified: boolean; matchScore: number }> {
  const notifiedIds = buildNotifiedApplicantIdSet(reg, mpOrderId)
  const orderPayload = orderMatchPayloadFromMp(mp)
  const enriched = rows.map((row) => enrichApplicantWithExtras(row, notifiedIds, orderPayload))
  return sortApplicantsByMatchScore(enriched)
}
