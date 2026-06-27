import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpTalentMember,
  RegistryTalentLibraryEntry,
} from './opsRegistryApi'
import { findMemberForLibraryEntry } from '../meooRegistryShared/talentLibraryFilters'
import { normalizeRecruitmentPlatform } from '../meooRegistryShared/recruitmentInfoFilter'

function parseYuan(raw: unknown): number {
  const s = String(raw ?? '').replace(/[,¥￥元]/g, '').trim()
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function parseRegistryDate(raw: unknown): number | null {
  const s = String(raw || '').trim()
  if (!s) return null
  const t = Date.parse(s.replace(/\//g, '-'))
  return Number.isFinite(t) ? t : null
}

function resolveApplicantQuoteYuan(
  order: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant,
): number {
  const direct = parseYuan(applicant.quotePrice)
  if (direct > 0) return direct
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : {}
  const feeTypeId = String(meta.feeTypeId || '').trim()
  if (feeTypeId === 'fixed') return parseYuan(meta.fixedPrice)
  if (feeTypeId === 'self_quote') {
    return parseYuan(meta.selfQuoteMin) || parseYuan(meta.selfQuoteMax)
  }
  return 0
}

function applicantMatchesEntry(
  applicant: RegistryMpRecruitmentApplicant,
  entry: RegistryTalentLibraryEntry,
  member: RegistryMpTalentMember | null,
): boolean {
  const entryAcc = String(entry.platformAccount || '').trim().toLowerCase()
  const appAcc = String(applicant.platformAccount || '').trim().toLowerCase()
  const entryPlat = normalizeRecruitmentPlatform(entry.platform)
  const appPlat = normalizeRecruitmentPlatform(String(applicant.platform || ''))

  if (entryAcc && appAcc && entryAcc === appAcc) {
    if (!appPlat || appPlat === entryPlat) return true
  }

  const memberId = String(member?.id || '').trim()
  const appMemberId = String((applicant as { talentMemberId?: string }).talentMemberId || '').trim()
  if (memberId && appMemberId && memberId === appMemberId) return true

  const lq = String(entry.lingqiTalentId || member?.lingqiTalentId || '').trim()
  if (lq && appMemberId && lq === appMemberId) return true

  return false
}

export function computeTalentAvgQuoteYuan(
  entry: RegistryTalentLibraryEntry,
  member: RegistryMpTalentMember | null,
  orders: RegistryMpRecruitmentOrder[],
  windowDays: number,
): number | null {
  const cutoff = Date.now() - Math.max(1, windowDays) * 24 * 60 * 60 * 1000
  const prices: number[] = []

  for (const order of orders) {
    const applicants = Array.isArray(order.applicants) ? order.applicants : []
    for (const applicant of applicants) {
      if (!applicant || !applicantMatchesEntry(applicant, entry, member)) continue
      const appliedTs =
        parseRegistryDate(applicant.appliedAt) ||
        parseRegistryDate(applicant.completedAt) ||
        parseRegistryDate(order.updatedAt) ||
        parseRegistryDate(order.createdAt)
      if (appliedTs != null && appliedTs < cutoff) continue
      const yuan = resolveApplicantQuoteYuan(order, applicant)
      if (yuan > 0) prices.push(yuan)
    }
  }

  if (!prices.length) return null
  return Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
}

export function buildTalentAvgQuoteMaps(
  entries: RegistryTalentLibraryEntry[],
  members: RegistryMpTalentMember[],
  orders: RegistryMpRecruitmentOrder[],
): { avg30: Record<string, number | null>; avg90: Record<string, number | null> } {
  const avg30: Record<string, number | null> = {}
  const avg90: Record<string, number | null> = {}
  for (const entry of entries) {
    const member = findMemberForLibraryEntry(entry, members)
    avg30[entry.id] = computeTalentAvgQuoteYuan(entry, member, orders, 30)
    avg90[entry.id] = computeTalentAvgQuoteYuan(entry, member, orders, 90)
  }
  return { avg30, avg90 }
}
