import type { MpWorkIdentity } from '../mpWorkIdentity'
import type { RecruitmentOrderRow } from './types'

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
