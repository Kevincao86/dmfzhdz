import { config, schema } from '../config.js'
import { loadSheetRows } from '../wecom/smartsheet.js'
import { sendMarkdown } from '../wecom/webhook.js'
import { col, todayLabel, toNumber } from '../util.js'

/**
 * 功能2：TOP10 + 新运营客户 周/月报
 * @param {'week'|'month'} periodKind
 */
export async function runCustomerRank(periodKind) {
  const { source, rows } = await loadSheetRows('rank')
  const cols = schema.rank.columns
  const periodLabel =
    periodKind === 'month' ? schema.rank.periodMonth : schema.rank.periodWeek
  const periodTitle = periodKind === 'month' ? '月报' : '周报'
  const topN = Number(schema.rank.topN) || 10

  const filtered = rows.filter((row) => {
    const p = String(col(row, cols.period) || '').trim()
    return p === periodLabel || p.includes(periodLabel)
  })

  const topRows = filtered
    .filter((row) => String(col(row, cols.type) || '').trim() === schema.rank.typeTop)
    .map((row) => ({
      customer: String(col(row, cols.customer) || '').trim(),
      metricName: col(row, cols.metricName) || '指标',
      metricValue: toNumber(col(row, cols.metricValue)),
      owner: col(row, cols.owner) || '-',
      periodRange: col(row, cols.periodRange) || '-',
    }))
    .filter((r) => r.customer)
    .sort((a, b) => b.metricValue - a.metricValue)
    .slice(0, topN)

  const newOps = filtered
    .filter((row) => String(col(row, cols.type) || '').trim() === schema.rank.typeNewOps)
    .map((row) => ({
      customer: String(col(row, cols.customer) || '').trim(),
      metricName: col(row, cols.metricName) || '指标',
      metricValue: toNumber(col(row, cols.metricValue)),
      owner: col(row, cols.owner) || '-',
      periodRange: col(row, cols.periodRange) || '-',
    }))
    .filter((r) => r.customer)
    .sort((a, b) => b.metricValue - a.metricValue)

  const day = todayLabel(config.tz)
  const lines = [
    `### 客户业绩${periodTitle}（${day}）`,
    `> 数据源：${source} · 周期：**${periodLabel}**`,
    '',
    `**TOP${topN}**`,
  ]

  if (!topRows.length) {
    lines.push('- （暂无 TOP 数据）')
  } else {
    topRows.forEach((r, i) => {
      lines.push(
        `${i + 1}. **${r.customer}** · ${r.metricName}=${r.metricValue} · 负责人 ${r.owner} · ${r.periodRange}`,
      )
    })
  }

  lines.push('', '**新运营客户**')
  if (!newOps.length) {
    lines.push('- （暂无新运营客户数据）')
  } else {
    for (const r of newOps) {
      lines.push(
        `- **${r.customer}** · ${r.metricName}=${r.metricValue} · 负责人 ${r.owner} · ${r.periodRange}`,
      )
    }
  }

  const content = lines.join('\n')
  const send = await sendMarkdown(content, { title: `客户${periodTitle}` })
  return {
    ok: true,
    source,
    period: periodLabel,
    topCount: topRows.length,
    newOpsCount: newOps.length,
    send,
  }
}
