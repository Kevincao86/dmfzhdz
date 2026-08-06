/**
 * 读取「商品列表 / 门店毛利配置」页写入的各平台综合毛利率（%），供财务对账等模块估算毛利。
 * 与 ProductsPage 写入格式一致；按租户隔离，并兼容历史全局键。
 */
import { tenantLocalKey, getActiveTenantStorageId } from './tenantLocalState'

const MEOO_STORE_MARGIN_CONFIG_KEY = 'meoo_store_margin_config_v1'
const MEOO_STORE_GROSS_MARGINS_KEY = 'meoo_store_gross_margins_v1'

const DEFAULT = { douyin: 38, meituan: 35, xhs: 32 } as const

export type StorePlatformMargins = {
  douyin: number
  meituan: number
  xhs: number
}

export type StoreMarginIndustry = {
  code: string
  leafCategoryId: string
  name: string
  path: string
}

export type StoreMarginConfig = {
  margins: StorePlatformMargins
  industry: StoreMarginIndustry
}

function clampPct(n: number): number {
  const x = Math.round(Number(n))
  if (!Number.isFinite(x)) return 0
  return Math.min(100, Math.max(0, x))
}

function parseMargins(o: Record<string, unknown>): StorePlatformMargins {
  const m = (o.margins && typeof o.margins === 'object' ? o.margins : o) as Record<string, unknown>
  return {
    douyin: clampPct(Number(m.douyin ?? DEFAULT.douyin)),
    meituan: clampPct(Number(m.meituan ?? DEFAULT.meituan)),
    xhs: clampPct(Number(m.xhs ?? DEFAULT.xhs)),
  }
}

function asTrimmedString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v != null && v !== '' ? String(v).trim() : ''
}

function parseIndustry(ind: Record<string, unknown>): StoreMarginIndustry {
  return {
    code: asTrimmedString(ind.code),
    leafCategoryId: asTrimmedString(
      ind.leafCategoryId ?? ind.leaf_category_id ?? ind.categoryId ?? ind.category_id,
    ),
    name: asTrimmedString(ind.name ?? ind.industryName ?? ind.industry_name),
    path: asTrimmedString(ind.path ?? ind.industryPath ?? ind.industry_path),
  }
}

function emptyIndustry(): StoreMarginIndustry {
  return { code: '', leafCategoryId: '', name: '', path: '' }
}

function industryConfigured(ind: StoreMarginIndustry): boolean {
  return Boolean(ind.path || ind.name || ind.leafCategoryId || ind.code)
}

/** 候选键：当前租户键优先，其次历史全局键 */
function marginConfigReadKeys(): string[] {
  const scoped = tenantLocalKey(MEOO_STORE_MARGIN_CONFIG_KEY)
  if (scoped === MEOO_STORE_MARGIN_CONFIG_KEY) return [MEOO_STORE_MARGIN_CONFIG_KEY]
  return [scoped, MEOO_STORE_MARGIN_CONFIG_KEY]
}

function marginsReadKeys(): string[] {
  const scoped = tenantLocalKey(MEOO_STORE_GROSS_MARGINS_KEY)
  if (scoped === MEOO_STORE_GROSS_MARGINS_KEY) return [MEOO_STORE_GROSS_MARGINS_KEY]
  return [scoped, MEOO_STORE_GROSS_MARGINS_KEY]
}

function parseConfigRaw(raw: string): StoreMarginConfig | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const ind =
      o.industry && typeof o.industry === 'object' ? (o.industry as Record<string, unknown>) : {}
    return {
      margins: parseMargins(o),
      industry: parseIndustry(ind),
    }
  } catch {
    return null
  }
}

