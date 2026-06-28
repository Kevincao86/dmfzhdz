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

function convertInlineMarkdownInHtml(html) {
  let out = String(html || '')
  IMG_MD_RE.lastIndex = 0
  out = out.replace(IMG_MD_RE, (_m, alt, url) => {
    const u = String(url || '').trim()
    if (!/^https?:\/\//i.test(u)) return _m
    return `<img src="${u}" style="max-width:100%;height:auto;display:block;margin:8px 0;" />`
  })
  BOLD_RE.lastIndex = 0
  out = out.replace(BOLD_RE, (_m, inner) => `<strong>${escapeHtml(String(inner || ''))}</strong>`)
  return out
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
  IMG_MD_RE.lastIndex = 0
  s = s.replace(IMG_MD_RE, (_m, alt, url) => {
    const u = String(url || '').trim()
    if (!/^https?:\/\//i.test(u)) return escapeHtml(`![${alt}](${url})`)
    const tag = `<img src="${u}" style="max-width:100%;height:auto;display:block;margin:8px 0;" />`
    tokens.push(tag)
    return `\x00T${tokens.length - 1}\x00`
  })
  BOLD_RE.lastIndex = 0
  s = s.replace(BOLD_RE, (_m, inner) => {
    tokens.push(`<strong>${escapeHtml(String(inner || ''))}</strong>`)
    return `\x00T${tokens.length - 1}\x00`
  })
  s = escapeHtml(s)
  return s.replace(/\x00T(\d+)\x00/g, (_m, i) => tokens[Number(i)] || '')
}

function isTableRow(line) {
  const t = String(line || '').trim()
  return t.startsWith('|') && t.indexOf('|', 1) >= 0
}

function isTableSeparator(line) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(String(line || '').trim())
}

function parseTableCells(line) {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

function renderMarkdownTable(tableLines) {
  const rows = tableLines.filter((l) => !isTableSeparator(l)).map(parseTableCells)
  if (!rows.length) return ''
  const colCount = Math.max(...rows.map((r) => r.length))
  const normalized = rows.map((r) => {
    const copy = r.slice()
    while (copy.length < colCount) copy.push('')
    return copy
  })
  const header = normalized[0]
  const body = normalized.slice(1)
  const ths = header.map((c) => `<th style="border:1px solid #cbd5e1;padding:6px;background:#f1f5f9;">${inlineMarkdownRaw(c)}</th>`).join('')
  const trs = body
    .map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #e2e8f0;padding:6px;vertical-align:top;">${inlineMarkdownRaw(c)}</td>`).join('')}</tr>`)
    .join('')
  return `<table class="rich-table" style="width:100%;border-collapse:collapse;margin:8px 0;"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
}

function markdownToRichHtml(raw) {
  const lines = String(raw || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
  const htmlBlocks = []
  let i = 0

  while (i < lines.length) {
    const trimmed = String(lines[i] || '').trim()
    if (!trimmed) {
      i++
      continue
    }

    if (isTableRow(trimmed)) {
      const tableLines = []
      while (i < lines.length) {
        const t = String(lines[i] || '').trim()
        if (!t) break
        if (!isTableRow(t) && !isTableSeparator(t)) break
        tableLines.push(t)
        i++
      }
      const tableHtml = renderMarkdownTable(tableLines)
      if (tableHtml) htmlBlocks.push(tableHtml)
      continue
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      const title = trimmed.replace(/^#{1,6}\s+/, '')
      htmlBlocks.push(`<div style="font-weight:600;font-size:16px;margin:10px 0 6px;">${inlineMarkdownRaw(title)}</div>`)
      i++
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = []
      while (i < lines.length && /^>\s?/.test(String(lines[i] || '').trim())) {
        quoteLines.push(String(lines[i]).trim().replace(/^>\s?/, ''))
        i++
      }
      htmlBlocks.push(
        `<div style="margin:8px 0;padding:8px 10px;border-left:3px solid #cbd5e1;background:#f8fafc;">${quoteLines.map((l) => inlineMarkdownRaw(l)).join('<br/>')}</div>`,
      )
      continue
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items = []
      while (i < lines.length && /^[-*+]\s+/.test(String(lines[i] || '').trim())) {
        items.push(String(lines[i]).trim().replace(/^[-*+]\s+/, ''))
        i++
      }
      htmlBlocks.push(`<ul style="margin:6px 0;padding-left:18px;">${items.map((it) => `<li>${inlineMarkdownRaw(it)}</li>`).join('')}</ul>`)
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = []
      while (i < lines.length && /^\d+\.\s+/.test(String(lines[i] || '').trim())) {
        items.push(String(lines[i]).trim().replace(/^\d+\.\s+/, ''))
        i++
      }
      htmlBlocks.push(`<ol style="margin:6px 0;padding-left:18px;">${items.map((it) => `<li>${inlineMarkdownRaw(it)}</li>`).join('')}</ol>`)
      continue
    }

    const paraLines = []
    while (i < lines.length) {
      const t = String(lines[i] || '').trim()
      if (!t) break
      if (
        isTableRow(t) ||
        /^#{1,6}\s+/.test(t) ||
        /^>\s?/.test(t) ||
        /^[-*+]\s+/.test(t) ||
        /^\d+\.\s+/.test(t)
      ) {
        break
      }
      paraLines.push(t)
      i++
    }
    if (paraLines.length) {
      htmlBlocks.push(`<div style="margin:4px 0;">${paraLines.map((l) => inlineMarkdownRaw(l)).join('<br/>')}</div>`)
    }
  }

  return htmlBlocks.join('')
}

function isProbablyRichContent(body) {
  const t = String(body || '')
  if (!t.trim()) return false
  if (/!\[[^\]]*\]\(https?:\/\//i.test(t)) return true
  if (/<img[\s>]/i.test(t)) return true
  if (/^#{1,6}\s+/m.test(t)) return true
  if (/\*\*[^*]+\*\*/.test(t)) return true
  if (/^\|.+\|/m.test(t)) return true
  if (/^>\s+/m.test(t)) return true
  if (/^[-*+]\s+/m.test(t)) return true
  return false
}

function richContentToHtml(body) {
  const text = String(body || '').trim()
  if (!text) return ''
  if (/<[a-z][\s>]/i.test(text)) {
    if (/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i.test(text) || /\*\*[^*]+\*\*/.test(text) || /^\|.+\|/m.test(text)) {
      return sanitizeRichHtml(convertInlineMarkdownInHtml(text))
    }
    return sanitizeRichHtml(text)
  }
  if (isProbablyRichContent(text) || text.indexOf('\n') >= 0) return markdownToRichHtml(text)
  return `<div>${escapeHtml(text)}</div>`
}

function richContentPlainPreview(body, maxLen = 120) {
  let t = String(body || '')
  IMG_MD_RE.lastIndex = 0
  t = t.replace(IMG_MD_RE, '$1')
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1')
  t = t.replace(/^#{1,6}\s+/gm, '')
  t = t.replace(/^\|(.+)\|$/gm, '$1')
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
