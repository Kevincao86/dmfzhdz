/**
 * 与星选 mpPointsEconomics 对齐的增值积分扣费说明（仅展示，不替代服务端扣费）。
 */
const RATES = {
  shortvideo: { perSec: 80, label: '短视频 AI 处理', unit: '积分/秒' },
  cloud_edit: { flat: 80, maxSec: 60, label: 'AI 混剪', unit: '积分/条' },
  cloud_edit_smart: { perSec: 5, label: '智能混剪', unit: '积分/秒' },
  digital_human: { perSec: 28, label: '数字人口播', unit: '积分/秒' },
}

function rateLine(kind) {
  const r = RATES[kind]
  if (!r) return '按积分扣费'
  if (r.flat != null) return `${r.flat} ${r.unit}（≤${r.maxSec} 秒）`
  return `${r.perSec} ${r.unit}`
}

function bannerText(kind, durationSec) {
  const r = RATES[kind]
  if (!r) return '本功能按积分扣费；优先消耗套餐次数，超出后扣积分。'
  if (kind === 'cloud_edit') {
    return `消耗提醒：${r.label} ${rateLine(kind)}；优先消耗套餐次数，超出后扣积分。`
  }
  const sec = Math.max(1, Math.ceil(Number(durationSec) || 0))
  if (sec > 0 && r.perSec) {
    const est = sec * r.perSec
    return `消耗提醒：${r.label} ${rateLine(kind)}；当前约 ${sec} 秒预计 ${est} 积分（优先套餐次数）。`
  }
  return `消耗提醒：${r.label} ${rateLine(kind)}；优先消耗套餐次数，超出后扣积分。`
}

module.exports = {
  RATES,
  rateLine,
  bannerText,
}
