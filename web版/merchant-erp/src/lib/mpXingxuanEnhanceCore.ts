/**
 * 星选平台增值模块（信用/订阅/合作池/Brief/漏斗/报价/履约时间线）
 * 纯函数 + registry 读写，不改动原有发单/报名主流程。
 */
import type {
  MpBriefStructured,
  MpBriefTemplate,
  MpCooperationPoolEntry,
  MpFulfillmentTimelineEvent,
  MpOrderSubscriptionPrefs,
  RegistryFile,
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpPrUser,
  RegistryMpTalentMember,
} from './opsRegistryTypes.js'

export type MpQuoteSuggestResult = {
  minYuan: number
  maxYuan: number
  suggestYuan: number
  hint: string
}

export type { MpTalentCreditSummary } from './mpXingxuanTrustCore.js'
export {
  batchComputeTalentCredit,
  computeTalentCredit,
  formatCreditLabel,
} from './mpXingxuanTrustCore.js'

export type MpRecruitmentFunnel = {
  mpOrderId: string
  title: string
  viewCount: number
  applyCount: number
  selectedCount: number
  videoSubmittedCount: number
  videoPassedCount: number
  publishLinkCount: number
  conversionApplyPct: number
  conversionSelectPct: number
  conversionPublishPct: number
}

export type MpVideoSubmitChecklist = {
  items: Array<{ id: string; label: string; required: boolean; ok: boolean; tip?: string }>
  allRequiredOk: boolean
}

const nowIso = () => new Date().toISOString()

export function defaultOrderSubscription(): MpOrderSubscriptionPrefs {
  return {
    enabled: false,
    platforms: [],
    cities: [],
    categories: [],
    updatedAt: nowIso(),
  }
}

export function normalizeOrderSubscription(raw: unknown): MpOrderSubscriptionPrefs {
  const d = defaultOrderSubscription()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Record<string, unknown>
  return {
    enabled: o.enabled === true,
    platforms: Array.isArray(o.platforms) ? o.platforms.map(String).filter(Boolean) : [],
    cities: Array.isArray(o.cities) ? o.cities.map(String).filter(Boolean) : [],
    categories: Array.isArray(o.categories) ? o.categories.map(String).filter(Boolean) : [],
    budgetMin: typeof o.budgetMin === 'number' ? o.budgetMin : undefined,
    budgetMax: typeof o.budgetMax === 'number' ? o.budgetMax : undefined,
    urgentOnly: o.urgentOnly === true,
    updatedAt: String(o.updatedAt || nowIso()),
  }
}

export function saveMemberOrderSubscription(
  member: RegistryMpTalentMember,
  prefs: MpOrderSubscriptionPrefs,
): RegistryMpTalentMember {
  return {
    ...member,
    orderSubscription: { ...prefs, updatedAt: nowIso() },
    updatedAt: nowIso(),
  }
}

export function listPrCooperationPool(pr: RegistryMpPrUser): MpCooperationPoolEntry[] {
  return Array.isArray(pr.cooperationPool) ? [...pr.cooperationPool] : []
}

export function upsertCooperationPoolEntry(
  pr: RegistryMpPrUser,
  entry: Omit<MpCooperationPoolEntry, 'id' | 'addedAt'> & { id?: string },
): RegistryMpPrUser {
  const list = listPrCooperationPool(pr)
  const id = String(entry.id || `cp-${Date.now()}`).trim()
  const next: MpCooperationPoolEntry = {
    id,
    talentMemberId: entry.talentMemberId,
    lingqiTalentId: entry.lingqiTalentId,
    talentLibraryId: entry.talentLibraryId,
    displayName: String(entry.displayName || '达人').trim(),
    platform: entry.platform,
    avatarUrl: entry.avatarUrl,
    tags: Array.isArray(entry.tags) ? entry.tags.map(String).filter(Boolean) : [],
    note: entry.note,
    lastCoopAt: entry.lastCoopAt,
    addedAt: list.find((r) => r.id === id)?.addedAt ?? nowIso(),
  }
  const ix = list.findIndex((r) => r.id === id)
  if (ix >= 0) list[ix] = next
  else list.unshift(next)
  return { ...pr, cooperationPool: list.slice(0, 200), updatedAt: nowIso() }
}

