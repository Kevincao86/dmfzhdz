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

module.exports = { isVideoDeliverUrl, parseBatchDeliverUrls }
