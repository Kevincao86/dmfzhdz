import { MP_RECHARGE_POINTS_PER_YUAN } from './mpPointsEconomics.js'

/**
 * 按区间「估算毛利」计费（再套 60% 毛利积分模型：¥1 实付 ≈ 40 积分）。
 * 服务费(元) = 毛利 × 万分之 0.2，夹在 ¥0.375～¥3 → 15～120 积分；毛利为 0 时按 GPT 文本档 25 积分。
 */
export function shopAnalysisAiPointsFromGross(estimatedGrossYuan: number): number {
  const gross = Math.max(0, Number(estimatedGrossYuan) || 0)
  if (gross <= 0) return 25
  const feeYuan = Math.min(3, Math.max(0.375, gross * 0.00002))
  return Math.max(15, Math.min(120, Math.ceil(feeYuan * MP_RECHARGE_POINTS_PER_YUAN)))
}
