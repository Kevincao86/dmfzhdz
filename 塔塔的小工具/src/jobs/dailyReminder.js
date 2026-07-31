import { config, schema } from '../config.js'
import { loadSheetRows } from '../wecom/smartsheet.js'
import { sendMarkdown } from '../wecom/webhook.js'
import { col, isChecked, todayLabel } from '../util.js'

/**
 * 功能1：扫新签跟进表，汇总未勾事项，提醒商务与运营。
 */
export async function runDailyReminder() {
  const { source, rows } = await loadSheetRows('followup')
  const cols = schema.followup.columns
  const checklistKeys = schema.followup.checklistKeys

  const pending = []
  for (const row of rows) {
    const customer = String(col(row, cols.customer) || '').trim()
    if (!customer) continue
    const missing = []
    for (const key of checklistKeys) {
      const title = cols[key]
      if (!isChecked(col(row, title))) missing.push(title)
    }
    if (!missing.length) continue
    pending.push({
      customer,
      signedAt: col(row, cols.signedAt),
      bizOwner: String(col(row, cols.bizOwner) || '未填').trim() || '未填',
      opsOwner: String(col(row, cols.opsOwner) || '未填').trim() || '未填',
      missing,
      note: col(row, cols.note),
    })
  }

  const day = todayLabel(config.tz)
  if (!pending.length) {
    const emptyMsg =
      `### 新签客户跟进提醒（${day}）\n` +
      `> 数据源：${source}\n\n` +
      `今日无未完成事项，继续保持。`
    const send = await sendMarkdown(emptyMsg, { title: '跟进提醒' })
    return { ok: true, pending: 0, source, send }
  }

  const byBiz = new Map()
  const byOps = new Map()
  for (const item of pending) {
    if (!byBiz.has(item.bizOwner)) byBiz.set(item.bizOwner, [])
    byBiz.get(item.bizOwner).push(item)
    if (!byOps.has(item.opsOwner)) byOps.set(item.opsOwner, [])
    byOps.get(item.opsOwner).push(item)
  }

  const lines = [
    `### 新签客户跟进提醒（${day}）`,
    `> 数据源：${source} · 待办客户 **${pending.length}** 个`,
    '',
    '**按客户**',
  ]
  for (const item of pending) {
    lines.push(
      `- **${item.customer}**（商务 ${item.bizOwner} / 运营 ${item.opsOwner}）未完成：${item.missing.join('、')}`,
    )
  }
  lines.push('', '**请商务关注**')
  for (const [owner, items] of byBiz) {
    lines.push(`- ${owner}：${items.map((i) => i.customer).join('、')}`)
  }
  lines.push('', '**请运营推进**')
  for (const [owner, items] of byOps) {
    lines.push(`- ${owner}：${items.map((i) => `${i.customer}（${i.missing.join('、')}）`).join('；')}`)
  }

  const content = lines.join('\n')
  const send = await sendMarkdown(content, { title: '跟进提醒' })
  return { ok: true, pending: pending.length, source, send }
}
