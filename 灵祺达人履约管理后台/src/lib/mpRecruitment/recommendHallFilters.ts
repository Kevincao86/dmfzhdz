import type { MpWorkIdentity } from '../mpWorkIdentity'
import type { RecruitmentOrderRow } from './types'

/** 推荐大厅 Tab（与小程序 recommend 页一致） */
export const RECOMMEND_HALL_SEGMENTS = [
  { id: 'match', label: '智能匹配' },
  { id: 'quality', label: '优质推荐' },
  { id: 'hot', label: '热门全国' },
  { id: 'city', label: '同城急单' },
] as const

export type RecommendHallSegment = (typeof RECOMMEND_HALL_SEGMENTS)[number]['id']

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

/** 推荐大厅 Tab 分段（与小程序 matchOrderSegment 一致） */
export function matchRecommendHallSegment(
  row: RecruitmentOrderRow,
  segment: RecommendHallSegment,
  talentCity: string,
): boolean {
  if (segment === 'match') return true
  if (segment === 'quality') {
    return !!(row.recommended || row.urgent || (row.priceAmount || 0) >= 1000)
  }
  if (segment === 'city') {
    if (!talentCity) return false
    const region = String(row.region || '')
    if (region.includes('全国')) return false
    return region.includes(talentCity)
  }
  return true
}

/** 品牌标签筛选（发布表单 TALENT_TAGS，匹配标题/品类/达人标签） */
export function matchTalentTagFilter(row: RecruitmentOrderRow, filterTag: string): boolean {
  if (!filterTag || filterTag === '全部') return true
  const blob = [
    row.title,
    row.category,
    row.categoryTagsText,
    ...(row.talentTags || []),
  ]
    .join(' ')
  return blob.includes(filterTag)
}

export function segmentEmptyHint(
  segment: RecommendHallSegment,
  talentCity: string,
): string {
  if (segment === 'match') return '请补充平台资料，以便 AI 匹配商单'
  if (segment === 'city' && !talentCity) return '请先在「我的」完善城市信息'
  if (segment === 'city') return `暂无「${talentCity}」同城商单，可看看热门全国`
  return '暂无匹配商单，试试切换分类或筛选'
}

export function segmentSectionSub(segment: RecommendHallSegment): string {
  if (segment === 'match') return '根据你的账号内容与受众特征，智能匹配可能适合你的商单'
  if (segment === 'quality') return '平台精选优质商单，预算充足、报名火热'
  if (segment === 'hot') return '全国热门招募推荐，高曝光高报名商单优先展示'
  return '优先展示您所在城市的急单与同城招募'
}
