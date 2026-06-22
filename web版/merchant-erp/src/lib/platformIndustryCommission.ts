/**
 * 各行业 × 各平台技术服务费（佣金）参考费率（%），与门店毛利配置 industryCode 对齐。
 * 来源：本地生活团购/外卖公开规则与 gross-margin-advisor 预设类目口径；供报税粗算，非合同费率。
 */
import type { FinancePlatformId } from '../services/financeReconcileApi'

export type GroupbuyCommissionPct = {
  douyin: number
  meituan: number
  xhs: number
}

export type WaimaiCommissionPct = {
  eleme: number
  meituan_waimai: number
  jd_waimai: number
}

export type IndustryPlatformCommissionPreset = {
  industryName: string
  industryPath: string
  groupbuy: GroupbuyCommissionPct
  waimai: WaimaiCommissionPct
}

const DEFAULT_WAIMAI: WaimaiCommissionPct = {
  eleme: 22,
  meituan_waimai: 23,
  jd_waimai: 20,
}

/** 未匹配行业时的默认团购佣金（%） */
export const DEFAULT_GROUPBUY_COMMISSION: GroupbuyCommissionPct = {
  douyin: 6,
  meituan: 8,
  xhs: 5,
}

/** 与 merchantApiGatewayCore gross-margin-advisor presets 同 industryCode */
export const INDUSTRY_PLATFORM_COMMISSION_PRESETS: Record<string, IndustryPlatformCommissionPreset> = {
  '': {
    industryName: '餐饮',
    industryPath: '餐饮 > 火锅/汤锅',
    groupbuy: { douyin: 6, meituan: 8, xhs: 5 },
    waimai: DEFAULT_WAIMAI,
  },
  life_food_hotpot: {
    industryName: '餐饮',
    industryPath: '餐饮 > 火锅/汤锅',
    groupbuy: { douyin: 6, meituan: 8, xhs: 5 },
    waimai: DEFAULT_WAIMAI,
  },
  life_food_bbq: {
    industryName: '餐饮',
    industryPath: '餐饮 > 烧烤',
    groupbuy: { douyin: 6, meituan: 8, xhs: 5 },
    waimai: DEFAULT_WAIMAI,
  },
  life_food_fast: {
    industryName: '餐饮',
    industryPath: '餐饮 > 快餐小吃',
    groupbuy: { douyin: 4, meituan: 6, xhs: 4 },
    waimai: { eleme: 20, meituan_waimai: 21, jd_waimai: 19 },
  },
  life_beauty_hair: {
    industryName: '丽人',
    industryPath: '丽人 > 美发',
    groupbuy: { douyin: 10, meituan: 12, xhs: 8 },
    waimai: DEFAULT_WAIMAI,
  },
  life_beauty_nail: {
    industryName: '丽人',
    industryPath: '丽人 > 美甲美睫',
    groupbuy: { douyin: 10, meituan: 12, xhs: 8 },
    waimai: DEFAULT_WAIMAI,
  },
  life_leisure_ktv: {
    industryName: '休闲娱乐',
    industryPath: '休闲娱乐 > KTV',
    groupbuy: { douyin: 8, meituan: 10, xhs: 6 },
    waimai: DEFAULT_WAIMAI,
  },
  life_sport_gym: {
    industryName: '运动健身',
    industryPath: '运动健身 > 健身房',
    groupbuy: { douyin: 8, meituan: 10, xhs: 7 },
    waimai: DEFAULT_WAIMAI,
  },
}

function clampCommissionPct(n: number): number {
  const x = Math.round(Number(n) * 10) / 10
  if (!Number.isFinite(x)) return 0
  return Math.min(40, Math.max(0, x))
}

export function resolveIndustryCommissionPreset(industryCode: string): IndustryPlatformCommissionPreset {
  const code = (industryCode ?? '').trim()
  return INDUSTRY_PLATFORM_COMMISSION_PRESETS[code] ?? INDUSTRY_PLATFORM_COMMISSION_PRESETS['']
}

/** 按门店配置行业与平台返回佣金率（%，核销额口径粗算） */
export function platformCommissionPctForTax(
  industryCode: string,
  platformId: FinancePlatformId,
): number {
  const preset = resolveIndustryCommissionPreset(industryCode)
  if (platformId === 'douyin') return clampCommissionPct(preset.groupbuy.douyin)
  if (platformId === 'meituan') return clampCommissionPct(preset.groupbuy.meituan)
  if (platformId === 'xhs') return clampCommissionPct(preset.groupbuy.xhs)
  if (platformId === 'eleme') return clampCommissionPct(preset.waimai.eleme)
  if (platformId === 'meituan_waimai') return clampCommissionPct(preset.waimai.meituan_waimai)
  if (platformId === 'jd_waimai') return clampCommissionPct(preset.waimai.jd_waimai)
  return clampCommissionPct(DEFAULT_GROUPBUY_COMMISSION.douyin)
}

export function estimatePlatformCommissionYuan(verifyAmountYuan: number, commissionPct: number): number {
  const base = Number(verifyAmountYuan)
  const pct = Number(commissionPct)
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(pct) || pct <= 0) return 0
  return Math.round((base * pct) / 100)
}
