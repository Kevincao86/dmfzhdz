/**
 * 星选 AI 积分经济：消耗规则、50% 毛利下的赠送额度与充值换算。
 * 1 积分内部成本 = MP_POINT_INTERNAL_COST_YUAN；用户支付价中 50% 用于覆盖 AI 成本。
 */
import type { MpLibraryRole, MpMembershipTier } from './mpMembershipCatalog.js'

/** AI 视频检核：2 积分/秒（= 120 积分/分钟） */
export const MP_POINTS_VIDEO_PER_SEC = 2
export const MP_POINTS_VIDEO_PER_MIN = MP_POINTS_VIDEO_PER_SEC * 60

/** 短视频 AI 处理（即梦成片）：80 积分/秒 */
export const MP_POINTS_SHORTVIDEO_PER_SEC = 80

/** 数字人口播（Seedance 分段 i2v）：28 积分/秒 */
export const MP_POINTS_DIGITAL_HUMAN_PER_SEC = 28

/** 灵祺 AI 云剪（ICE 合成）：8 积分/秒 */
export const MP_POINTS_CLOUD_EDIT_PER_SEC = 8

/** 短视频 AI 成片最低扣费（约 5 秒，80 积分/秒） */
export const MP_POINTS_SHORTVIDEO_MIN_CHARGE = 400

/** 数字人成片最低扣费（约 5 秒） */
export const MP_POINTS_DIGITAL_HUMAN_MIN_CHARGE = 110

/** @deprecated 请用 MP_POINTS_SHORTVIDEO_MIN_CHARGE / MP_POINTS_DIGITAL_HUMAN_MIN_CHARGE */
export const MP_POINTS_ADDON_VIDEO_MIN_CHARGE = MP_POINTS_DIGITAL_HUMAN_MIN_CHARGE

/** 云剪成片最低扣费（默认 10 秒档） */
export const MP_POINTS_CLOUD_EDIT_MIN_CHARGE = 80

/** AI 文章/文稿检核：2 积分/次 */
export const MP_POINTS_ARTICLE_PER_USE = 2

/** AI 爆款 Brief 生成：8 积分/篇（含正文生成 + 外网案例检索） */
export const MP_POINTS_BRIEF_PER_USE = 8

/** AI 混剪素材分析：15 积分/次（多模态采样 + 指导文案生成） */
export const MP_POINTS_MIX_MATERIAL_ANALYZE_PER_USE = 15

/** 单积分内部 API 成本（元），用于 50% 毛利反推赠送积分 */
export const MP_POINT_INTERNAL_COST_YUAN = 0.01

/** 订阅价中用于 AI 成本的比例（其余 50% 为毛利） */
export const MP_POINT_PROFIT_MARGIN = 0.5

/** 基础版（免费）注册赠送 */
export const MP_BASIC_GIFT_POINTS = 100

/** 积分充值：50% 毛利 → ¥1 可购 50 积分（成本 ¥0.5） */
export const MP_RECHARGE_POINTS_PER_YUAN = Math.floor(MP_POINT_PROFIT_MARGIN / MP_POINT_INTERNAL_COST_YUAN)

export type MpPointsUsageKind =
  | 'video'
  | 'article'
  | 'brief'
  | 'mix_material_analyze'
  | 'shortvideo'
  | 'cloud_edit'
  | 'digital_human'

export const MP_POINTS_USAGE_KIND_LABELS: Record<MpPointsUsageKind, string> = {
  video: '短视频 AI 检核',
  article: '文稿 AI 检核',
  brief: 'AI爆款Brief生成',
  mix_material_analyze: 'AI 混剪素材分析',
  shortvideo: '短视频 AI 处理',
  cloud_edit: '灵祺 AI 云剪',
  digital_human: '数字人口播',
}

const MP_POINTS_PER_SEC_BY_KIND: Partial<Record<MpPointsUsageKind, number>> = {
  video: MP_POINTS_VIDEO_PER_SEC,
  shortvideo: MP_POINTS_SHORTVIDEO_PER_SEC,
  cloud_edit: MP_POINTS_CLOUD_EDIT_PER_SEC,
  digital_human: MP_POINTS_DIGITAL_HUMAN_PER_SEC,
}

export function isMpPointsDurationKind(kind: MpPointsUsageKind): boolean {
  return kind === 'video' || kind === 'shortvideo' || kind === 'cloud_edit' || kind === 'digital_human'
}

