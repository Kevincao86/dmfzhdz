/**
 * 读取「商品列表 / 门店毛利配置」页写入的各平台综合毛利率（%），供财务对账等模块估算毛利。
 * 与 ProductsPage 中 MEOO_STORE_MARGIN_CONFIG_KEY / MEOO_STORE_GROSS_MARGINS_KEY 保持一致。
 */

const MEOO_STORE_MARGIN_CONFIG_KEY = 'meoo_store_margin_config_v1'
const MEOO_STORE_GROSS_MARGINS_KEY = 'meoo_store_gross_margins_v1'

const DEFAULT = { douyin: 38, meituan: 35, xhs: 32 } as const

export type StorePlatformMargins = {
  douyin: number
  meituan: number
  xhs: number
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

/** 未配置或解析失败时返回默认三平台毛利率 */
export type StoreMarginIndustry = {
  code: string
  leafCategoryId: string
  name: string
  path: string
}

export function readStoreMarginConfig(): {
  margins: StorePlatformMargins
  industry: StoreMarginIndustry
} {
  try {
    const raw = window.localStorage.getItem(MEOO_STORE_MARGIN_CONFIG_KEY)
    if (raw) {
      const o = JSON.parse(raw) as Record<string, unknown>
      const ind =
        o.industry && typeof o.industry === 'object' ? (o.industry as Record<string, unknown>) : {}
      return {
        margins: parseMargins(o),
        industry: {
          code: typeof ind.code === 'string' ? ind.code : '',
          leafCategoryId: typeof ind.leafCategoryId === 'string' ? ind.leafCategoryId : '',
          name: typeof ind.name === 'string' ? ind.name : '',
          path: typeof ind.path === 'string' ? ind.path : '',
        },
      }
    }
    const legacy = window.localStorage.getItem(MEOO_STORE_GROSS_MARGINS_KEY)
    if (legacy) {
      const o = JSON.parse(legacy) as Record<string, unknown>
      return {
        margins: parseMargins(o),
        industry: { code: '', leafCategoryId: '', name: '', path: '' },
      }
    }
  } catch {
    /* ignore */
  }
  return {
    margins: { ...DEFAULT },
    industry: { code: '', leafCategoryId: '', name: '', path: '' },
  }
}

/** 未配置或解析失败时返回默认三平台毛利率 */
export function readStorePlatformMargins(): StorePlatformMargins {
  try {
    const raw = window.localStorage.getItem(MEOO_STORE_MARGIN_CONFIG_KEY)
    if (raw) {
      const o = JSON.parse(raw) as Record<string, unknown>
      return parseMargins(o)
    }
    const legacy = window.localStorage.getItem(MEOO_STORE_GROSS_MARGINS_KEY)
    if (legacy) {
      const o = JSON.parse(legacy) as Record<string, unknown>
      return parseMargins(o)
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT }
}

export function marginPercentForFinancePlatform(
  margins: StorePlatformMargins,
  platform: 'douyin' | 'meituan' | 'xhs',
): number {
  return margins[platform]
}
