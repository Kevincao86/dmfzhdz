import type { AiTaxFilingPreview } from '../lib/aiAgentTypes'
import { loadTaxPlatformRowsForPeriod, shanghaiMonthRangeYmd, type TaxPlatformRow } from '../lib/taxFiling'

function toPreview(rows: TaxPlatformRow[], period: { label: string; start: string; end: string }): AiTaxFilingPreview {
  const platforms = rows.map((r) => ({
    platformId: r.platformId,
    platformLabel: r.platformLabel,
    bindingLabel: r.bindingLabel,
    verifyAmountYuan: r.verifyAmountYuan,
    orderCount: r.orderCount,
    commissionRatePct: r.commissionRatePct,
    commissionAmountYuan: r.commissionAmountYuan,
    status:
      r.bindingStatus === 'unbound' && r.verifyAmountYuan <= 0
        ? ('missing_binding' as const)
        : ('ready' as const),
  }))
  return {
    periodLabel: period.label,
    startDate: period.start,
    endDate: period.end,
    platforms,
    totalVerifyYuan: platforms.reduce((s, p) => s + p.verifyAmountYuan, 0),
    totalCommissionYuan: platforms.reduce((s, p) => s + p.commissionAmountYuan, 0),
    enrichStatus: 'ready',
  }
}

/** 为智能体报税任务生成预览（上月对账汇总 + 平台账单佣金率） */
export async function buildAiTaxFilingPreview(): Promise<AiTaxFilingPreview> {
  const period = shanghaiMonthRangeYmd(-1)
  const packed = await loadTaxPlatformRowsForPeriod(period.start, period.end)
  if (!packed.ok) {
    return {
      periodLabel: period.label,
      startDate: period.start,
      endDate: period.end,
      platforms: [],
      totalVerifyYuan: 0,
      enrichStatus: 'error',
      enrichError: packed.message,
    }
  }
  return toPreview(packed.rows, period)
}