export function isMpPointsAddonGenerationKind(
  kind: MpPointsUsageKind,
): kind is 'shortvideo' | 'cloud_edit' | 'digital_human' {
  return kind === 'shortvideo' || kind === 'cloud_edit' || kind === 'digital_human'
}

export function mpPointsPerSecForKind(kind: MpPointsUsageKind): number | null {
  return MP_POINTS_PER_SEC_BY_KIND[kind] ?? null
}

export function parseMpPointsUsageKind(raw: unknown): MpPointsUsageKind | null {
  const k = String(raw || '').trim()
  if (
    k === 'video' ||
    k === 'article' ||
    k === 'brief' ||
    k === 'mix_material_analyze' ||
    k === 'shortvideo' ||
    k === 'cloud_edit' ||
    k === 'digital_human'
  ) {
    return k
  }
  return null
}

export function formatMpPointsRateLabel(kind: MpPointsUsageKind): string {
  if (kind === 'article') return `${MP_POINTS_ARTICLE_PER_USE} 积分/次`
  if (kind === 'brief') return `${MP_POINTS_BRIEF_PER_USE} 积分/篇`
  if (kind === 'mix_material_analyze') return `${MP_POINTS_MIX_MATERIAL_ANALYZE_PER_USE} 积分/次`
  const rate = mpPointsPerSecForKind(kind)
  if (rate != null) return `${rate} 积分/秒（${rate * 60} 积分/分钟）`
  return '按积分扣费'
}

function mpPointsCostForAddonDuration(kind: 'shortvideo' | 'cloud_edit' | 'digital_human', durationSec: number): number {
  const sec = Math.max(1, Math.ceil(Number(durationSec) || 1))
  const rate = mpPointsPerSecForKind(kind) ?? 0
  const raw = sec * rate
  const min =
    kind === 'cloud_edit'
      ? MP_POINTS_CLOUD_EDIT_MIN_CHARGE
      : kind === 'shortvideo'
        ? MP_POINTS_SHORTVIDEO_MIN_CHARGE
        : MP_POINTS_DIGITAL_HUMAN_MIN_CHARGE
  return Math.max(min, raw)
}

export function mpPointsCostForUsage(kind: MpPointsUsageKind, opts?: { durationSec?: number }): number {
  if (kind === 'shortvideo' || kind === 'cloud_edit' || kind === 'digital_human') {
    return mpPointsCostForAddonDuration(kind, Number(opts?.durationSec) || 1)
  }
  if (kind === 'video') {
    const sec = Math.max(1, Math.ceil(Number(opts?.durationSec) || 1))
    return sec * MP_POINTS_VIDEO_PER_SEC
  }
  if (kind === 'brief') return MP_POINTS_BRIEF_PER_USE
  if (kind === 'mix_material_analyze') return MP_POINTS_MIX_MATERIAL_ANALYZE_PER_USE
  return MP_POINTS_ARTICLE_PER_USE
}

/** 按视频时长（秒）结算积分 */
export function mpPointsCostForVideoSeconds(durationSec: number): number {
  return mpPointsCostForUsage('video', { durationSec })
}

/** 按视频时长（分钟，可小数）结算积分 */
export function mpPointsCostForVideoMinutes(durationMin: number): number {
  const sec = Math.max(1, Math.ceil(Number(durationMin) * 60))
  return mpPointsCostForVideoSeconds(sec)
}

export type MpPointsEquivalents = {
  videoMinutes: number
  articleUses: number
  briefUses: number
}

export function mpPointsEquivalents(points: number): MpPointsEquivalents {
  const p = Math.max(0, Math.floor(Number(points) || 0))
  return {
    videoMinutes: Math.floor(p / MP_POINTS_VIDEO_PER_MIN),
    articleUses: Math.floor(p / MP_POINTS_ARTICLE_PER_USE),
    briefUses: Math.floor(p / MP_POINTS_BRIEF_PER_USE),
  }
}

/** 月付折后价（元）→ 赠送积分（50% 毛利，未取整） */
export function computeGiftPointsForMonthlyPrice(priceYuan: number | null | undefined): number {
  const price = Number(priceYuan)
  if (!Number.isFinite(price) || price <= 0) return MP_BASIC_GIFT_POINTS
  const budget = price * MP_POINT_PROFIT_MARGIN
  return Math.max(MP_BASIC_GIFT_POINTS, Math.floor(budget / MP_POINT_INTERNAL_COST_YUAN))
}

