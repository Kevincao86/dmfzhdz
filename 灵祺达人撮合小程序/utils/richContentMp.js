/**
 * 小程序图文正文（与 web richContentCore 规则一致）
 */

const IMG_MD_RE = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi
const BOLD_RE = /\*\*([^*]+)\*\*/g

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeRichHtml(html) {
  let out = String(html || '')
  out = out.replace(/<script[\s>][\s\S]*?<\/script>/gi, '')
  out = out.replace(/<style[\s>][\s\S]*?<\/style>/gi, '')
  out = out.replace(/on\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
  out = out.replace(/javascript:/gi, '')
  return out.trim()
}

function inlineMarkdownRaw(line) {
  const tokens = []
  let s = String(line || '')
  s = s.replace(IMG_MD_RE, (_m, alt, url) => {
    const u = String(url || '').trim()
    if (!/^https?:\/\//i.test(u)) return escapeHtml(`![${alt}](${url})`)
    const tag = `<img src="${u}" style="max-width:100%;height:auto;display:block;margin:8px 0;" />`
    tokens.push(tag)
    return `\x00T${tokens.length - 1}\x00`
  })
  s = s.replace(BOLD_RE, (_m, inner) => {
    tokens.push(`<strong>${escapeHtml(String(inner || ''))}</strong>`)
    return `\x00T${tokens.length - 1}\x00`
  })
  s = escapeHtml(s)
  return s.replace(/\x00T(\d+)\x00/g, (_m, i) => tokens[Number(i)] || '')
}

function markdownToRichHtml(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const blocks = text.split(/\n{2,}/)
  const htmlBlocks = []
  for (const block of blocks) {
    const line = block.trim()
    if (!line) continue
    if (/^##\s+/.test(line) && line.indexOf('\n') < 0) {
      const title = line.replace(/^##\s+/, '').trim()
      htmlBlocks.push(`<div style="font-weight:600;font-size:16px;margin:8px 0;">${inlineMarkdownRaw(title)}</div>`)
      continue
    }
    const withBr = line.split('\n').map((l) => inlineMarkdownRaw(l.trim())).join('<br/>')
    htmlBlocks.push(`<div style="margin:4px 0;">${withBr}</div>`)
  }
  return htmlBlocks.join('')
}

function isProbablyRichContent(body) {
  const t = String(body || '')
  if (!t.trim()) return false
  if (/!\[[^\]]*\]\(https?:\/\//i.test(t)) return true
  if (/<img[\s>]/i.test(t)) return true
  if (/^##\s+/m.test(t)) return true
  if (/\*\*[^*]+\*\*/.test(t)) return true
  return false
}

function richContentToHtml(body) {
  const text = String(body || '').trim()
  if (!text) return ''
  if (/<[a-z][\s>]/i.test(text)) return sanitizeRichHtml(text)
  if (isProbablyRichContent(text) || text.indexOf('\n') >= 0) return markdownToRichHtml(text)
  return `<div>${escapeHtml(text)}</div>`
}

function richContentPlainPreview(body, maxLen = 120) {
  let t = String(body || '')
  t = t.replace(IMG_MD_RE, '$1')
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1')
  t = t.replace(/^##\s+/gm, '')
  t = t.replace(/<[^>]+>/g, '')
  t = t.replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen)}…`
}

module.exports = {
  richContentToHtml,
  isProbablyRichContent,
  richContentPlainPreview,
}
