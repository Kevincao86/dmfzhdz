import type { BudgetDisplay } from './types'
import {
  HALL_STATUS_FILTERS,
  MP_STATUS_LABEL,
  isMpOrderRecruiting,
  resolveEffectiveMpStatus,
  statusLabel,
} from './mpOrderStatus'

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

export function parseRecruitCountFromMp(mp: Record<string, unknown>): number {
  if (mp.recruitCount != null) {
    const n = Number.parseInt(String(mp.recruitCount), 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  const summary = [mp.merchantRequirements, mp.recruitmentInfo].filter(Boolean).join('\n')
  const m = String(summary).match(/招募人数[:：]\s*(\d+)/)
  if (m) return Math.max(1, Number.parseInt(m[1], 10) || 1)
  return 1
}

export function formatDeadlineDaysText(deadlineMs: number): string {
  if (!deadlineMs) return '截止日期待定'
  const diff = deadlineMs - Date.now()
  if (diff <= 0) return '已截止'
  const days = Math.ceil(diff / 86400000)
  return days === 1 ? '剩余 1 天' : `剩余 ${days} 天`
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

export function enrichMpOrderListItem(
  mp: Record<string, unknown> | null,
  localItem: { title?: string; mpOrderId?: string; hall?: string },
) {
  const summary = mp
    ? [mp.merchantRequirements, mp.recruitmentInfo].filter(Boolean).join('\n')
    : ''
  const deadlineMs = mp ? resolveDeadlineMsFromMp(mp, summary) : 0
  const status = resolveEffectiveMpStatus(mp?.status, deadlineMs)
  const recruiting = isMpOrderRecruiting(status)
  const applicantCount = Array.isArray(mp?.applicants) ? mp.applicants.length : 0
  const recruitCount = mp ? parseRecruitCountFromMp(mp) : 1
  const meta = mp?.mpPublishMeta as Record<string, unknown> | undefined
  const platform = String(mp?.platform || meta?.platform || '抖音').trim() || '抖音'
  return {
    ...localItem,
    title: localItem.title || String(mp?.title || mp?.customerName || localItem.mpOrderId),
    status,
    statusLabel: statusLabel(status),
    recruiting,
    canToggleRecruit: status !== 'done',
    toggleActionLabel: recruiting ? '停止' : '开始',
    toggleNextStatus: recruiting ? 'closed' : 'open',
    applicantCount,
    recruitCount,
    signupLabel: `报名 ${applicantCount}/${recruitCount} 人`,
    deadlineDaysText: formatDeadlineDaysText(deadlineMs),
    deadlineMs,
    platform,
    recruitTarget: recruitTargetFromMp(mp),
    hallLabel:
      mp?.hall === 'urgent' || mp?.urgent
        ? '急单大厅'
        : mp?.hall === 'ice' || mp?.orderKind === 'recruitment_ice'
          ? '云剪任务'
          : '招募大厅',
  }
}

function pickField(summary: string, key: string) {
  const re = new RegExp(`${key}[:：]([^；;\\n]+)`)
  const m = String(summary || '').match(re)
  return m ? m[1].trim() : ''
}

export function resolveDeadlineMsFromMp(mp: Record<string, unknown>, summary: string): number {
  const fromField =
    parseTs(mp.deadline) ||
    parseTs(pickField(summary, '报名截止')) ||
    parseTs(pickField(summary, '截止')) ||
    parseTs(pickField(summary, '截止时间'))
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