/**
 * 测算积分取整：995→1000、2995→3000、7950→8000、19950→20000（四舍五入到整千；小于 500 保持原值如 100）
 */
export function roundGiftPointsCalculated(raw: number): number {
  const n = Math.max(0, Math.floor(Number(raw) || 0))
  if (n <= 0) return MP_BASIC_GIFT_POINTS
  if (n < 500) return n
  return Math.round(n / 1000) * 1000
}

/** 月付折后价 → 取整后的赠送积分 */
export function computeGiftPointsForMonthlyPriceRounded(priceYuan: number | null | undefined): number {
  return roundGiftPointsCalculated(computeGiftPointsForMonthlyPrice(priceYuan))
}

/** 充值金额（元）→ 积分 */
export function computeRechargePoints(yuan: number): number {
  const y = Number(yuan)
  if (!Number.isFinite(y) || y <= 0) return 0
  return Math.floor(y * MP_RECHARGE_POINTS_PER_YUAN)
}

/** 充值金额（分）→ 积分 */
export function computeRechargePointsFromCents(cents: number): number {
  return computeRechargePoints(cents / 100)
}

/** 积分 → 应付金额（元） */
export function computeRechargeYuanForPoints(points: number): number {
  const p = Math.max(0, Math.floor(Number(points) || 0))
  if (p <= 0) return 0
  return p / MP_RECHARGE_POINTS_PER_YUAN
}

/** 积分 → 应付金额（分） */
export function computeRechargeCentsForPoints(points: number): number {
  const y = computeRechargeYuanForPoints(points)
  if (y <= 0) return 0
  return Math.round(y * 100)
}

/** 解析充值请求：支持 points 或 yuan（整数元），返回积分与应付分 */
export function resolveRechargePointsAndCents(body: {
  points?: unknown
  yuan?: unknown
}): { points: number; amountCents: number } | { error: string } {
  const rawPoints = body.points
  const rawYuan = body.yuan
  const hasPoints = rawPoints != null && String(rawPoints).trim() !== ''
  const hasYuan = rawYuan != null && String(rawYuan).trim() !== ''
  if (hasPoints && hasYuan) {
    const points = Math.floor(Number(rawPoints))
    const yuan = Number(rawYuan)
    if (!Number.isFinite(points) || points <= 0) return { error: 'invalid_points' }
    if (!Number.isFinite(yuan) || yuan < 1 || yuan > 50000) return { error: 'invalid_yuan' }
    const preset = MP_RECHARGE_TIER_PRESETS.find((t) => t.points === points && t.yuan === yuan)
    if (preset) {
      return { points: preset.points, amountCents: Math.round(preset.yuan * 100) }
    }
    return { error: 'points_amount_mismatch' }
  }
  if (!hasPoints && !hasYuan) return { error: 'missing_recharge_amount' }

  if (hasYuan) {
    const yuan = Number(rawYuan)
    if (!Number.isFinite(yuan) || yuan < 1 || yuan > 50000) return { error: 'invalid_yuan' }
    const points = computeRechargePoints(yuan)
    if (points <= 0) return { error: 'invalid_points' }
    return { points, amountCents: Math.round(yuan * 100) }
  }

  const points = Math.floor(Number(rawPoints))
  if (!Number.isFinite(points) || points < MP_RECHARGE_POINTS_PER_YUAN) return { error: 'invalid_points' }
  if (points > 2_500_000) return { error: 'points_too_large' }
  const preset = findRechargeTierPresetByPoints(points)
  if (preset) {
    return { points: preset.points, amountCents: Math.round(preset.yuan * 100) }
  }
  const amountCents = computeRechargeCentsForPoints(points)
  if (amountCents <= 0) return { error: 'invalid_amount' }
  const expectedPoints = computeRechargePoints(amountCents / 100)
  if (expectedPoints !== points) return { error: 'points_amount_mismatch' }
  return { points, amountCents }
}

export function formatPointsEquivalentsLine(points: number): string {
  const eq = mpPointsEquivalents(points)
  return `约 ${eq.videoMinutes} 分钟视频检核 · ${eq.articleUses} 次文稿检核 · ${eq.briefUses} 篇 Brief`
}

