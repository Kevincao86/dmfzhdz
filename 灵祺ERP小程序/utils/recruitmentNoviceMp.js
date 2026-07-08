/**
 * 与 web版/merchant-erp/src/services/recruitmentNoviceAllocationAi.ts 离线部分对齐（小程序无浏览器 AI 时走 fallback）。
 */
function clampInt(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.floor(n)))
}

function kolTierStrategyLabel(strategy) {
  if (strategy === 'more_v3') return 'V3 多一些（V4 / V5 相对较少）'
  if (strategy === 'more_v4') return 'V4 多一些（V3 / V5 相对较少）'
  return 'V5 及 V5 以上多一些（V3 / V4 相对较少）'
}

function fallbackNoviceKolAllocation(budgetYuan, strategy, /** @type {string|undefined} */ _cityForHint) {
  const b = Number.isFinite(budgetYuan) && budgetYuan > 0 ? budgetYuan : 0
  const totalPeople = clampInt(b / 1200, 3, 36)
  const w =
    strategy === 'more_v3'
      ? [0.42, 0.32, 0.16, 0.1]
      : strategy === 'more_v4'
        ? [0.18, 0.42, 0.22, 0.18]
        : [0.12, 0.18, 0.3, 0.4]
  let v3 = Math.round(totalPeople * w[0])
  let v4 = Math.round(totalPeople * w[1])
  let v5 = Math.round(totalPeople * w[2])
  let v5plus = Math.round(totalPeople * w[3])
  let gap = totalPeople - (v3 + v4 + v5 + v5plus)
  let guard = 0
  while (gap !== 0 && guard++ < 48) {
    if (gap > 0) {
      v5plus += 1
      gap -= 1
    } else if (v3 > 0) {
      v3 -= 1
      gap += 1
    } else if (v4 > 0) {
      v4 -= 1
      gap += 1
    } else if (v5 > 0) {
      v5 -= 1
      gap += 1
    } else if (v5plus > 0) {
      v5plus -= 1
      gap += 1
    } else break
  }
  return {
    v3: Math.max(0, v3),
    v4: Math.max(0, v4),
    v5: Math.max(0, v5),
    v5plus: Math.max(0, v5plus),
    notes: '当前为离线规则估算（与 Web 端 AI 不可用时的兜底一致）。',
    costHint: `按总预算约 ¥${b}、合计约 ${v3 + v4 + v5 + v5plus} 人次档位建议（仅供参考）。`,
    source: 'fallback',
  }
}

function fallbackXiaohongshuNoviceAllocation(budgetYuan) {
  const b = Number.isFinite(budgetYuan) && budgetYuan > 0 ? budgetYuan : 0
  const totalPeople = clampInt(b / 900, 3, 40)
  return {
    v3: 0,
    v4: 0,
    v5: 0,
    v5plus: totalPeople,
    notes: '小红书招募按预算估算人数（与 Web fallback 同源）。',
    costHint: `按总预算约 ¥${b}，建议约 ${totalPeople} 位小红书达人（仅供参考）。`,
    source: 'fallback',
  }
}

function filterKolCommissionInputDigits(raw) {
  return String(raw || '').replace(/\D/g, '').slice(0, 3)
}

function parseKolCommissionPctFromDraft(draft) {
  const d = String(draft || '').replace(/\D/g, '')
  if (!d) return 0
  const n = Number.parseInt(d, 10)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(80, n))
}

module.exports = {
  kolTierStrategyLabel,
  fallbackNoviceKolAllocation,
  fallbackXiaohongshuNoviceAllocation,
  filterKolCommissionInputDigits,
  parseKolCommissionPctFromDraft,
}