/** 未配置或解析失败时返回默认三平台毛利率 */
export function readStoreMarginConfig(): StoreMarginConfig {
  try {
    for (const key of marginConfigReadKeys()) {
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const parsed = parseConfigRaw(raw)
      if (!parsed) continue
      // 租户键若只有默认毛利、无类目，继续尝试全局键（兼容登录前写入）
      if (industryConfigured(parsed.industry) || key === MEOO_STORE_MARGIN_CONFIG_KEY) {
        return parsed
      }
      if (key !== MEOO_STORE_MARGIN_CONFIG_KEY) {
        // 租户键存在但无类目：仍可能是「只改了毛利」的合法配置，先记下，继续看全局是否有类目
        const globalRaw = window.localStorage.getItem(MEOO_STORE_MARGIN_CONFIG_KEY)
        if (globalRaw) {
          const globalParsed = parseConfigRaw(globalRaw)
          if (globalParsed && industryConfigured(globalParsed.industry)) {
            return {
              margins: parsed.margins,
              industry: globalParsed.industry,
            }
          }
        }
        return parsed
      }
    }
    for (const key of marginsReadKeys()) {
      const legacy = window.localStorage.getItem(key)
      if (!legacy) continue
      const o = JSON.parse(legacy) as Record<string, unknown>
      return {
        margins: parseMargins(o),
        industry: emptyIndustry(),
      }
    }
  } catch {
    /* ignore */
  }
  return {
    margins: { ...DEFAULT },
    industry: emptyIndustry(),
  }
}

/** 写入门店毛利配置（租户键；同步迁移一份到全局键便于旧读路径） */
export function writeStoreMarginConfig(cfg: StoreMarginConfig): void {
  const payload: StoreMarginConfig = {
    margins: {
      douyin: clampPct(cfg.margins.douyin),
      meituan: clampPct(cfg.margins.meituan),
      xhs: clampPct(cfg.margins.xhs),
    },
    industry: {
      code: asTrimmedString(cfg.industry.code),
      leafCategoryId: asTrimmedString(cfg.industry.leafCategoryId),
      name: asTrimmedString(cfg.industry.name),
      path: asTrimmedString(cfg.industry.path),
    },
  }
  const json = JSON.stringify(payload)
  const marginsJson = JSON.stringify(payload.margins)
  try {
    const cfgKey = tenantLocalKey(MEOO_STORE_MARGIN_CONFIG_KEY)
    const marginsKey = tenantLocalKey(MEOO_STORE_GROSS_MARGINS_KEY)
    window.localStorage.setItem(cfgKey, json)
    window.localStorage.setItem(marginsKey, marginsJson)
    // 无租户时 cfgKey 即全局键；有租户时双写全局，避免竞品页/旧模块漏读
    if (cfgKey !== MEOO_STORE_MARGIN_CONFIG_KEY) {
      window.localStorage.setItem(MEOO_STORE_MARGIN_CONFIG_KEY, json)
      window.localStorage.setItem(MEOO_STORE_GROSS_MARGINS_KEY, marginsJson)
    }
  } catch {
    /* quota */
  }
  try {
    window.dispatchEvent(
      new CustomEvent('meoo-store-margin-config-changed', {
        detail: { tenantId: getActiveTenantStorageId(), config: payload },
      }),
    )
  } catch {
    /* ignore */
  }
}

/** 用云端/外部对象写入本地（云端须带有效经营类目；本地已有类目时默认不覆盖） */
export function applyStoreMarginConfigFromUnknown(
  raw: unknown,
  opts?: { preferIfLocalEmpty?: boolean },
): StoreMarginConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const ind =
    o.industry && typeof o.industry === 'object' ? (o.industry as Record<string, unknown>) : o
  const industry = parseIndustry(ind)
  if (!industryConfigured(industry)) return null
  const margins = parseMargins(o)
  const next: StoreMarginConfig = { margins, industry }
  const local = readStoreMarginConfig()
  if (opts?.preferIfLocalEmpty && industryConfigured(local.industry)) {
    return local
  }
  writeStoreMarginConfig(next)
  return next
}

export function storeMarginIndustryConfigured(ind?: StoreMarginIndustry | null): boolean {
  if (!ind) return false
  return industryConfigured(ind)
}

/** 未配置或解析失败时返回默认三平台毛利率 */
export function readStorePlatformMargins(): StorePlatformMargins {
  return readStoreMarginConfig().margins
}

export function marginPercentForFinancePlatform(
  margins: StorePlatformMargins,
  platform: 'douyin' | 'meituan' | 'xhs',
): number {
  return margins[platform]
}

export { MEOO_STORE_MARGIN_CONFIG_KEY, MEOO_STORE_GROSS_MARGINS_KEY }
