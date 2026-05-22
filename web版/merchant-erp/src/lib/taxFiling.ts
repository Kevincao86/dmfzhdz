import type { FinancePlatformId, FinanceReconcileRow } from '../services/financeReconcileApi'
import { financePlatformChannel } from '../constants/merchantPlatforms'
import type { MerchantBindingProvider, MerchantPlatformBindingRow } from './merchantPlatformBindings'
import { readMerchantSession } from './merchantSession'

export type TaxPlatformBindingStatus = 'bound' | 'session_only' | 'unbound'

export type TaxPlatformRow = {
  platformId: FinancePlatformId
  platformLabel: string
  channel: 'groupbuy' | 'waimai'
  bindingLabel: string
  bindingStatus: TaxPlatformBindingStatus
  verifyAmountYuan: number
  salesAmountYuan: number
  orderCount: number
  verifyOrderCount: number
}

const SESSION_TOKEN_KEYS: Partial<Record<FinancePlatformId, string>> = {
  douyin: 'meoo_douyin_merchant_token',
  meituan: 'meoo_meituan_merchant_token',
  xhs: 'meoo_xhs_merchant_token',
  eleme: 'meoo_eleme_merchant_token',
  meituan_waimai: 'meoo_meituan_waimai_merchant_token',
  jd_waimai: 'meoo_jd_waimai_merchant_token',
}

const BINDING_PROVIDER_TO_PLATFORM: Partial<Record<MerchantBindingProvider, FinancePlatformId>> = {
  douyin: 'douyin',
  xhs_commercial: 'xhs',
}

export function shanghaiMonthRangeYmd(offsetMonths = 0): { start: string; end: string; label: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + offsetMonths
  const d = new Date(y, m, 1)
  const start = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }).slice(0, 8) + '01'
  const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const end = endDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  const label = `${d.getFullYear()}年${d.getMonth() + 1}月`
  return { start, end, label }
}

export function aggregateReconcileForTax(rows: FinanceReconcileRow[]): Map<FinancePlatformId, {
  verifyAmountYuan: number
  salesAmountYuan: number
  orderCount: number
  verifyOrderCount: number
}> {
  const map = new Map<FinancePlatformId, {
    verifyAmountYuan: number
    salesAmountYuan: number
    orderCount: number
    verifyOrderCount: number
  }>()
  for (const r of rows) {
    const cur = map.get(r.platform) ?? {
      verifyAmountYuan: 0,
      salesAmountYuan: 0,
      orderCount: 0,
      verifyOrderCount: 0,
    }
    cur.verifyAmountYuan += r.verifyAmountYuan
    cur.salesAmountYuan += r.salesAmountYuan
    cur.orderCount += r.orderCount
    cur.verifyOrderCount += r.verifyOrderCount
    map.set(r.platform, cur)
  }
  return map
}

export function buildTaxPlatformRows(
  bindings: MerchantPlatformBindingRow[],
  reconcileRows: FinanceReconcileRow[],
): TaxPlatformRow[] {
  const agg = aggregateReconcileForTax(reconcileRows)
  const bindingByPlatform = new Map<FinancePlatformId, MerchantPlatformBindingRow>()
  for (const b of bindings) {
    const pid = BINDING_PROVIDER_TO_PLATFORM[b.provider]
    if (pid) bindingByPlatform.set(pid, b)
  }

  const platformIds: FinancePlatformId[] = [
    'douyin',
    'meituan',
    'xhs',
    'eleme',
    'meituan_waimai',
    'jd_waimai',
  ]

  return platformIds.map((platformId) => {
    const sums = agg.get(platformId)
    const binding = bindingByPlatform.get(platformId)
    const sessionKey = SESSION_TOKEN_KEYS[platformId]
    const hasSession = sessionKey ? Boolean(readMerchantSession(sessionKey)?.trim()) : false
    let bindingStatus: TaxPlatformBindingStatus = 'unbound'
    if (binding) bindingStatus = 'bound'
    else if (hasSession) bindingStatus = 'session_only'

    const channel = financePlatformChannel(platformId)
    return {
      platformId,
      platformLabel:
        platformId === 'douyin'
          ? '抖音来客'
          : platformId === 'meituan'
            ? '美团点评'
            : platformId === 'xhs'
              ? '小红书'
              : platformId === 'eleme'
                ? '淘宝闪购'
                : platformId === 'meituan_waimai'
                  ? '美团外卖'
                  : '京东外卖',
      channel,
      bindingLabel:
        binding?.bindingLabel ||
        binding?.accountDisplayName ||
        (hasSession ? '已授权（会话）' : '未绑定'),
      bindingStatus,
      verifyAmountYuan: sums?.verifyAmountYuan ?? 0,
      salesAmountYuan: sums?.salesAmountYuan ?? 0,
      orderCount: sums?.orderCount ?? 0,
      verifyOrderCount: sums?.verifyOrderCount ?? 0,
    }
  })
}

export type TaxFilingRecord = {
  id: string
  periodLabel: string
  startDate: string
  endDate: string
  submittedAt: string
  platforms: { platformId: string; verifyAmountYuan: number }[]
  totalVerifyYuan: number
  status: 'exported' | 'submitted_mock'
}

const TAX_FILING_HISTORY_KEY = 'meoo_tax_filing_history_v1'

export function readTaxFilingHistory(): TaxFilingRecord[] {
  try {
    const raw = localStorage.getItem(TAX_FILING_HISTORY_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as TaxFilingRecord[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function appendTaxFilingRecord(record: TaxFilingRecord): void {
  const list = [record, ...readTaxFilingHistory()].slice(0, 24)
  try {
    localStorage.setItem(TAX_FILING_HISTORY_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export function buildTaxExportBlob(rows: TaxPlatformRow[], period: { label: string; start: string; end: string }): Blob {
  const payload = {
    exportedAt: new Date().toISOString(),
    period,
    platforms: rows.map((r) => ({
      platform: r.platformLabel,
      binding: r.bindingLabel,
      bindingStatus: r.bindingStatus,
      verifyAmountYuan: r.verifyAmountYuan,
      salesAmountYuan: r.salesAmountYuan,
      orderCount: r.orderCount,
    })),
    totalVerifyYuan: rows.reduce((s, r) => s + r.verifyAmountYuan, 0),
    note: '本文件为墨典 ERP 报税辅助导出，正式申报请以各平台税务接口或主管税务机关要求为准。',
  }
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
}
