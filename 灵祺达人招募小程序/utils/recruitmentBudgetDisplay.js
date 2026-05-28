/** 招募卡片酬劳区智能展示（等级/粉丝阶梯拆标签，避免单行过长） */

const MAX_TIER_CHIPS = 3

function parseCps(raw) {
  const m = String(raw || '').match(/CPS\s*([\d.]+)\s*%/i)
  return m ? `CPS ${m[1]}%` : ''
}

function stripCpsPrefix(raw) {
  return String(raw || '')
    .replace(/^CPS\s*[\d.]+\s*%\s*·\s*/i, '')
    .trim()
}

function compactLevelGroup(levels) {
  const arr = (levels || []).map((l) => String(l || '').trim()).filter(Boolean)
  if (!arr.length) return '—'
  if (arr.length === 1) return arr[0]
  const nums = arr
    .map((l) => {
      const m = l.match(/Lv(\d+)/i)
      return m ? Number(m[1]) : null
    })
    .filter((n) => n != null)
  if (nums.length === arr.length && nums.length >= 2) {
    const sorted = [...nums].sort((a, b) => a - b)
    let ok = true
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] !== 1) ok = false
    }
    if (ok) return `Lv${sorted[0]}~${sorted[sorted.length - 1]}`
  }
  if (arr.length > 2) return `${arr[0]}+${arr.length - 1}级`
  return arr.join('+')
}

function formatTierPrice(price) {
  const s = String(price ?? '').trim()
  if (s === '') return '—'
  if (/^¥/.test(s)) return s
  const n = Number(String(s).replace(/,/g, ''))
  if (Number.isFinite(n)) return `¥${n}`
  return s
}

function tiersFromMeta(meta) {
  if (!meta || typeof meta !== 'object') return null
  if (meta.feeTypeId === 'level_tier' && Array.isArray(meta.levelTiers) && meta.levelTiers.length) {
    return {
      mode: '等级阶梯',
      tiers: meta.levelTiers.map((t) => ({
        label: compactLevelGroup(t.levels),
        price: formatTierPrice(t.price),
      })),
    }
  }
  if (meta.feeTypeId === 'fans_tier' && Array.isArray(meta.fansTiers) && meta.fansTiers.length) {
    return {
      mode: '粉丝阶梯',
      tiers: meta.fansTiers.map((t) => ({
        label: String(t.fansRange || '档位').trim(),
        price: formatTierPrice(t.price),
      })),
    }
  }
  return null
}

function tiersFromBudgetText(body) {
  const b = String(body || '').trim()
  if (/等级阶梯/.test(b)) {
    const rest = b.replace(/^等级阶梯\s*/, '')
    const segments = rest.split(/\s*\/\s*/).filter(Boolean)
    if (!segments.length) return null
    return {
      mode: '等级阶梯',
      tiers: segments.map((seg) => {
        const m = seg.match(/^(.+?)\s*¥\s*([\d,.]+)\s*$/)
        if (m) return { label: m[1].trim(), price: formatTierPrice(m[2]) }
        return { label: seg.trim(), price: '' }
      }),
    }
  }
  if (/粉丝阶梯/.test(b)) {
    const rest = b.replace(/^粉丝阶梯\s*/, '')
    const segments = rest.split(/\s*\/\s*/).filter(Boolean)
    if (!segments.length) return null
    return {
      mode: '粉丝阶梯',
      tiers: segments.map((seg) => {
        const m = seg.match(/^(.+?)\s*¥\s*([\d,.]+)\s*$/)
        if (m) return { label: m[1].trim(), price: formatTierPrice(m[2]) }
        return { label: seg.trim(), price: '' }
      }),
    }
  }
  return null
}

function tierSummary(tiers) {
  const prices = tiers
    .map((t) => Number(String(t.price).replace(/[¥,]/g, '')))
    .filter((n) => Number.isFinite(n))
  if (!prices.length) return `${tiers.length}档`
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  if (min === max) return `${tiers.length}档 · ¥${min}`
  return `${tiers.length}档 · ¥${min}~¥${max}`
}

/**
 * @returns {{ kind: 'text', line: string } | { kind: 'tiers', cps: string, mode: string, summary: string, chips: Array<{label:string,price:string}>, moreCount: number }}
 */
function buildBudgetDisplay(budgetText, mpPublishMeta) {
  const raw = String(budgetText || '').trim() || '面议'
  const cps = parseCps(raw)
  const body = stripCpsPrefix(raw)

  const fromMeta = tiersFromMeta(mpPublishMeta)
  const parsed = fromMeta || tiersFromBudgetText(body)
  if (parsed && parsed.tiers.length) {
    const chips = parsed.tiers.slice(0, MAX_TIER_CHIPS)
    const moreCount = Math.max(0, parsed.tiers.length - MAX_TIER_CHIPS)
    return {
      kind: 'tiers',
      cps,
      mode: parsed.mode,
      summary: tierSummary(parsed.tiers),
      chips,
      moreCount,
    }
  }

  if (raw.length > 32) {
    return { kind: 'text', line: `${raw.slice(0, 30)}…`, full: raw }
  }
  return { kind: 'text', line: raw }
}

/** 发布时写入列表用的短摘要（完整阶梯仍保存在 meta） */
function buildCompactBudgetText(f, feeTypeLabelFn) {
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
          ? `¥${prices[0]}`
          : `¥${Math.min(...prices)}~¥${Math.max(...prices)}`
    return `${prefix}等级阶梯 ${tiers.length}档${range ? ` ${range}` : ''}`
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
  return prefix + (typeof feeTypeLabelFn === 'function' ? feeTypeLabelFn(f.feeTypeId) : '') || '面议'
}

module.exports = {
  buildBudgetDisplay,
  buildCompactBudgetText,
}
