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