export function removeCooperationPoolEntry(pr: RegistryMpPrUser, entryId: string): RegistryMpPrUser {
  const id = String(entryId || '').trim()
  return {
    ...pr,
    cooperationPool: listPrCooperationPool(pr).filter((r) => r.id !== id),
    updatedAt: nowIso(),
  }
}

export function listPrBriefTemplates(pr: RegistryMpPrUser): MpBriefTemplate[] {
  return Array.isArray(pr.briefTemplates) ? [...pr.briefTemplates] : []
}

export function upsertBriefTemplate(
  pr: RegistryMpPrUser,
  tpl: Omit<MpBriefTemplate, 'createdAt' | 'updatedAt'> & { createdAt?: string },
): RegistryMpPrUser {
  const list = listPrBriefTemplates(pr)
  const id = String(tpl.id || `bt-${Date.now()}`).trim()
  const prev = list.find((r) => r.id === id)
  const next: MpBriefTemplate = {
    id,
    title: String(tpl.title || 'Brief 模版').trim(),
    brief: tpl.brief || {},
    bodyMarkdown: tpl.bodyMarkdown,
    createdAt: prev?.createdAt ?? tpl.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  }
  const ix = list.findIndex((r) => r.id === id)
  if (ix >= 0) list[ix] = next
  else list.unshift(next)
  return { ...pr, briefTemplates: list.slice(0, 50), updatedAt: nowIso() }
}

export function removeBriefTemplate(pr: RegistryMpPrUser, tplId: string): RegistryMpPrUser {
  const id = String(tplId || '').trim()
  return {
    ...pr,
    briefTemplates: listPrBriefTemplates(pr).filter((r) => r.id !== id),
    updatedAt: nowIso(),
  }
}

function pushEvent(
  events: MpFulfillmentTimelineEvent[],
  at: string | undefined,
  stage: string,
  label: string,
  note?: string,
) {
  if (!at) return
  events.push({ at, stage, label, note })
}

