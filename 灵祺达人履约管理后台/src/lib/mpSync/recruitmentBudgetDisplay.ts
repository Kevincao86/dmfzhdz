import { feeTypeLabel } from './publishFormOptions'
import type { PublishForm } from './publishOrder'

export function buildCompactBudgetText(f: PublishForm) {
  const cps = String(f.cpsPercent || '').trim()
  const prefix = cps ? `CPS ${cps}% · ` : ''
  if (f.feeTypeId === 'fixed') return `${prefix}一口价 ¥${f.fixedPrice}`
  if (f.feeTypeId === 'exchange_only') return `${prefix}纯置换`
  if (f.feeTypeId === 'self_quote') {
    const min = String(f.selfQuoteMin ?? '').trim()
    const max = String(f.selfQuoteMax ?? '').trim()
    const range = min || max ? `${min || '0'}-${max || '∞'}` : '面议'
    return `${prefix}自报价 ${range}`
  }
  if (f.feeTypeId === 'level_tier') {
    const tiers = f.levelTiers || []
    if (!tiers.length) return `${prefix}等级阶梯`
    const prices = tiers
      .map((t) => Number(String(t.price ?? '').replace(/,/g, '')))
      .filter((n) => Number.isFinite(n))
    const range =
      prices.length === 0
        ? ''
        : prices.length === 1 || Math.min(...prices) === Math.max(...prices)
          ? ` ¥${prices[0]}`
          : ` ¥${Math.min(...prices)}~¥${Math.max(...prices)}`
    return `${prefix}等级阶梯 ${tiers.length}档${range}`
  }
  if (f.feeTypeId === 'fans_tier') {
    const tiers = f.fansTiers || []
    if (!tiers.length) return `${prefix}粉丝阶梯`
    const prices = tiers
      .map((t) => Number(String(t.price ?? '').replace(/,/g, '')))
      .filter((n) => Number.isFinite(n))
    const range =
      prices.length && Math.min(...prices) !== Math.max(...prices)
        ? ` ¥${Math.min(...prices)}~¥${Math.max(...prices)}`
        : prices.length
          ? ` ¥${prices[0]}`
          : ''
    return `${prefix}粉丝阶梯 ${tiers.length}档${range}`
  }
  return prefix + (feeTypeLabel(f.feeTypeId) || '面议')
}
