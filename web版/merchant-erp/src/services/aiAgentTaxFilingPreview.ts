import type { AiTaxFilingPreview } from '../lib/aiAgentTypes'
import {
  buildTaxPlatformRows,
  shanghaiMonthRangeYmd,
  type TaxPlatformRow,
} from '../lib/taxFiling'
import { listMerchantBindings } from '../lib/merchantPlatformBindings'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { fetchFinanceReconcile } from './financeReconcileApi'

function toPreview(rows: TaxPlatformRow[], period: { label: string; start: string; end: string }): AiTaxFilingPreview {
  const platforms = rows.map((r) => ({
    platformId: r.platformId,
    platformLabel: r.platformLabel,
    bindingLabel: r.bindingLabel,
    verifyAmountYuan: r.verifyAmountYuan,
    orderCount: r.orderCount,
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
    enrichStatus: 'ready',
  }
}

/** 为智能体报税任务生成预览（上月对账汇总 + 绑定状态） */
export async function buildAiTaxFilingPreview(): Promise<AiTaxFilingPreview> {
  const period = shanghaiMonthRangeYmd(-1)
  let bindings: Awaited<ReturnType<typeof listMerchantBindings>> = []
  if (supabaseConfigured && supabase) {
    const [dy, xhs] = await Promise.all([
      listMerchantBindings(supabase, 'douyin'),
      listMerchantBindings(supabase, 'xhs_commercial'),
    ])
    bindings = [...dy, ...xhs]
  }
  const fin = await fetchFinanceReconcile({ startDate: period.start, endDate: period.end })
  if (!fin.ok) {
    return {
      periodLabel: period.label,
      startDate: period.start,
      endDate: period.end,
      platforms: [],
      totalVerifyYuan: 0,
      enrichStatus: 'error',
      enrichError: fin.message,
    }
  }
  const rows = buildTaxPlatformRows(bindings, fin.rows)
  return toPreview(rows, period)
}
