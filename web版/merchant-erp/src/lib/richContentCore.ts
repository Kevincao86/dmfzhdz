/**
 * 运营图文正文：轻量 Markdown + 安全 HTML（公告 / 帮助手册 / 达人公告共用）
 *
 * 支持：## 标题、**粗体**、列表、表格、引用、![图](url)、已消毒 HTML
 */

const IMG_MD_RE = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi
const IMG_MD_DETECT_RE = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i
const BOLD_RE = /\*\*([^*]+)\*\*/g

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function convertInlineMarkdownInHtml(html: string): string {
  let out = String(html || '')
  IMG_MD_RE.lastIndex = 0
  out = out.replace(IMG_MD_RE, (_m, alt: string, url: string) => {
    const u = String(url || '').trim()
    if (!/^https?:\/\//i.test(u)) return _m
    return `<img src="${u}" alt="${escapeHtml(String(alt || '图片'))}" style="max-width:100%;height:auto;display:block;margin:8px 0;" />`
  })
  BOLD_RE.lastIndex = 0
  out = out.replace(BOLD_RE, (_m, inner: string) => `<strong>${escapeHtml(String(inner || ''))}</strong>`)
  return out
}

function sanitizeRichHtml(html: string): string {
  let out = String(html || '')
  out = out.replace(/<script[\s>][\s\S]*?<\/script>/gi, '')
  out = out.replace(/<style[\s>][\s\S]*?<\/style>/gi, '')
  out = out.replace(/on\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
  out = out.replace(/javascript:/gi, '')
  out = out.replace(/<img([^>]*?)src\s*=\s*"(?!https?:\/\/)[^"]*"/gi, '<img$1')
  out = out.replace(/<img([^>]*?)src\s*=\s*'(?!https?:\/\/)[^']*'/gi, '<img$1')
  return out.trim()
}

function inlineMarkdownRaw(line: string): string {
  const tokens: string[] = []
  let s = String(line || '')
  IMG_MD_RE.lastIndex = 0
  s = s.replace(IMG_MD_RE, (_m, alt: string, url: string) => {
    const u = String(url || '').trim()
    if (!/^https?:\/\//i.test(u)) {
      return escapeHtml(`![${alt}](${url})`)
    }
    const tag = `<img src="${u}" alt="${escapeHtml(String(alt || '图片'))}" style="max-width:100%;height:auto;display:block;margin:8px 0;" />`
    tokens.push(tag)
    return `\x00T${tokens.length - 1}\x00`
  })
  BOLD_RE.lastIndex = 0
  s = s.replace(BOLD_RE, (_m, inner: string) => {
    tokens.push(`<strong>${escapeHtml(String(inner || ''))}</strong>`)
    return `\x00T${tokens.length - 1}\x00`
  })
  s = escapeHtml(s)
  return s.replace(/\x00T(\d+)\x00/g, (_m, i: string) => tokens[Number(i)] ?? '')
}

function isTableRow(line: string): boolean {
  const t = line.trim()
  return t.startsWith('|') && t.includes('|', 1)
}

function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line.trim())
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

function renderMarkdownTable(tableLines: string[]): string {
  const rows = tableLines.filter((l) => !isTableSeparator(l)).map(parseTableCells)
  if (!rows.length) return ''
  const colCount = Math.max(...rows.map((r) => r.length))
  const normalized = rows.map((r) => {
    const copy = [...r]
    while (copy.length < colCount) copy.push('')
    return copy
  })
  const [header, ...body] = normalized
  const ths = header.map((c) => `<th>${inlineMarkdownRaw(c)}</th>`).join('')
  const trs = body
    .map((r) => `<tr>${r.map((c) => `<td>${inlineMarkdownRaw(c)}</td>`).join('')}</tr>`)
    .join('')
  return `<table class="rich-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
}

function markdownToRichHtml(raw: string): string {
  const lines = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
  const htmlBlocks: string[] = []
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (!trimmed) {
      i++
      continue
    }

    if (isTableRow(trimmed)) {
      const tableLines: string[] = []
      while (i < lines.length) {
        const t = lines[i].trim()
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
      htmlBlocks.push(`<h3>${inlineMarkdownRaw(title)}</h3>`)
      i++
      continue
    }

    if (/^---+$/.test(trimmed)) {
      htmlBlocks.push('<hr/>')
      i++
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      htmlBlocks.push(
        `<blockquote><p>${quoteLines.map((l) => inlineMarkdownRaw(l)).join('<br/>')}</p></blockquote>`,
      )
      continue
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''))
        i++
      }
      htmlBlocks.push(`<ul>${items.map((it) => `<li>${inlineMarkdownRaw(it)}</li>`).join('')}</ul>`)
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
        i++
      }
      htmlBlocks.push(`<ol>${items.map((it) => `<li>${inlineMarkdownRaw(it)}</li>`).join('')}</ol>`)
      continue
    }

    const paraLines: string[] = []
    while (i < lines.length) {
      const t = lines[i].trim()
      if (!t) break
      if (
        isTableRow(t) ||
        /^#{1,6}\s+/.test(t) ||
        /^>\s?/.test(t) ||
        /^[-*+]\s+/.test(t) ||
        /^\d+\.\s+/.test(t) ||
        /^---+$/.test(t)
      ) {
        break
      }
      paraLines.push(t)
      i++
    }
    if (paraLines.length) {
      htmlBlocks.push(`<p>${paraLines.map((l) => inlineMarkdownRaw(l)).join('<br/>')}</p>`)
    }
  }

  return htmlBlocks.join('')
}

export function isProbablyRichContent(body: string): boolean {
  const t = String(body || '')
  if (!t.trim()) return false
  if (IMG_MD_DETECT_RE.test(t)) return true
  if (/<img[\s>]/i.test(t)) return true
  if (/^#{1,6}\s+/m.test(t)) return true
  if (/\*\*[^*]+\*\*/.test(t)) return true
  if (/^\|.+\|/m.test(t)) return true
  if (/^>\s+/m.test(t)) return true
  if (/^[-*+]\s+/m.test(t)) return true
  return false
}

export function richContentToHtml(body: string): string {
  const text = String(body ?? '').trim()
  if (!text) return ''
  if (/<[a-z][\s>]/i.test(text)) {
    if (IMG_MD_DETECT_RE.test(text) || /\*\*[^*]+\*\*/.test(text) || /^\|.+\|/m.test(text)) {
      return sanitizeRichHtml(convertInlineMarkdownInHtml(text))
    }
    return sanitizeRichHtml(text)
  }
  if (isProbablyRichContent(text) || text.includes('\n')) {
    return markdownToRichHtml(text)
  }
  return `<p>${escapeHtml(text)}</p>`
}

export function richContentPlainPreview(body: string, maxLen = 120): string {
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
