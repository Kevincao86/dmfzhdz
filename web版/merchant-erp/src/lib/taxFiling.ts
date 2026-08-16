import type { FinancePlatformId, FinanceReconcileRow } from '../services/financeReconcileApi'
import { fetchFinanceReconcile } from '../services/financeReconcileApi'
import {
  fetchFinanceCommissionRates,
  type FinanceCommissionRateRow,
} from '../services/financeCommissionRatesApi'
import { financePlatformChannel } from '../constants/merchantPlatforms'
import type { MerchantBindingProvider, MerchantPlatformBindingRow } from './merchantPlatformBindings'
import { listMerchantBindings } from './merchantPlatformBindings'
import {
  estimatePlatformCommissionYuan,
  resolveIndustryCommissionPreset,
  resolveIndustryHintForTax,
} from './platformIndustryCommission'
import { readMerchantSession } from './merchantSession'
import { readStoreMarginConfig, type StoreMarginIndustry } from './storeMarginsRead'
import { getDouyinStores } from '../services/douyinMerchantApi'
import { supabase, supabaseConfigured } from './supabaseClient'

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
  /** 平台账单接口实算佣金率（%）；拉不到则为 0 */
  commissionRatePct: number
  /** 核销额 × 佣金率（元）；未含达人分佣 */
  commissionAmountYuan: number
  commissionSource: 'api' | 'unbound' | 'api_error'
  commissionSourceLabel: string
  commissionError?: string
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

export function collectBoundAccountIndustryHint(bindings: MerchantPlatformBindingRow[]): string {
  return bindings
    .map((b) => [b.bindingLabel, b.accountDisplayName].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' ')
}

/** 绑定账号名 + 来客门店/品牌名，供业态匹配（失败不抛）。 */
export async function collectTaxIndustryHintFromBoundAccounts(
  bindings: MerchantPlatformBindingRow[],
): Promise<string> {
  const parts = [collectBoundAccountIndustryHint(bindings)]
  const token = String(readMerchantSession('meoo_douyin_merchant_token') || '').trim()
  if (token) {
    try {
      const r = await getDouyinStores({
        accessToken: token,
        page: 1,
        pageSize: 80,
        relationType: 'all',
        clientTimeoutMs: 8000,
      })
      if (r.ok) {
        parts.push(
          r.items
            .map((s) => [s.name, s.brandName].filter(Boolean).join(' '))
            .filter(Boolean)
            .join(' '),
        )
      }
    } catch {
      /* 门店列表失败时仍用绑定账号名匹配 */
    }
  }
  return parts.filter((x) => x.trim()).join(' ')
}

export function buildTaxPlatformRows(
  bindings: MerchantPlatformBindingRow[],
  reconcileRows: FinanceReconcileRow[],
  industry?: Pick<StoreMarginIndustry, 'code' | 'path' | 'name'>,
  boundAccountHint = '',
  apiRates: FinanceCommissionRateRow[] = [],
): TaxPlatformRow[] {
  const agg = aggregateReconcileForTax(reconcileRows)
  const bindingByPlatform = new Map<FinancePlatformId, MerchantPlatformBindingRow>()
  for (const b of bindings) {
    const pid = BINDING_PROVIDER_TO_PLATFORM[b.provider]
    if (pid) bindingByPlatform.set(pid, b)
  }
  const rateByPlatform = new Map<string, FinanceCommissionRateRow>()
  for (const r of apiRates) {
    if (r.platformId) rateByPlatform.set(String(r.platformId), r)
  }

  void industry
  void boundAccountHint

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
    const verifyAmountYuan = sums?.verifyAmountYuan ?? 0
    const api = rateByPlatform.get(platformId)
    let commissionRatePct = 0
    let commissionSource: TaxPlatformRow['commissionSource'] = 'unbound'
    let commissionSourceLabel = '未绑定，无法拉取'
    let commissionError: string | undefined
    if (bindingStatus === 'unbound') {
      commissionSource = 'unbound'
      commissionSourceLabel = '未绑定，无法拉取'
    } else if (api?.ok && api.ratePct > 0) {
      commissionRatePct = api.ratePct
      commissionSource = 'api'
      commissionSourceLabel = api.source || '平台账单接口'
    } else {
      commissionSource = 'api_error'
      commissionSourceLabel = '接口未返回佣金率'
      commissionError = api?.error || '平台账单接口未返回佣金率'
    }
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
      verifyAmountYuan,
      salesAmountYuan: sums?.salesAmountYuan ?? 0,
      orderCount: sums?.orderCount ?? 0,
      verifyOrderCount: sums?.verifyOrderCount ?? 0,
      commissionRatePct,
      commissionAmountYuan: estimatePlatformCommissionYuan(verifyAmountYuan, commissionRatePct),
      commissionSource,
      commissionSourceLabel,
      commissionError,
    }
  })
}