export function formatComplianceBillingSuffix(res: {
  durationSec?: number
  videoMinutesBilled?: number
  pointsCharged?: number
  billingKind?: MpPointsUsageKind
} | null | undefined): string {
  if (!res) return ''
  const pts = Number(res.pointsCharged)
  if (!Number.isFinite(pts) || pts <= 0) return ''
  if (
    res.billingKind === 'article' ||
    res.billingKind === 'brief' ||
    res.billingKind === 'mix_material_analyze'
  ) {
    return ` · 消耗 ${pts} 积分`
  }
  if (
    res.billingKind === 'shortvideo' ||
    res.billingKind === 'cloud_edit' ||
    res.billingKind === 'digital_human' ||
    res.billingKind === 'video'
  ) {
    const min = Number(res.videoMinutesBilled)
    const sec = Number(res.durationSec)
    if (Number.isFinite(min) && min > 0) {
      const secPart = Number.isFinite(sec) && sec > 0 ? `（${sec} 秒）` : ''
      return ` · ${min} 分钟${secPart} · 消耗 ${pts} 积分`
    }
    if (Number.isFinite(sec) && sec > 0) {
      return ` · ${sec} 秒 · 消耗 ${pts} 积分`
    }
  }
  return ` · 消耗 ${pts} 积分`
}

/** 内置四档默认赠送积分（按各身份月付价测算后取整到整千） */
const GIFT_MONTHLY_PRICE: Record<MpLibraryRole, Record<MpMembershipTier, number | null>> = {
  pr: { basic: 0, pro: 59.9, flagship: 159, enterprise: 399 },
  talent: { basic: 0, pro: 19.9, flagship: 59.9, enterprise: 399 },
  shoot: { basic: 0, pro: 69, flagship: 199, enterprise: 249 },
  edit: { basic: 0, pro: 79, flagship: 229, enterprise: 279 },
}

function buildRoleGiftPoints(role: MpLibraryRole): Record<MpMembershipTier, number> {
  const tiers: MpMembershipTier[] = ['basic', 'pro', 'flagship', 'enterprise']
  const out = {} as Record<MpMembershipTier, number>
  for (const tier of tiers) {
    out[tier] = computeGiftPointsForMonthlyPriceRounded(GIFT_MONTHLY_PRICE[role][tier])
  }
  return out
}

export const MP_DEFAULT_GIFT_POINTS: Record<MpLibraryRole, Record<MpMembershipTier, number>> = {
  pr: buildRoleGiftPoints('pr'),
  talent: buildRoleGiftPoints('talent'),
  shoot: buildRoleGiftPoints('shoot'),
  edit: buildRoleGiftPoints('edit'),
}

/** 赠送积分 → 视频检核参考分钟数（120 积分/分钟） */
export function videoMinutesFromGiftPoints(points: number): number {
  const p = Math.max(0, Math.floor(Number(points) || 0))
  if (p <= 0) return 0
  return Math.max(1, Math.floor(p / MP_POINTS_VIDEO_PER_MIN))
}

/** 赠送积分 → 文稿检核参考次数（2 积分/次） */
export function articleUsesFromGiftPoints(points: number): number {
  const p = Math.max(0, Math.floor(Number(points) || 0))
  return Math.max(0, Math.floor(p / MP_POINTS_ARTICLE_PER_USE))
}

/** 常用充值档位（折后价 yuan；积分固定，优惠档可低于 ¥1=50 积分换算） */
export type MpRechargeTierPreset = {
  yuan: number
  points: number
  label: string
  /** 划线原价（元），用于优惠展示 */
  listPriceYuan?: number
}

export const MP_RECHARGE_TIER_PRESETS: MpRechargeTierPreset[] = [
  { yuan: 10, points: computeRechargePoints(10), label: '体验包' },
  { yuan: 45, points: 2500, label: '标准包', listPriceYuan: 50 },
  { yuan: 88, points: 5000, label: '进阶包', listPriceYuan: 100 },
  { yuan: 438, points: 25000, label: '团队包', listPriceYuan: 500 },
]

export function findRechargeTierPresetByPoints(points: number): MpRechargeTierPreset | undefined {
  const p = Math.floor(Number(points) || 0)
  if (p <= 0) return undefined
  return MP_RECHARGE_TIER_PRESETS.find((t) => t.points === p)
}