/** 由现有报名字段推导履约时间线（与 fulfillmentTimeline 合并） */
export function buildFulfillmentTimeline(
  applicant: RegistryMpRecruitmentApplicant,
  order?: RegistryMpRecruitmentOrder | null,
): MpFulfillmentTimelineEvent[] {
  const derived: MpFulfillmentTimelineEvent[] = []
  pushEvent(derived, applicant.appliedAt, 'applied', '已提交报名')
  if (applicant.prSelected || applicant.merchantSelected) {
    pushEvent(derived, applicant.scheduleConfirmedAt, 'selected', '已入选')
  }
  if (applicant.assignedVisitAt || applicant.scheduleAssignedAt) {
    pushEvent(
      derived,
      applicant.scheduleAssignedAt || applicant.scheduleConfirmedAt,
      'scheduled',
      '探店排期',
      applicant.assignedVisitAt,
    )
  }
  if (applicant.visitCheckInAt) {
    pushEvent(derived, applicant.visitCheckInAt, 'checkin', '已到店签到')
  }
  if (applicant.videoSubmittedAt) {
    pushEvent(derived, applicant.videoSubmittedAt, 'video_submitted', '成片已提交')
  }
  if (applicant.videoStatus === 'passed') {
    pushEvent(derived, applicant.completedAt, 'video_passed', '成片审核通过')
  }
  if (applicant.videoStatus === 'rejected') {
    pushEvent(derived, applicant.videoSubmittedAt, 'video_rejected', '成片被驳回', applicant.videoRejectReason)
  }
  if (applicant.scriptSubmittedAt) {
    pushEvent(derived, applicant.scriptSubmittedAt, 'script_submitted', '文稿已提交')
  }
  if (applicant.scriptStatus === 'passed') {
    pushEvent(derived, applicant.scriptSubmittedAt, 'script_passed', '文稿审核通过')
  }
  if (applicant.douyinPublishUrl) {
    pushEvent(derived, applicant.completedAt, 'published', '已回传发布链接')
  }
  if (applicant.aiVerifyStatus === 'passed') {
    pushEvent(derived, applicant.completedAt, 'link_verified', '发布链接 AI 核查通过')
  }
  if (order?.status === 'done' || applicant.taskStatus === 'completed') {
    pushEvent(derived, applicant.completedAt, 'completed', '履约完成')
  }

  const manual = Array.isArray(applicant.fulfillmentTimeline) ? applicant.fulfillmentTimeline : []
  const merged = [...derived, ...manual]
  merged.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  const seen = new Set<string>()
  return merged.filter((e) => {
    const k = `${e.stage}:${e.at}:${e.label}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function computeRecruitmentFunnel(order: RegistryMpRecruitmentOrder): MpRecruitmentFunnel {
  const applicants = order.applicants ?? []
  const applyCount = applicants.length
  const selectedCount = applicants.filter((a) => a.prSelected || a.merchantSelected).length
  const videoSubmittedCount = applicants.filter((a) => a.videoSubmittedAt || a.videoUrl).length
  const videoPassedCount = applicants.filter((a) => a.videoStatus === 'passed').length
  const publishLinkCount = applicants.filter((a) => a.douyinPublishUrl).length
  const viewCount = Math.max(0, Number(order.viewCount) || 0)

  const conversionApplyPct = viewCount > 0 ? Math.round((applyCount / viewCount) * 1000) / 10 : 0
  const conversionSelectPct = applyCount > 0 ? Math.round((selectedCount / applyCount) * 1000) / 10 : 0
  const conversionPublishPct =
    selectedCount > 0 ? Math.round((publishLinkCount / selectedCount) * 1000) / 10 : 0

  return {
    mpOrderId: order.id,
    title: String(order.title || order.storeName || order.id),
    viewCount,
    applyCount,
    selectedCount,
    videoSubmittedCount,
    videoPassedCount,
    publishLinkCount,
    conversionApplyPct,
    conversionSelectPct,
    conversionPublishPct,
  }
}

export function computePrFunnelOverview(
  orders: RegistryMpRecruitmentOrder[],
  prIds: { prRegistryId?: string; lingqiPrId?: string },
): {
  orderCount: number
  totalViews: number
  totalApplies: number
  totalSelected: number
  totalPublished: number
  funnels: MpRecruitmentFunnel[]
} {
  const prRegistryId = String(prIds.prRegistryId || '').trim()
  const lingqiPrId = String(prIds.lingqiPrId || '').trim()
  const mine = orders.filter((o) => {
    const meta = (o.mpPublishMeta || {}) as Record<string, unknown>
    const pubPr = String(meta.prRegistryId || meta.prUserId || '').trim()
    const pubLq = String(meta.lingqiPrId || meta.prLingqiId || '').trim()
    if (prRegistryId && pubPr === prRegistryId) return true
    if (lingqiPrId && pubLq === lingqiPrId) return true
    return o.publisherIdentity === 'pr' && !pubPr && !pubLq && prRegistryId && o.sourceMerchantOrderId === ''
  })

  const funnels = mine.map(computeRecruitmentFunnel)
  return {
    orderCount: funnels.length,
    totalViews: funnels.reduce((s, f) => s + f.viewCount, 0),
    totalApplies: funnels.reduce((s, f) => s + f.applyCount, 0),
    totalSelected: funnels.reduce((s, f) => s + f.selectedCount, 0),
    totalPublished: funnels.reduce((s, f) => s + f.publishLinkCount, 0),
    funnels: funnels.sort((a, b) => (a.mpOrderId < b.mpOrderId ? 1 : -1)).slice(0, 30),
  }
}

export function suggestQuoteRange(input: {
  followers?: number
  platform?: string
  city?: string
  budgetText?: string
}): MpQuoteSuggestResult {
  const fans = Math.max(0, Number(input.followers) || 0)
  let minYuan = 80
  let maxYuan = 300
  if (fans >= 10000) {
    minYuan = 200
    maxYuan = 800
  }
  if (fans >= 50000) {
    minYuan = 500
    maxYuan = 2000
  }
  if (fans >= 100000) {
    minYuan = 800
    maxYuan = 5000
  }
  const budget = String(input.budgetText || '')
  const nums = budget.match(/\d+/g)?.map(Number).filter((n) => n > 0) ?? []
  if (nums.length >= 2) {
    minYuan = Math.min(nums[0]!, nums[1]!)
    maxYuan = Math.max(nums[0]!, nums[1]!)
  } else if (nums.length === 1) {
    maxYuan = nums[0]!
    minYuan = Math.round(maxYuan * 0.6)
  }
  const suggestYuan = Math.round((minYuan + maxYuan) / 2)
  const platform = String(input.platform || '抖音').trim()
  const city = String(input.city || '').trim()
  const hint = `参考 ${platform}${city ? ` · ${city}` : ''} 同类探店，粉丝 ${fans || '未填'}，建议报价 ¥${minYuan}–${maxYuan}`
  return { minYuan, maxYuan, suggestYuan, hint }
}

export function buildVideoSubmitChecklist(opts: {
  hasVideo: boolean
  durationSec?: number
  aiChecked?: boolean
  aiPassed?: boolean
  platform?: string
}): MpVideoSubmitChecklist {
  const items = [
    {
      id: 'file',
      label: '已选择成片文件',
      required: true,
      ok: opts.hasVideo,
      tip: '竖屏 9:16，建议 720P 以上',
    },
    {
      id: 'duration',
      label: '时长 15–180 秒',
      required: true,
      ok: !opts.durationSec || (opts.durationSec >= 15 && opts.durationSec <= 180),
    },
    {
      id: 'disclosure',
      label: '口播/字幕已标注广告或合作',
      required: true,
      ok: true,
      tip: '请自行确认后再提交',
    },
    {
      id: 'ai',
      label: '已通过 AI 违规自检（推荐）',
      required: false,
      ok: opts.aiPassed === true,
      tip: opts.aiChecked && !opts.aiPassed ? '自检未通过，建议修改后重试' : '可在上传前一键自检',
    },
  ]
  const allRequiredOk = items.filter((i) => i.required).every((i) => i.ok)
  return { items, allRequiredOk }
}

export function orderMatchesSubscription(
  order: RegistryMpRecruitmentOrder,
  prefs: MpOrderSubscriptionPrefs,
): boolean {
  if (!prefs.enabled) return false
  if (prefs.urgentOnly && !order.urgent) return false
  const platform = String(order.platform || '').trim()
  if (prefs.platforms.length && !prefs.platforms.some((p) => platform.includes(p))) return false
  const region = String(order.region || '').trim()
  if (prefs.cities.length && !prefs.cities.some((c) => region.includes(c))) return false
  const category = String(order.category || '').trim()
  if (prefs.categories.length && !prefs.categories.some((c) => category.includes(c))) return false
  return true
}

export function syncCooperationPoolFromCompletedOrders(
  data: RegistryFile,
  pr: RegistryMpPrUser,
): RegistryMpPrUser {
  const prRegistryId = pr.id
  const lingqiPrId = pr.lingqiPrId
  let next = pr
  for (const order of data.mpRecruitmentOrders ?? []) {
    const meta = (order.mpPublishMeta || {}) as Record<string, unknown>
    const pubPr = String(meta.prRegistryId || meta.prUserId || '').trim()
    const pubLq = String(meta.lingqiPrId || '').trim()
    if (pubPr !== prRegistryId && pubLq !== lingqiPrId) continue
    for (const a of order.applicants ?? []) {
      if (!(a.prSelected || a.merchantSelected)) continue
      if (!a.douyinPublishUrl && a.videoStatus !== 'passed' && a.taskStatus !== 'completed') continue
      next = upsertCooperationPoolEntry(next, {
        talentMemberId: a.talentMemberId,
        displayName: a.platformNickname || a.name || '达人',
        platform: a.platform,
        tags: ['已合作'],
        lastCoopAt: a.completedAt || a.videoSubmittedAt || order.updatedAt,
      })
    }
  }
  return next
}
