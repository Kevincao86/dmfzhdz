import type { MpWorkIdentity } from '../mpWorkIdentity'
import type { RecruitmentOrderRow } from './types'

/** 达人推荐大厅 · 与小程序 pages/recommend ORDER_SEGMENTS 一致 */
export const RECOMMEND_ORDER_SEGMENTS = [
  { id: 'match', label: '智能匹配' },
  { id: 'quality', label: '优质商单' },
  { id: 'hot', label: '热门全国' },
  { id: 'city', label: '同城急单' },
] as const

export type RecommendOrderSegment = (typeof RECOMMEND_ORDER_SEGMENTS)[number]['id']

/** 推荐大厅品类/达人标签 · 与小程序 CATEGORY_FILTERS 一致 */
export const RECOMMEND_CATEGORY_FILTERS = [
  '全部',
  '探店',
  '种草',
  '直播',
  '视频',
  '美食',
  '美妆',
  '家居',
  '数码',
] as const

/** 推荐大厅：工作台身份 → 发单一级对象 */
export function primaryRecruitTargetForIdentity(identity: MpWorkIdentity): 'talent' | 'shoot' | 'edit' {
  if (identity === 'shoot') return 'shoot'
  if (identity === 'edit') return 'edit'
  return 'talent'
}

/** 推荐大厅：仅展示与当前身份匹配的招募对象（达人/拍摄/剪辑互不交叉） */
export function orderMatchesRecommendHallIdentity(
  row: RecruitmentOrderRow,
  identity: MpWorkIdentity,
): boolean {
  if (identity === 'pr') return false
  const target = row.recruitTarget || 'talent'
  return target === primaryRecruitTargetForIdentity(identity)
}

/** 推荐大厅：仅「招募中」「收集中」 */
export function isRecommendHallRecruitingStatus(
  row: Pick<RecruitmentOrderRow, 'status' | 'statusLabel'>,
): boolean {
  const label = String(row.statusLabel || '').trim()
  if (label === '招募中' || label === '收集中') return true
  const s = String(row.status || '').trim()
  return s === 'open' || s === 'collecting'
}

export function filterRecommendHallOrders(
  rows: RecruitmentOrderRow[],
  identity: MpWorkIdentity,
): RecruitmentOrderRow[] {
  return rows.filter(
    (r) => isRecommendHallRecruitingStatus(r) && orderMatchesRecommendHallIdentity(r, identity),
  )
}

/** 品类/达人标签筛选 · 与小程序 matchCategoryFilter 一致 */
export function matchRecommendCategoryFilter(
  row: RecruitmentOrderRow,
  filterCategory: string,
): boolean {
  if (!filterCategory || filterCategory === '全部') return true
  const blob = [
    row.title,
    row.category,
    row.categoryTagsText,
    ...(Array.isArray(row.talentTags) ? row.talentTags : []),
  ]
    .join(' ')
  return blob.includes(filterCategory)
}

/** 分段 Tab 筛选 · 与小程序 matchOrderSegment 一致 */
export function matchRecommendOrderSegment(
  row: RecruitmentOrderRow,
  segment: RecommendOrderSegment,
  talentCity: string,
): boolean {
  if (segment === 'match') return true
  if (segment === 'quality') return !!row.recommended || !!row.urgent || (row.priceAmount || 0) >= 1000
  if (segment === 'city') {
    if (!talentCity) return false
    const region = String(row.region || '')
    if (region.includes('全国')) return false
    return region.includes(talentCity)
  }
  return true
}

export function sortRecommendOrderRows(
  rows: RecruitmentOrderRow[],
  segment: RecommendOrderSegment,
): RecruitmentOrderRow[] {
  return rows.slice().sort((a, b) => {
    const d = (b.matchScore || 0) - (a.matchScore || 0)
    if (d !== 0) return d
    if (segment === 'hot') {
      const h = (b.applicantCount || 0) - (a.applicantCount || 0)
      if (h !== 0) return h
    }
    if (segment === 'quality') {
      const p = (b.priceAmount || 0) - (a.priceAmount || 0)
      if (p !== 0) return p
    }
    return (b.publishedAtMs || 0) - (a.publishedAtMs || 0)
  })
}
