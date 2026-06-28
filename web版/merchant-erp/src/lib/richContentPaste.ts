/**
 * 运营图文编辑器：粘贴时将 HTML / 富文本转为帮助手册与公告支持的 Markdown。
 * 支持 **粗体**、## 小标题、列表、表格（Markdown 语法保留）、图片链接。
 */

function normalizePlainMarkdown(text: string): string {
  let s = String(text ?? '').replace(/\r\n/g, '\n')
  s = s.replace(/^#{1,6}\s+/gm, '## ')
  s = s.replace(/__([^_\n]+)__/g, '**$1**')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trimEnd()
}

function plainTextLooksLikeMarkdown(plain: string): boolean {
  const t = String(plain || '')
  if (!t.trim()) return false
  return (
    /^#{1,6}\s+/m.test(t) ||
    /\*\*[^*]+\*\*/.test(t) ||
    /^[-*+]\s+/m.test(t) ||
    /^\|.+\|/m.test(t) ||
    /^>\s+/m.test(t) ||
    /!\[[^\]]*\]\(https?:\/\//i.test(t)
  )
}

function collapseBlankLines(text: string): string {
  return String(text || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

function inlineNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ''
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  const inner = () => Array.from(el.childNodes).map(inlineNodeToMarkdown).join('')

  if (tag === 'strong' || tag === 'b') {
    const text = inner().trim()
    return text ? `**${text}**` : ''
  }
  if (tag === 'em' || tag === 'i') return inner()
  if (tag === 'br') return '\n'
  if (tag === 'a') {
    const href = el.getAttribute('href') || ''
    const label = inner().trim() || href
    if (/^https?:\/\//i.test(href) && label !== href) return `[${label}](${href})`
    return label
  }
  if (tag === 'code') return inner()
  if (tag === 'span') {
    const fw = el.style?.fontWeight || ''
    const text = inner()
    if (/^(bold|[6-9]00)$/.test(fw) || Number.parseInt(fw, 10) >= 600) {
      const t = text.trim()
      return t ? `**${t}**` : text
    }
    return text
  }
  return inner()
}

function blockNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.textContent ?? '').trim()
    return t ? `${t}\n\n` : ''
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  const inner = () => Array.from(el.childNodes).map(blockNodeToMarkdown).join('')

  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
    const title = Array.from(el.childNodes).map(inlineNodeToMarkdown).join('').trim()
    return title ? `## ${title}\n\n` : ''
  }
  if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') {
    const text = Array.from(el.childNodes).map(inlineNodeToMarkdown).join('').trim()
    return text ? `${text}\n\n` : ''
  }
  if (tag === 'blockquote') {
    const text = Array.from(el.childNodes).map(inlineNodeToMarkdown).join('').trim()
    return text ? `${text}\n\n` : ''
  }
  if (tag === 'ul' || tag === 'ol') {
    const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li')
    if (!items.length) return inner()
    const ordered = tag === 'ol'
    const lines = items.map((li, i) => {
      const text = Array.from(li.childNodes).map(inlineNodeToMarkdown).join('').trim()
      if (!text) return ''
      return ordered ? `${i + 1}. ${text}` : `- ${text}`
    })
    return `${lines.filter(Boolean).join('\n')}\n\n`
  }
  if (tag === 'li') {
    const text = Array.from(el.childNodes).map(inlineNodeToMarkdown).join('').trim()
    return text ? `- ${text}\n` : ''
  }
  if (tag === 'table') return tableToMarkdown(el)
  if (tag === 'img') {
    const src = el.getAttribute('src') || ''
    if (!/^https?:\/\//i.test(src)) return ''
    const alt = el.getAttribute('alt') || '图片'
    return `![${alt}](${src})\n\n`
  }
  if (tag === 'hr') return '---\n\n'
  if (tag === 'pre') {
    const text = el.textContent?.trim()
    return text ? `${text}\n\n` : ''
  }
  return inner()
}

function tableToMarkdown(table: HTMLElement): string {
  const rows: string[][] = []
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const cells = Array.from(tr.children)
      .filter((c) => /^t[dh]$/i.test(c.tagName))
      .map((c) =>
        Array.from(c.childNodes)
          .map(inlineNodeToMarkdown)
          .join('')
          .replace(/\|/g, '\\|')
          .trim(),
      )
    if (cells.length) rows.push(cells)
  }
  if (!rows.length) return ''

  const colCount = Math.max(...rows.map((r) => r.length))
  const normalized = rows.map((r) => {
    const copy = [...r]
    while (copy.length < colCount) copy.push('')
    return copy
  })
  const header = normalized[0]
  const body = normalized.slice(1)
  const sep = header.map(() => '---')
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...body.map((r) => `| ${r.join(' | ')} |`),
  ]
  return `${lines.join('\n')}\n\n`
}

function htmlFragmentToRichContentMarkdown(html: string): string {
  if (typeof DOMParser === 'undefined') return normalizePlainMarkdown(html.replace(/<[^>]+>/g, ' '))

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.body
  const parts: string[] = []

  for (const node of Array.from(root.childNodes)) {
    const md = blockNodeToMarkdown(node)
    if (md.trim()) parts.push(md)
  }

  if (!parts.length) {
    const fallback = Array.from(root.childNodes).map(inlineNodeToMarkdown).join('').trim()
    return normalizePlainMarkdown(fallback)
  }

  return normalizePlainMarkdown(collapseBlankLines(parts.join('')))
}

/** 将剪贴板 HTML / 纯文本转为编辑器 Markdown 正文 */
export function clipboardDataToRichContentMarkdown(html?: string | null, plain?: string | null): string {
  const p = String(plain ?? '')
  const h = String(html ?? '').trim()

  if (p && plainTextLooksLikeMarkdown(p)) {
    return normalizePlainMarkdown(p)
  }

  if (h && /<[a-z][\s>]/i.test(h)) {
    const fromHtml = htmlFragmentToRichContentMarkdown(h)
    if (fromHtml.trim()) return fromHtml
  }

  if (p.trim()) return normalizePlainMarkdown(p)
  if (h.trim()) return normalizePlainMarkdown(h.replace(/<[^>]+>/g, ' '))
  return ''
}
