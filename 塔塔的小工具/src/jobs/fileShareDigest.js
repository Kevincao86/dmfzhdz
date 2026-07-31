import { config, schema } from '../config.js'
import { loadSheetRows } from '../wecom/smartsheet.js'
import { sendMarkdown } from '../wecom/webhook.js'
import { col, daysAgo, parseDateLoose, todayLabel } from '../util.js'

/**
 * 功能3：共享文件表摘要（近 N 天新增 + 全量清单精简）
 */
export async function runFileShareDigest() {
  const { source, rows } = await loadSheetRows('files')
  const cols = schema.files.columns
  const recentDays = Number(schema.files.recentDays) || 7
  const since = daysAgo(recentDays)

  const items = rows
    .map((row) => ({
      fileName: String(col(row, cols.fileName) || '').trim(),
      category: col(row, cols.category) || '-',
      link: String(col(row, cols.link) || '').trim(),
      uploader: col(row, cols.uploader) || '-',
      updatedAt: col(row, cols.updatedAt),
      note: col(row, cols.note) || '',
    }))
    .filter((i) => i.fileName)

  const recent = items.filter((i) => {
    const d = parseDateLoose(i.updatedAt)
    if (!d) return false
    return d.getTime() >= since.getTime()
  })

  const day = todayLabel(config.tz)
  const lines = [
    `### 共享文件表（${day}）`,
    `> 数据源：${source} · 近 ${recentDays} 天新增 **${recent.length}** / 登记总计 **${items.length}**`,
    '',
    `**近 ${recentDays} 天新增**`,
  ]

  if (!recent.length) {
    lines.push('- （无）')
  } else {
    for (const i of recent) {
      const linkPart = i.link ? `[打开](${i.link})` : '（无链接）'
      lines.push(`- **${i.fileName}** · ${i.category} · ${i.uploader} · ${i.updatedAt} · ${linkPart}`)
    }
  }

  lines.push('', '**全部登记（最多 20 条）**')
  const preview = items.slice(0, 20)
  if (!preview.length) {
    lines.push('- （表为空，请在企微共享文件表登记链接）')
  } else {
    for (const i of preview) {
      const linkPart = i.link ? `[打开](${i.link})` : '（无链接）'
      lines.push(`- ${i.fileName} · ${i.category} · ${linkPart}`)
    }
    if (items.length > 20) lines.push(`- …其余 ${items.length - 20} 条见企微「共享文件表」`)
  }

  const content = lines.join('\n')
  const send = await sendMarkdown(content, { title: '共享文件摘要' })
  return { ok: true, source, total: items.length, recent: recent.length, send }
}
