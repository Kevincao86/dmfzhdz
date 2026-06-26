import type {
  MpBriefTemplate,
  MpCooperationPoolEntry,
  MpOrderSubscriptionPrefs,
  MpTalentWatchlistEntry,
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpPrUser,
  RegistrySnapshot,
} from './opsRegistryTypes.js'
import type { MpAccountRow } from './mpAccountAuth.js'
import { findRegistryMemberForAccount, findRegistryPrForAccount } from './mpRegistryProfileGet.js'
import { applicantMatchesTalent, orderOwnedByPr } from './mpTalentCooperationStatsCore.js'

export type TalentCreditStats = {
  score: number
  completedCount: number
  onTimeRate: number
  passRate: number
  rejectCount: number
  noShowCount: number
  scheduleDeclinedCount: number
  badges: string[]
}

export type TalentMatchQuery = {
  key?: string
  talentMemberId?: string
  lingqiTalentId?: string
  platformAccount?: string
  wxOpenId?: string
  platform?: string
}

function parseTs(raw: unknown): number | null {
  const s = String(raw || '').trim()
  if (!s) return null
  const t = Date.parse(s.replace(/\//g, '-'))
  return Number.isFinite(t) ? t : null
}

function collectApplicantsForTalent(
  orders: RegistryMpRecruitmentOrder[],
  query: TalentMatchQuery,
): RegistryMpRecruitmentApplicant[] {
  const out: RegistryMpRecruitmentApplicant[] = []
  for (const order of orders) {
    for (const applicant of order.applicants ?? []) {
      if (!applicant) continue
      if (applicantMatchesTalent(applicant, { ...query, key: query.key || applicant.id })) {
        out.push(applicant)
      }
    }
  }
  return out
}

export function computeTalentCreditFromApplicants(
  applicants: RegistryMpRecruitmentApplicant[],
): TalentCreditStats {
  let completed = 0
  let submitted = 0
  let passed = 0
  let rejected = 0
  let onTime = 0
  let noShow = 0
  let scheduleDeclined = 0

  for (const a of applicants) {
    const vs = String(a.videoStatus || '').trim()
    if (vs === 'passed' || a.completedAt) completed += 1
    if (a.videoSubmittedAt || a.videoUrl) submitted += 1
    if (vs === 'passed') passed += 1
    if (vs === 'rejected') rejected += 1
    if (a.visitStatus === 'no_show') noShow += 1
    if (a.visitAssignmentStatus === 'declined') scheduleDeclined += 1
    if ((a.videoSubmittedAt || a.videoUrl) && vs !== 'rejected') onTime += 1
  }

  const onTimeRate = submitted > 0 ? Math.round((onTime / submitted) * 100) : 100
  const passRate = submitted > 0 ? Math.round((passed / submitted) * 100) : 100
  let score = 68
  score += Math.min(18, completed * 2)
  score += Math.round(onTimeRate * 0.08)
  score += Math.round(passRate * 0.08)
  score -= rejected * 4
  score -= noShow * 10
  score -= scheduleDeclined * 3
  score = Math.max(0, Math.min(100, Math.round(score)))

  const badges: string[] = []
  if (completed >= 5) badges.push('履约达人')
  if (passRate >= 88 && submitted >= 3) badges.push('优质成片')
  if (onTimeRate >= 88 && submitted >= 3) badges.push('守时达人')

  return {
    score,
    completedCount: completed,
    onTimeRate,
    passRate,
    rejectCount: rejected,
    noShowCount: noShow,
    scheduleDeclinedCount: scheduleDeclined,
    badges,
  }
}

export function computeTalentCreditForAccount(
  data: RegistrySnapshot,
  account: MpAccountRow,
  match?: TalentMatchQuery,
): TalentCreditStats {
  const orders = data.mpRecruitmentOrders ?? []
  if (match && (match.talentMemberId || match.platformAccount || match.wxOpenId || match.lingqiTalentId)) {
    return computeTalentCreditFromApplicants(collectApplicantsForTalent(orders, match))
  }
  const member = findRegistryMemberForAccount(data, account)
  const query: TalentMatchQuery = {
    talentMemberId: String(member?.id || account.registry_member_id || '').trim() || undefined,
    lingqiTalentId: String(member?.lingqiTalentId || account.lingqi_talent_id || '').trim() || undefined,
    wxOpenId: String(account.openid || '').trim() || undefined,
  }
  return computeTalentCreditFromApplicants(collectApplicantsForTalent(orders, query))
}

export function prOrdersForAccount(
  data: RegistrySnapshot,
  account: MpAccountRow,
): RegistryMpRecruitmentOrder[] {
  const pr = findRegistryPrForAccount(data, account)
  const prLq = String(account.lingqi_pr_id || pr?.lingqiPrId || '').trim()
  const prReg = String(account.registry_pr_id || pr?.id || '').trim()
  return (data.mpRecruitmentOrders ?? []).filter((o) => orderOwnedByPr(o, prLq, prReg))
}

export function buildRecruitmentFunnelOverview(orders: RegistryMpRecruitmentOrder[]) {
  let totalViews = 0
  let totalApplies = 0
  let totalSelected = 0
  let totalPublished = 0
  const funnels = orders.map((o) => {
    const applicants = o.applicants ?? []
    const selectedIds = new Set((o.selectedApplicantIds ?? []).map(String))
    const applyCount = applicants.length
    const selectedCount = applicants.filter(
      (a) => a.prSelected || selectedIds.has(String(a.id)),
    ).length
    const videoSubmittedCount = applicants.filter((a) => a.videoSubmittedAt || a.videoUrl).length
    const publishedCount = applicants.filter(
      (a) => a.douyinPublishUrl || (a.videoStatus === 'passed' && !!a.completedAt),
    ).length
    totalViews += Math.max(0, Number(o.viewCount ?? 0))
    totalApplies += applyCount
    totalSelected += selectedCount
    totalPublished += publishedCount
    return {
      mpOrderId: o.id,
      title: String(o.title || o.customerName || o.storeName || o.id),
      applyCount,
      selectedCount,
      videoSubmittedCount,
      publishedCount,
    }
  })
  return { totalViews, totalApplies, totalSelected, totalPublished, funnels }
}

function poolEntryFromApplicant(
  applicant: RegistryMpRecruitmentApplicant,
  order: RegistryMpRecruitmentOrder,
): MpCooperationPoolEntry {
  const now = new Date().toISOString()
  const id =
    String(applicant.talentMemberId || '').trim() ||
    `${String(applicant.platformAccount || applicant.wxOpenId || applicant.id).trim()}_${String(applicant.platform || 'douyin')}`
  return {
    id: `cp_${id}`,
    talentMemberId: applicant.talentMemberId,
    lingqiTalentId: applicant.talentMemberId,
    displayName: String(applicant.platformNickname || applicant.name || applicant.platformAccount || '达人'),
    platform: applicant.platform,
    platformAccount: applicant.platformAccount,
    tags: Array.isArray(applicant.accountTags) ? [...applicant.accountTags] : [],
    lastCoopAt: String(applicant.completedAt || order.updatedAt || now),
    addedAt: now,
  }
}

export function syncCooperationPoolFromOrders(
  user: RegistryMpPrUser,
  orders: RegistryMpRecruitmentOrder[],
): MpCooperationPoolEntry[] {
  const map = new Map<string, MpCooperationPoolEntry>()
  for (const entry of user.cooperationPool ?? []) {
    if (entry?.id) map.set(entry.id, entry)
  }
  for (const order of orders) {
    const done =
      order.status === 'done' ||
      order.status === 'closed' ||
      order.status === 'pending_settlement'
    for (const applicant of order.applicants ?? []) {
      const finished =
        applicant.videoStatus === 'passed' ||
        !!applicant.completedAt ||
        !!applicant.douyinPublishUrl
      if (!done && !finished) continue
      const entry = poolEntryFromApplicant(applicant, order)
      const prev = map.get(entry.id)
      map.set(entry.id, prev ? { ...prev, ...entry, tags: [...new Set([...(prev.tags || []), ...(entry.tags || [])])] } : entry)
    }
  }
  return [...map.values()].sort((a, b) => (parseTs(b.lastCoopAt) || 0) - (parseTs(a.lastCoopAt) || 0))
}

export function watchlistMatchesTalent(
  entry: MpTalentWatchlistEntry,
  query: TalentMatchQuery,
): boolean {
  const memberId = String(query.talentMemberId || '').trim()
  const talentId = String(query.lingqiTalentId || '').trim()
  const acc = String(query.platformAccount || '').trim().toLowerCase()
  const openId = String(query.wxOpenId || '').trim()
  if (memberId && entry.talentMemberId === memberId) return true
  if (talentId && entry.lingqiTalentId === talentId) return true
  if (acc && String(entry.platformAccount || '').trim().toLowerCase() === acc) return true
  if (openId && entry.wxOpenId === openId) return true
  return false
}

export function findWatchlistHit(
  user: RegistryMpPrUser,
  query: TalentMatchQuery,
): { list: 'blacklist' | 'graylist'; entry: MpTalentWatchlistEntry } | null {
  for (const entry of user.talentBlacklist ?? []) {
    if (watchlistMatchesTalent(entry, query)) return { list: 'blacklist', entry }
  }
  for (const entry of user.talentGraylist ?? []) {
    if (watchlistMatchesTalent(entry, query)) return { list: 'graylist', entry }
  }
  return null
}

export function findCooperationHit(
  user: RegistryMpPrUser,
  query: TalentMatchQuery,
): MpCooperationPoolEntry | null {
  for (const entry of user.cooperationPool ?? []) {
    if (watchlistMatchesTalent(entry as MpTalentWatchlistEntry, query)) return entry
  }
  return null
}

export function normalizeSubscription(raw: unknown): MpOrderSubscriptionPrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const split = (v: unknown) =>
    String(v || '')
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
  return {
    enabled: !!o.enabled,
    platforms: Array.isArray(o.platforms) ? o.platforms.map(String) : split(o.platforms),
    cities: Array.isArray(o.cities) ? o.cities.map(String) : split(o.cities),
    categories: Array.isArray(o.categories) ? o.categories.map(String) : split(o.categories),
    budgetMin: Number.isFinite(Number(o.budgetMin)) ? Number(o.budgetMin) : undefined,
    budgetMax: Number.isFinite(Number(o.budgetMax)) ? Number(o.budgetMax) : undefined,
    urgentOnly: !!o.urgentOnly,
    updatedAt: new Date().toISOString(),
  }
}

export function matchSubscriptionOrders(
  data: RegistrySnapshot,
  prefs: MpOrderSubscriptionPrefs,
): RegistryMpRecruitmentOrder[] {
  if (!prefs.enabled) return []
  const platSet = new Set(prefs.platforms.map((p) => p.trim()).filter(Boolean))
  const citySet = new Set(prefs.cities.map((c) => c.trim()).filter(Boolean))
  const catSet = new Set(prefs.categories.map((c) => c.trim()).filter(Boolean))
  return (data.mpRecruitmentOrders ?? [])
    .filter((o) => o.status === 'open' || o.status === 'collecting')
    .filter((o) => !prefs.urgentOnly || !!o.urgent)
    .filter((o) => !platSet.size || platSet.has(String(o.platform || '').trim()))
    .filter((o) => !citySet.size || citySet.has(String(o.region || o.hall?.city || '').trim()))
    .filter((o) => {
      if (!catSet.size) return true
      const cat = String(o.category || '').trim()
      return [...catSet].some((c) => cat.includes(c) || c.includes(cat))
    })
    .slice(0, 30)
}

export function suggestQuoteHeuristic(body: Record<string, unknown>) {
  const followers = Math.max(0, Number(body.followers) || 0)
  const budgetText = String(body.budgetText || '').trim()
  const budgetMatch = budgetText.match(/(\d+)/)
  const budget = budgetMatch ? Number(budgetMatch[1]) : 0
  let base = 300
  if (followers >= 500000) base = 2800
  else if (followers >= 100000) base = 1200
  else if (followers >= 50000) base = 800
  else if (followers >= 10000) base = 450
  if (budget > 0) base = Math.round((base + budget) / 2)
  const minYuan = Math.max(100, Math.round(base * 0.75))
  const maxYuan = Math.round(base * 1.35)
  const suggestYuan = Math.round((minYuan + maxYuan) / 2)
  return {
    quote: {
      minYuan,
      maxYuan,
      suggestYuan,
      hint: '基于粉丝量级与商单预算的参考区间，可按实际档期微调',
    },
  }
}

export function upsertBriefTemplateList(
  list: MpBriefTemplate[],
  template: MpBriefTemplate,
): MpBriefTemplate[] {
  const now = new Date().toISOString()
  const id = String(template.id || `bt_${Date.now()}`).trim()
  const next: MpBriefTemplate = {
    ...template,
    id,
    title: String(template.title || '').trim() || '未命名模版',
    createdAt: template.createdAt || now,
    updatedAt: now,
  }
  const idx = list.findIndex((t) => t.id === id)
  if (idx >= 0) {
    const copy = [...list]
    copy[idx] = { ...list[idx], ...next, createdAt: list[idx]!.createdAt || now }
    return copy
  }
  return [next, ...list].slice(0, 40)
}

export function resolvePrUserIndex(
  data: RegistrySnapshot,
  account: MpAccountRow,
): { idx: number; user: RegistryMpPrUser } | null {
  const users = data.mpPrUsers ?? []
  const pr = findRegistryPrForAccount(data, account)
  const prId = String(account.registry_pr_id || pr?.id || '').trim()
  const prLq = String(account.lingqi_pr_id || pr?.lingqiPrId || '').trim()
  const idx = users.findIndex((u) => u.id === prId || u.lingqiPrId === prLq)
  if (idx < 0) return null
  return { idx, user: users[idx]! }
}
