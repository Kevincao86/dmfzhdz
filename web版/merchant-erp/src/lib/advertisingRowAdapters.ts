import type { LocalClueRow, LocalProjectRow, LocalPromotionRow, LocalReportSummary } from './localPromotionTypes'
import type { XhsClueRow, XhsProjectRow, XhsPromotionRow, XhsReportSummary } from './xhsCommercialTypes'

function inferXhsMarketingGoal(row: XhsPromotionRow): string {
  const text = `${row.promotionName} ${row.projectName ?? ''}`
  if (/直播|live/i.test(text)) return 'LIVE'
  return 'VIDEO_IMAGE'
}

export function xhsPromotionToLocal(row: XhsPromotionRow): LocalPromotionRow {
  return {
    ...row,
    marketingGoal: row.marketingGoal ?? inferXhsMarketingGoal(row),
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