export async function loadTaxPlatformRowsForPeriod(
  startDate: string,
  endDate: string,
): Promise<{
  ok: boolean
  message?: string
  rows: TaxPlatformRow[]
  industryCtx: TaxFilingIndustryContext
  warnings: string[]
}> {
  const marginConfig = readStoreMarginConfig()
  let bindings: MerchantPlatformBindingRow[] = []
  if (supabaseConfigured && supabase) {
    const [dy, xhs] = await Promise.all([
      listMerchantBindings(supabase, 'douyin'),
      listMerchantBindings(supabase, 'xhs_commercial'),
    ])
    bindings = [...dy, ...xhs]
  }
  const boundHint = await collectTaxIndustryHintFromBoundAccounts(bindings)
  const industryCtx = resolveTaxFilingIndustryContext(marginConfig.industry, boundHint)
  const [fin, rates] = await Promise.all([
    fetchFinanceReconcile({ startDate, endDate }),
    fetchFinanceCommissionRates({ startDate, endDate }),
  ])
  const warnings: string[] = []
  if (!fin.ok) {
    return { ok: false, message: fin.message, rows: [], industryCtx, warnings }
  }
  if (fin.warnings) warnings.push(...fin.warnings)
  if (!rates.ok) warnings.push(rates.message)
  else if (rates.warnings) warnings.push(...rates.warnings)
  const rows = buildTaxPlatformRows(
    bindings,
    fin.rows,
    marginConfig.industry,
    boundHint,
    rates.ok ? rates.rates : [],
  )
  return { ok: true, rows, industryCtx, warnings }
}

export type TaxFilingIndustryContext = {
  code: string
  path: string
  name: string
  presetPath: string
}

export function resolveTaxFilingIndustryContext(
  industry?: Pick<StoreMarginIndustry, 'code' | 'path' | 'name'>,
  boundAccountHint = '',
): TaxFilingIndustryContext {
  const codeRaw = (industry?.code ?? '').trim()
  const pathRaw = (industry?.path ?? industry?.name ?? '').trim()
  const extra = [boundAccountHint.trim(), pathRaw].filter(Boolean).join(' ')
  const hint = resolveIndustryHintForTax(codeRaw, pathRaw, extra)
  const preset = resolveIndustryCommissionPreset(hint.code, hint.path)
  if (hint.code === '' && boundAccountHint.trim() && hint.path) {
    return {
      code: '',
      path: preset.industryPath,
      name: preset.industryName,
      presetPath: preset.industryPath,
    }
  }
  const path = (industry?.path ?? '').trim() || preset.industryPath
  const name = (industry?.name ?? '').trim() || preset.industryName
  return { code: hint.code || codeRaw, path, name, presetPath: preset.industryPath }
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

export function buildTaxExportBlob(
  rows: TaxPlatformRow[],
  period: { label: string; start: string; end: string },
  industry?: TaxFilingIndustryContext,
): Blob {
  const totalCommissionYuan = rows.reduce((s, r) => s + r.commissionAmountYuan, 0)
  const payload = {
    exportedAt: new Date().toISOString(),
    period,
    industry: industry
      ? {
          code: industry.code,
          name: industry.name,
          path: industry.path,
          presetPath: industry.presetPath,
        }
      : undefined,
    platforms: rows.map((r) => ({
      platform: r.platformLabel,
      binding: r.bindingLabel,
      bindingStatus: r.bindingStatus,
      verifyAmountYuan: r.verifyAmountYuan,
      salesAmountYuan: r.salesAmountYuan,
      orderCount: r.orderCount,
      commissionRatePct: r.commissionRatePct,
      commissionAmountYuan: r.commissionAmountYuan,
      commissionSource: r.commissionSource,
      commissionSourceLabel: r.commissionSourceLabel,
      commissionError: r.commissionError,
    })),
    totalVerifyYuan: rows.reduce((s, r) => s + r.verifyAmountYuan, 0),
    totalCommissionYuan,
    note:
      '本文件为灵祺 ERP 报税辅助导出；平台佣金率一律由各平台账单/分账 OpenAPI 实算（软件服务费÷分账基数），未绑定或接口无权限记 0，禁止本地行业表兜底。正式申报请以主管税务机关要求为准。',
  }
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
}
