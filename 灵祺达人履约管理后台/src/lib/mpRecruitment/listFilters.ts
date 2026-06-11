import type { BudgetDisplay } from './types'
import {
  HALL_STATUS_FILTERS,
  MP_STATUS_LABEL,
  isMpOrderRecruiting,
  resolveEffectiveMpStatus,
  statusLabel,
} from './mpOrderStatus'
import {
  displayStatusLabel,
  resolveDisplayStatus,
} from '../mpSync/mpOrderIceStatus'
import { buildSignupProgressLabel } from './iceOrderStats'

export { HALL_STATUS_FILTERS, MP_STATUS_LABEL, isMpOrderRecruiting, resolveEffectiveMpStatus, statusLabel }

export const SORT_OPTIONS = ['发布时间', '截止时间', '价格从高到低'] as const

export function parseTs(text: unknown): number {
  if (!text) return 0
  const t = Date.parse(String(text).trim().replace(/-/g, '/'))
  return Number.isFinite(t) ? t : 0
}

export function resolvePriceAmount(mp: Record<string, unknown>, budgetText: string): number {
  if (mp.serviceAmount != null && Number(mp.serviceAmount) > 0) return Number(mp.serviceAmount)
  const nums = String(budgetText || '').replace(/,/g, '').match(/\d+(\.\d+)?/g)
  if (nums?.length) return Number(nums[0]) || 0
  return 0
}

export function resolvePublishedMs(mp: Record<string, unknown>): number {
  return parseTs(mp.createdAt ?? mp.updatedAt)
}

import { isEditTeamIceMpOrder, isIceMpOrder } from '../mpSync/iceOrderDetect'

