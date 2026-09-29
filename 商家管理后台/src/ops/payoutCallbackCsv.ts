function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let quoted = false
  for (const ch of line) {
    if (ch === '"') {
      quoted = !quoted
      continue
    }
    if (ch === ',' && !quoted) {
      cells.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  cells.push(cur.trim())
  return cells.map((cell) => cell.replace(/^="?/, '').replace(/"$/, '').trim())
}

/** 从打款回传表读取提现编号。识别表头「提现编号 / 提现单号 / 单号」，没有表头时收集 po- / wd_ 编号。 */
export function parsePayoutCallbackIds(text: string): string[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return []
  const header = splitCsvLine(lines[0])
  const idx = header.findIndex((cell) => /提现编号|提现单号|^单号$/.test(cell))
  const body = idx >= 0 ? lines.slice(1) : lines
  const ids: string[] = []
  for (const line of body) {
    const cells = splitCsvLine(line)
    const raw = idx >= 0 ? cells[idx] || '' : cells.find((cell) => /^(po-|wd_)/.test(cell)) || ''
    const id = raw.trim()
    if (!id || /提现编号|提现单号|^单号$/.test(id)) continue
    ids.push(id)
  }
  return [...new Set(ids)]
}

export function payoutCallbackSummary(result: {
  updated: number | string[]
  alreadyPaid: string[]
  missing: string[]
  skipped?: string[]
}): string {
  const updated = Array.isArray(result.updated) ? result.updated.length : result.updated
  const parts = [`打款成功 ${updated} 笔`]
  if (result.alreadyPaid.length) parts.push(`已是打款成功 ${result.alreadyPaid.length} 笔`)
  if (result.missing.length) parts.push(`未找到编号 ${result.missing.join('、')}`)
  if (result.skipped?.length) parts.push(`状态不允许回传 ${result.skipped.join('、')}`)
  return parts.join('，')
}
