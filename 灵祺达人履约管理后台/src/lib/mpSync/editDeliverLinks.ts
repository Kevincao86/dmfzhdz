export function isVideoDeliverUrl(raw: string): boolean {
  return /^https?:\/\/.+/i.test(String(raw || '').trim())
}

/** 从批量粘贴文本中识别 https 链接（去重保序） */
export function parseBatchDeliverUrls(raw: string | string[]): string[] {
  const parts = Array.isArray(raw)
    ? raw
    : String(raw || '')
        .split(/[\n\r,，;；|\t]+/)
        .flatMap((line) => line.split(/\s+/))
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    const t = String(p || '').trim()
    if (!isVideoDeliverUrl(t)) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

export function clampDeliverText(raw: string, maxCount: number): string {
  const max = Math.max(1, Number.parseInt(String(maxCount || 1), 10) || 1)
  const links = parseBatchDeliverUrls(raw)
  if (links.length > max) {
    return links.slice(0, max).join('\n')
  }
  const lines = String(raw || '').split(/\r?\n/)
  let nonEmpty = 0
  const out: string[] = []
  for (const line of lines) {
    const trimmed = String(line || '').trim()
    if (trimmed) {
      if (nonEmpty >= max) break
      nonEmpty++
    }
    out.push(line)
  }
  return out.join('\n')
}
