function isVideoDeliverUrl(raw) {
  return /^https?:\/\/.+/i.test(String(raw || '').trim())
}

/** 从批量粘贴文本中识别 https 链接（去重保序） */
function parseBatchDeliverUrls(raw) {
  const parts = Array.isArray(raw)
    ? raw
    : String(raw || '')
        .split(/[\n\r,，;；|\t]+/)
        .flatMap((line) => line.split(/\s+/))
  const out = []
  const seen = new Set()
  for (const p of parts) {
    const t = String(p || '').trim()
    if (!isVideoDeliverUrl(t)) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/** 限制输入不超过 maxCount 条（按 https 链接或非空行计） */
function clampDeliverText(raw, maxCount) {
  const max = Math.max(1, Number.parseInt(String(maxCount || 1), 10) || 1)
  const links = parseBatchDeliverUrls(raw)
  if (links.length > max) {
    return links.slice(0, max).join('\n')
  }
  const lines = String(raw || '').split(/\r?\n/)
  let nonEmpty = 0
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = String(line || '').trim()
    if (trimmed) {
      if (nonEmpty >= max) break
      nonEmpty++
    }
    out.push(line)
  }
  return out.join('\n')
}

module.exports = { isVideoDeliverUrl, parseBatchDeliverUrls, clampDeliverText }