export function parseRecruitCountFromMp(mp: Record<string, unknown>): number {
  if (mp.recruitCount != null) {
    const n = Number.parseInt(String(mp.recruitCount), 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  const summary = [mp.merchantRequirements, mp.recruitmentInfo].filter(Boolean).join('\n')
  const pack = String(summary).match(/成片位总数[:：]\s*(\d+)/)
  if (pack) return Math.max(1, Number.parseInt(pack[1], 10) || 1)
  const m = String(summary).match(/招募人数[:：]\s*(\d+)/)
  if (m) return Math.max(1, Number.parseInt(m[1], 10) || 1)
  return 1
}

export function parseIceSlotTotalFromMp(mp: Record<string, unknown>): number {
  const slots = Array.isArray(mp.iceVideoSlots) ? mp.iceVideoSlots : []
  if (slots.length > 0) return slots.length
  return parseRecruitCountFromMp(mp)
}

export function formatDeadlineDaysText(deadlineMs: number): string {
  if (!deadlineMs) return '截止日期待定'
  const diff = deadlineMs - Date.now()
  if (diff <= 0) return '已截止'
  const days = Math.ceil(diff / 86400000)
  return days === 1 ? '剩余 1 天' : `剩余 ${days} 天`
}

export type SignupCountdownTone = 'green' | 'orange' | 'danger' | 'ended' | 'unknown'

/** 详情页：报名倒计时（天/时/分/秒） */
export function formatSignupCountdownText(deadlineMs: number, nowMs: number = Date.now()): string {
  if (!deadlineMs) return '截止日期待定'
  const diff = deadlineMs - nowMs
  if (diff <= 0) return '已截止'
  const totalSec = Math.floor(diff / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  if (days > 0) return `剩余 ${days}天 ${hours}小时 ${mins}分 ${secs}秒`
  if (hours > 0) return `剩余 ${hours}小时 ${mins}分 ${secs}秒`
  if (mins > 0) return `剩余 ${mins}分 ${secs}秒`
  if (secs > 0) return `剩余 ${secs}秒`
  return '剩余不足 1 秒'
}

/** 详情页倒计时色调：充裕绿 / 过半橙 / 余1/3深红 / 已截止灰 */
export function resolveSignupCountdownTone(
  deadlineMs: number,
  publishedMs: number,
  nowMs: number = Date.now(),
): SignupCountdownTone {
  if (!deadlineMs) return 'unknown'
  if (deadlineMs <= nowMs) return 'ended'
  const start = publishedMs > 0 && publishedMs < deadlineMs ? publishedMs : deadlineMs - 7 * 86400000
  const total = deadlineMs - start
  if (total <= 0) return 'green'
  const ratio = (deadlineMs - nowMs) / total
  if (ratio > 0.5) return 'green'
  if (ratio > 1 / 3) return 'orange'
  return 'danger'
}

export const SIGNUP_COUNTDOWN_TONE_CLASS: Record<SignupCountdownTone, string> = {
  green: 'signup-countdown signup-countdown--green',
  orange: 'signup-countdown signup-countdown--orange',
  danger: 'signup-countdown signup-countdown--danger',
  ended: 'signup-countdown signup-countdown--ended',
  unknown: 'signup-countdown signup-countdown--unknown',
}

/** 大厅/推荐招募卡片：与详情页相同的报名倒计时文案与色调 */
export function attachHallSignupCountdown<T extends { deadlineMs?: number; publishedAtMs?: number }>(
  row: T,
  nowMs: number = Date.now(),
): T & { signupCountdownText: string; signupCountdownTone: SignupCountdownTone } {
  const deadlineMs = Number(row.deadlineMs) || 0
  const publishedMs = Number(row.publishedAtMs) || 0
  return {
    ...row,
    signupCountdownText: formatSignupCountdownText(deadlineMs, nowMs),
    signupCountdownTone: resolveSignupCountdownTone(deadlineMs, publishedMs, nowMs),
  }
}

export function attachHallSignupCountdowns<T extends { deadlineMs?: number; publishedAtMs?: number }>(
  rows: T[],
  nowMs: number = Date.now(),
): Array<T & { signupCountdownText: string; signupCountdownTone: SignupCountdownTone }> {
  return (rows || []).map((r) => attachHallSignupCountdown(r, nowMs))
}

function pickRequiredTagsFromSummary(text: unknown): string {
  const m = String(text || '').match(/需求(?:品类|达人)标签[:：]\s*([^\n；;]+)/)
  return m ? m[1].trim() : ''
}

/** 大厅卡片底部：所需品类/达人标签（不重复标题） */
export function resolveRequiredCategoryTagsText(
  mp: Record<string, unknown> | null | undefined,
  fallbackCategory?: string,
): string {
  const meta =
    mp?.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : null
  const fromMeta = Array.isArray(meta?.talentTags)
    ? (meta.talentTags as unknown[])
        .map((t) => String(t || '').trim())
        .filter(Boolean)
    : []
  if (fromMeta.length) return fromMeta.join('、')
  const summary = [mp?.merchantRequirements, mp?.recruitmentInfo, mp?.taskDetail].filter(Boolean).join('\n')
  const fromText = pickRequiredTagsFromSummary(summary)
  if (fromText) return fromText
  const cat = String(fallbackCategory || mp?.category || '').trim()
  if (cat && cat !== '本地生活' && cat !== '—') return cat
  return '—'
}

export function resolveSignupClosed(
  mp: Record<string, unknown> | null | undefined,
  opts?: { readOnlyEnded?: boolean; nowMs?: number },
): boolean {
  if (opts?.readOnlyEnded) return true
  if (!mp) return true
  const summary = [mp.merchantRequirements, mp.recruitmentInfo].filter(Boolean).join('\n')
  const deadlineMs = resolveDeadlineMsFromMp(mp, summary)
  const now = opts?.nowMs ?? Date.now()
  const effectiveStatus = resolveEffectiveMpStatus(mp.status, deadlineMs, now)
  if (!isMpOrderRecruiting(effectiveStatus)) return true
  if (deadlineMs > 0 && now >= deadlineMs) return true
  return false
}

export function sortRecruitmentRows<T extends { deadlineMs?: number; priceAmount?: number; publishedAtMs?: number }>(
  rows: T[],
  sortBy: string,
): T[] {
  const list = [...rows]
  if (sortBy === '截止时间') {
    list.sort((a, b) => (a.deadlineMs || 9e15) - (b.deadlineMs || 9e15))
    return list
  }
  if (sortBy === '价格从高到低') {
    list.sort((a, b) => (b.priceAmount || 0) - (a.priceAmount || 0))
    return list
  }
  list.sort((a, b) => (b.publishedAtMs || 0) - (a.publishedAtMs || 0))
  return list
}

function isHallRowRecruitFull(row: {
  iceSlotsFull?: boolean
  recruitCount?: number | string
  applicantCount?: number
}): boolean {
  if (row.iceSlotsFull) return true
  const cap = Number(row.recruitCount)
  const n = Number(row.applicantCount)
  return cap > 0 && n >= cap
}

/** 大厅排序：爆火优先 → 未满临期 → 其他 */
function hallRecruitmentSortTier(row: {
  overRecruitHot?: boolean
  iceSlotsFull?: boolean
  recruitCount?: number | string
  applicantCount?: number
}): number {
  if (row.overRecruitHot) return 0
  if (!isHallRowRecruitFull(row)) return 1
  return 2
}

export function sortHallRecruitmentRows<
  T extends {
    status?: string
    mpStatus?: string
    overRecruitHot?: boolean
    iceSlotsFull?: boolean
    recruitCount?: number | string
    applicantCount?: number
    deadlineMs?: number
    priceAmount?: number
    publishedAtMs?: number
  },
>(rows: T[], sortBy: string): T[] {
  const list = [...rows]
  list.sort((a, b) => {
    const ta = hallRecruitmentSortTier(a)
    const tb = hallRecruitmentSortTier(b)
    if (ta !== tb) return ta - tb
    const da = a.deadlineMs || 9e15
    const db = b.deadlineMs || 9e15
    if (ta <= 1 && da !== db) return da - db
    if (sortBy === '截止时间') return da - db
    if (sortBy === '价格从高到低') return (b.priceAmount || 0) - (a.priceAmount || 0)
    return (b.publishedAtMs || 0) - (a.publishedAtMs || 0)
  })
  return list
}

function buildBudgetDisplay(budgetText: string): BudgetDisplay {
  const raw = budgetText.trim() || '面议'
  if (raw.length > 32) return { kind: 'text', line: `${raw.slice(0, 30)}…`, full: raw }
  return { kind: 'text', line: raw }
}

export type MockRecruitmentRow = {
  id: string
  isMock: boolean
  merchantOrderNo: string
  merchantName: string
  storeName: string
  title: string
  statusLabel: string
  platform: string
  region: string
  category: string
  categoryTagsText?: string
  budgetText: string
  budgetDisplay: BudgetDisplay
  fansRequirement: string
  summary: string
  applicantCount: number
  recruitCount: number
  urgent: boolean
  isIce: boolean
  recommended: boolean
  priceAmount: number
  publishedAtMs: number
  deadlineMs: number
  hideBudget: boolean
}

function buildMockRecruitmentRowCore(partial?: Partial<MockRecruitmentRow>) {
  const now = Date.now()
  const budgetText = partial?.budgetText ?? '¥1,280'
  return {
    id: 'MOCK-DEMO-RECRUIT-001',
    isMock: true,
    merchantOrderNo: 'MO-2026-DEMO',
    merchantName: '静安网红火锅',
    storeName: '静安寺店',
    title: '静安网红火锅·双人探店套餐招募',
    mpStatus: 'open',
    statusLabel: '招募中',
    platform: '抖音',
    region: '上海',
    category: '餐饮美食',
    categoryTagsText: '美食探店',
    budgetText,
    budgetDisplay: buildBudgetDisplay(budgetText),
    fansRequirement: '≥1万',
    summary: '双人套餐探店，需出镜口播+环境展示',
    applicantCount: 2,
    recruitCount: 5,
    urgent: false,
    isIce: false,
    recommended: true,
    priceAmount: 1280,
    publishedAtMs: now - 3 * 3600000,
    deadlineMs: now + 2 * 86400000,
    hideBudget: false,
    ...partial,
  }
}

export function buildMockRecruitmentRow(partial?: Partial<MockRecruitmentRow>) {
  return buildMockRecruitmentRowCore(partial)
}

export function buildMockRecruitmentRows() {
  const now = Date.now()
  return [
    buildMockRecruitmentRow(),
    buildMockRecruitmentRow({
      id: 'MOCK-DEMO-RECRUIT-002',
      title: '陆家嘴日料·双人套餐全国热招',
      merchantName: '鲜语日料',
      region: '全国',
      platform: '小红书',
      budgetText: '¥2,680',
      priceAmount: 2680,
      recommended: true,
      urgent: true,
      applicantCount: 8,
      publishedAtMs: now - 3600000,
      deadlineMs: now + 86400000,
    }),
    buildMockRecruitmentRow({
      id: 'MOCK-DEMO-RECRUIT-003',
      title: '徐汇咖啡馆·氛围感短视频',
      merchantName: '慢享咖啡',
      region: '上海·徐汇',
      budgetText: '¥680',
      priceAmount: 680,
      recommended: false,
      applicantCount: 1,
      publishedAtMs: now - 86400000,
      deadlineMs: now + 5 * 86400000,
    }),
  ]
}

function recruitTargetFromMp(mp: Record<string, unknown> | null): 'talent' | 'shoot' | 'edit' {
  if (!mp) return 'talent'
  const meta = mp.mpPublishMeta as Record<string, unknown> | undefined
  const t = String(meta?.recruitTarget || mp.recruitTarget || '').trim()
  if (t === 'shoot' || t === 'edit') return t
  return 'talent'
}

function hallLabelFromLocal(localItem: { hall?: string }): string {
  if (localItem.hall === 'urgent') return '急单大厅'
  if (localItem.hall === 'ice') return '云剪任务'
  return '招募大厅'
}

export function enrichMpOrderListItem(
  mp: Record<string, unknown> | null,
  localItem: {
    title?: string
    mpOrderId?: string
    hall?: string
    deletedAt?: string
    lastStatus?: string
  },
) {
  if (!mp) {
    let status: string
    if (localItem.deletedAt) {
      status = 'deleted'
    } else {
      status = resolveEffectiveMpStatus(localItem.lastStatus, 0)
    }
    const recruiting = isMpOrderRecruiting(status)
    const deadlineDaysText =
      status === 'done'
        ? '已完成'
        : status === 'deleted'
          ? '—'
          : recruiting
            ? '招募中'
            : status === 'closed'
              ? '已停止'
              : '未同步'
    return {
      ...localItem,
      title: localItem.title || String(localItem.mpOrderId || '历史发单'),
      status,
      statusLabel: statusLabel(status),
      recruiting,
      canToggleRecruit: false,
      toggleActionLabel: '',
      toggleNextStatus: '',
      applicantCount: 0,
      recruitCount: 0,
      signupLabel: '—',
      deadlineDaysText,
      deadlineMs: 0,
      platform: '—',
      recruitTarget: 'talent' as const,
      hallLabel: hallLabelFromLocal(localItem),
      isRemovedFromRegistry: true,
    }
  }

  const summary = [mp.merchantRequirements, mp.recruitmentInfo].filter(Boolean).join('\n')
  const deadlineMs = resolveDeadlineMsFromMp(mp, summary)
  const status = resolveDisplayStatus(mp, 'pr', deadlineMs)
  const recruiting = isMpOrderRecruiting(status)
  const applicantCount = Array.isArray(mp?.applicants) ? mp.applicants.length : 0
  const recruitCount = mp ? parseRecruitCountFromMp(mp) : 1
  const meta = mp?.mpPublishMeta as Record<string, unknown> | undefined
  const platform = String(mp?.platform || meta?.platform || '抖音').trim() || '抖音'
  return {
    ...localItem,
    title: localItem.title || String(mp?.title || mp?.customerName || localItem.mpOrderId),
    status,
    statusLabel: displayStatusLabel(status, mp, 'pr'),
    recruiting,
    canToggleRecruit: status !== 'done',
    toggleActionLabel: recruiting ? '停止' : '开始',
    toggleNextStatus: recruiting ? 'closed' : 'open',
    applicantCount,
    recruitCount,
    signupLabel: buildSignupProgressLabel(mp, applicantCount, recruitCount, 'pr'),
    deadlineDaysText: status === 'done' ? '已完成' : formatDeadlineDaysText(deadlineMs),
    deadlineMs,
    platform,
    recruitTarget: recruitTargetFromMp(mp),
    hallLabel:
      mp?.hall === 'urgent' || mp?.urgent
        ? '急单大厅'
        : mp?.hall === 'ice' || mp?.orderKind === 'recruitment_ice'
          ? '云剪任务'
          : '招募大厅',
    isRemovedFromRegistry: false,
  }
}

function pickField(summary: string, key: string) {
  const re = new RegExp(`${key}[:：]([^；;\\n]+)`)
  const m = String(summary || '').match(re)
  return m ? m[1].trim() : ''
}

export function resolveSignupDeadlineMsFromMp(
  mp: Record<string, unknown>,
  summary?: string,
): number {
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : null
  const text = [
    summary,
    mp.recruitmentInfo,
    mp.taskDetail,
    mp.merchantRequirements,
  ]
    .filter(Boolean)
    .join('\n')
  const fromSignup =
    parseTs(meta?.signupDeadline) || parseTs(pickField(text, '报名截止'))
  if (fromSignup > 0) return fromSignup
  const deliveryMs =
    parseTs(meta?.deliveryDeadline) || parseTs(pickField(text, '交付截止'))
  const deadlineField = parseTs(mp.deadline)
  if (deadlineField > 0 && (!deliveryMs || deadlineField !== deliveryMs)) return deadlineField
  if (mp.urgent) {
    const pub = resolvePublishedMs(mp)
    if (pub > 0) return pub + 86400000
  }
  const pub = resolvePublishedMs(mp)
  return pub > 0 ? pub + 7 * 86400000 : 0
}

export function resolveDeadlineMsFromMp(mp: Record<string, unknown>, summary?: string): number {
  if (isIceMpOrder(mp)) {
    return resolveSignupDeadlineMsFromMp(mp, summary)
  }
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : null
  const text = [
    summary,
    mp.recruitmentInfo,
    mp.taskDetail,
    mp.merchantRequirements,
  ]
    .filter(Boolean)
    .join('\n')
  const fromField =
    parseTs(mp.deadline) ||
    parseTs(meta?.signupDeadline) ||
    parseTs(pickField(text, '报名截止')) ||
    parseTs(pickField(text, '截止')) ||
    parseTs(pickField(text, '截止时间'))
  if (fromField > 0) return fromField
  if (mp.urgent) {
    const pub = resolvePublishedMs(mp)
    if (pub > 0) return pub + 86400000
  }
  const pub = resolvePublishedMs(mp)
  return pub > 0 ? pub + 7 * 86400000 : 0
}

/** 招募大厅：默认仅真实商单；VITE_MP_SHOW_DEMO_ORDERS=true 且无真实单时才补演示 */
export function mergeHallDisplayRows<T extends { id?: string; isMock?: boolean; isIce?: boolean }>(
  realRows: T[],
  opts?: { allowDemo?: boolean },
): T[] {
  const real = (realRows || []).filter((r) => r && !r.isMock)
  if (!opts?.allowDemo) return real
  const demos = buildMockRecruitmentRows().filter((d) => !d.isIce) as unknown as T[]
  if (!real.length) return demos.length ? demos : ([buildMockRecruitmentRow()] as unknown as T[])
  const ids = new Set(real.map((r) => String(r.id || '')))
  const extra = demos.filter((d) => !ids.has(String(d.id || '')))
  return [...real, ...extra]
}
