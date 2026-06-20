import type { LocalClueRow, LocalProjectRow, LocalPromotionRow, LocalReportSummary } from './localPromotionTypes'
import type { XhsClueRow, XhsProjectRow, XhsPromotionRow, XhsReportSummary } from './xhsCommercialTypes'

export function xhsPromotionToLocal(row: XhsPromotionRow): LocalPromotionRow {
  return {
    ...row,
    marketingGoal: row.marketingGoal ?? 'VIDEO_IMAGE',
  }
}

export function xhsProjectToLocal(row: XhsProjectRow): LocalProjectRow {
  return { ...row }
}

export function xhsClueToLocal(row: XhsClueRow): LocalClueRow {
  return { ...row }
}

export function xhsSummaryToLocal(row: XhsReportSummary): LocalReportSummary {
  return { ...row }
}
