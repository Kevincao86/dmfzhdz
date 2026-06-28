/**
 * 运营图文编辑器：粘贴时将 HTML / 富文本转为帮助手册与公告支持的 Markdown。
 */

function normalizePlainMarkdown(text: string): string {
  let s = String(text ?? '').replace(/\r\n/g, '\n')
  s = s.replace(/^#{1,6}\s+/gm, '## ')
  s = s.replace(/__([^_\n]+)__/g, '**$1**')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trimEnd()
}

function collapseBlankLines(text: string): string {
  return String(text || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

function splitPlainColumns(line: string): string[] | null {
  const t = line.trim()
  if (!t) return null
  if (t.includes('\t')) {
    const cols = t.split('\t').map((c) => c.trim()).filter(Boolean)
    return cols.length >= 2 ? cols : null
  }
  if (/\s{2,}/.test(t)) {
    const cols = t.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean)
    return cols.length >= 2 ? cols : null
  }
  return null
}

function rowsToMarkdownTable(rows: string[][]): string {
  if (!rows.length) return ''
  const colCount = Math.max(...rows.map((r) => r.length))
  const normalized = rows.map((r) => {
    const copy = [...r]
    while (copy.length < colCount) copy.push('')
    return copy.map((c) => c.replace(/\|/g, '\\|'))
  })
  const [header, ...body] = normalized
  const sep = header.map(() => '---')
  return [
    `| ${header.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...body.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n')
}

/** 将 Cursor/Word 粘贴的「空格/Tab 分列」文本还原为 Markdown 表格 */
function reconstructPlainTables(plain: string): string {
  const lines = String(plain || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const cols = splitPlainColumns(lines[i])
    if (cols && cols.length >= 2) {
      const block: string[][] = [cols]
      let j = i + 1
      while (j < lines.length) {
        const nextCols = splitPlainColumns(lines[j])
        if (!nextCols || nextCols.length !== cols.length) break
        block.push(nextCols)
        j++
      }
      if (block.length >= 2) {
        out.push(rowsToMarkdownTable(block))
        out.push('')
        i = j
        continue
      }
    }
    out.push(lines[i])
    i++
  }

  return out.join('\n')
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
    return text ? `> ${text}\n\n` : ''
  }
  if (tag === 'ul' || tag === 'ol') {
    const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li')
    if (!items.length) return inner()
    const ordered = tag === 'ol'
    const lines = items.map((li, idx) => {
      const text = Array.from(li.childNodes).map(inlineNodeToMarkdown).join('').trim()
      if (!text) return ''
      return ordered ? `${idx + 1}. ${text}` : `- ${text}`
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
  return `${rowsToMarkdownTable(rows)}\n\n`
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
    for (const table of Array.from(root.querySelectorAll('table'))) {
      const md = tableToMarkdown(table)
      if (md.trim()) parts.push(md)
    }
  }

  if (!parts.length) {
    const fallback = Array.from(root.childNodes).map(inlineNodeToMarkdown).join('').trim()
    return normalizePlainMarkdown(fallback)
  }

  return normalizePlainMarkdown(collapseBlankLines(parts.join('')))
}

function htmlHasRichStructure(html: string): boolean {
  return /<(table|h[1-6]|ul|ol|blockquote|strong|b|th|td)\b/i.test(html)
}

/** 将剪贴板 HTML / 纯文本转为编辑器 Markdown 正文 */
export function clipboardDataToRichContentMarkdown(html?: string | null, plain?: string | null): string {
  const p = String(plain ?? '')
  const h = String(html ?? '').trim()

  if (h && htmlHasRichStructure(h)) {
    const fromHtml = htmlFragmentToRichContentMarkdown(h)
    if (fromHtml.trim()) return fromHtml
  }

  if (p && /^\|.+\|/m.test(p)) {
    return normalizePlainMarkdown(p)
  }

  if (p.trim()) {
    const withTables = reconstructPlainTables(p)
    return normalizePlainMarkdown(withTables)
  }

  if (h && /<[a-z][\s>]/i.test(h)) {
    const fromHtml = htmlFragmentToRichContentMarkdown(h)
    if (fromHtml.trim()) return fromHtml
  }

  return ''
}
