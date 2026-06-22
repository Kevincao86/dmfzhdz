/**
 * 运营图文正文：轻量 Markdown + 安全 HTML（公告 / 帮助手册 / 达人公告共用）
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

function markdownToRichHtml(raw: string): string {
  const text = String(raw ?? '').trim()
  if (!text) return ''

  const blocks = text.split(/\n{2,}/)
  const htmlBlocks: string[] = []

  for (const block of blocks) {
    const line = block.trim()
    if (!line) continue

    if (/^##\s+/.test(line) && !line.includes('\n')) {
      const title = line.replace(/^##\s+/, '').trim()
      htmlBlocks.push(`<h3>${inlineMarkdownRaw(title)}</h3>`)
      continue
    }

    const withBr = line.split('\n').map((l) => inlineMarkdownRaw(l.trim())).join('<br/>')
    htmlBlocks.push(`<p>${withBr}</p>`)
  }

  return htmlBlocks.join('')
}

export function isProbablyRichContent(body: string): boolean {
  const t = String(body || '')
  if (!t.trim()) return false
  if (IMG_MD_DETECT_RE.test(t)) return true
  if (/<img[\s>]/i.test(t)) return true
  if (/^##\s+/m.test(t)) return true
  if (/\*\*[^*]+\*\*/.test(t)) return true
  return false
}

export function richContentToHtml(body: string): string {
  const text = String(body ?? '').trim()
  if (!text) return ''
  if (/<[a-z][\s>]/i.test(text)) {
    if (IMG_MD_DETECT_RE.test(text) || /\*\*[^*]+\*\*/.test(text)) {
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
  t = t.replace(/^##\s+/gm, '')
  t = t.replace(/<[^>]+>/g, '')
  t = t.replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen)}…`
}
