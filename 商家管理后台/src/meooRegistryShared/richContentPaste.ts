/**
 * 运营图文编辑器：粘贴时将 HTML / 富文本转为帮助手册与公告支持的 Markdown。
 */

import { buildRichSpanStyle } from './richContentCore.js'

export type PendingPasteImage = { alt: string; dataUri: string }

export type RichContentPasteResult = {
  markdown: string
  pendingImages: PendingPasteImage[]
}

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'dialog',
  'dd',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
])

function pendingImgMarker(idx: number): string {
  return `__pasteimg:${idx}__`
}

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

function hasMarkdownTable(text: string): boolean {
  return /^\|.+\|/m.test(String(text || ''))
}

function splitPlainColumns(line: string): string[] | null {
  const t = line.trim()
  if (!t) return null
  if (t.includes('\t')) {
    const cols = t.split('\t').map((c) => c.trim())
    return cols.length >= 2 && cols.some(Boolean) ? cols : null
  }
  if (/\s{2,}/.test(t)) {
    const cols = t.split(/\s{2,}/).map((c) => c.trim())
    return cols.length >= 2 && cols.some(Boolean) ? cols : null
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
    const cols = splitPlainColumns(lines[i]!)
    if (cols && cols.length >= 2) {
      const block: string[][] = [cols]
      let j = i + 1
      while (j < lines.length) {
        const nextCols = splitPlainColumns(lines[j]!)
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
    out.push(lines[i]!)
    i++
  }

  return out.join('\n')
}

function plainLikelyHasTable(plain: string): boolean {
  if (hasMarkdownTable(plain)) return true
  const lines = String(plain || '').replace(/\r\n/g, '\n').split('\n')
  let streak = 0
  for (const line of lines) {
    if (splitPlainColumns(line)) {
      streak += 1
      if (streak >= 2) return true
    } else {
      streak = 0
    }
  }
  return false
}

function isBlockTag(tag: string): boolean {
  return BLOCK_TAGS.has(tag)
}

function shouldSkipTag(tag: string): boolean {
  return tag === 'style' || tag === 'script' || tag === 'meta' || tag === 'link' || tag === 'o:p'
}

function imageToMarkdown(el: HTMLImageElement, pendingImages: PendingPasteImage[]): string {
  const src = (el.getAttribute('src') || '').trim()
  const alt = (el.getAttribute('alt') || '图片').replace(/[\[\]()]/g, '')
  if (/^https?:\/\//i.test(src)) return `![${alt}](${src})\n\n`
  if (/^data:image\//i.test(src)) {
    const idx = pendingImages.length
    pendingImages.push({ alt, dataUri: src })
    return `![${alt}](${pendingImgMarker(idx)})\n\n`
  }
  return ''
}

function inlineNodeToMarkdown(node: Node, pendingImages: PendingPasteImage[]): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\u00a0/g, ' ')
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  if (shouldSkipTag(tag)) return ''

  const inner = () => Array.from(el.childNodes).map((n) => inlineNodeToMarkdown(n, pendingImages)).join('')

  if (tag === 'strong' || tag === 'b') {
    const text = inner().trim()
    return text ? `**${text}**` : ''
  }
  if (tag === 'em' || tag === 'i') return inner()
  if (tag === 'br') return '\n'
  if (tag === 'img') return imageToMarkdown(el as HTMLImageElement, pendingImages).trim()
  if (tag === 'a') {
    const href = el.getAttribute('href') || ''
    const label = inner().trim() || href
    if (/^https?:\/\//i.test(href) && label !== href) return `[${label}](${href})`
    return label
  }
  if (tag === 'code') return inner()
  if (tag === 'span' || tag === 'font') {
    const fw = el.style?.fontWeight || ''
    let text = inner()
    const style = buildRichSpanStyle({
      color: el.style?.color || (tag === 'font' ? String(el.getAttribute('color') || '') : ''),
      backgroundColor: el.style?.backgroundColor || '',
      fontSize: el.style?.fontSize || '',
    })
    if (style) {
      return `<span style="${style}">${text}</span>`
    }
    if (/^(bold|[6-9]00)$/.test(fw) || Number.parseInt(fw, 10) >= 600) {
      const t = text.trim()
      return t ? `**${t}**` : text
    }
    return text
  }
  if (tag === 'p') return `${inner().trim()}\n`
  return inner()
}

function tableToMarkdown(table: HTMLElement, pendingImages: PendingPasteImage[]): string {
  const rows: string[][] = []
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const cells = Array.from(tr.children)
      .filter((c) => /^t[dh]$/i.test(c.tagName))
      .map((c) =>
        Array.from(c.childNodes)
          .map((n) => inlineNodeToMarkdown(n, pendingImages))
          .join('')
          .replace(/\|/g, '\\|')
          .replace(/\n+/g, ' ')
          .trim(),
      )
    if (cells.length) rows.push(cells)
  }
  if (!rows.length) return ''
  return `${rowsToMarkdownTable(rows)}\n\n`
}

function walkNodes(parent: Node, pendingImages: PendingPasteImage[]): string {
  const chunks: string[] = []
  for (const node of Array.from(parent.childNodes)) {
    const chunk = nodeToMarkdown(node, pendingImages)
    if (chunk) chunks.push(chunk)
  }
  return chunks.join('')
}

function nodeToMarkdown(node: Node, pendingImages: PendingPasteImage[]): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.textContent ?? '').replace(/\u00a0/g, ' ').trim()
    return t ? `${t}\n\n` : ''
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  if (shouldSkipTag(tag)) return ''

  if (tag === 'table') return tableToMarkdown(el, pendingImages)
  if (tag === 'img') return imageToMarkdown(el as HTMLImageElement, pendingImages)
  if (tag === 'hr') return '---\n\n'
  if (tag === 'br') return '\n'

  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
    const title = inlineNodeToMarkdown(el, pendingImages).trim()
    return title ? `## ${title}\n\n` : ''
  }
  if (tag === 'blockquote') {
    const text = inlineNodeToMarkdown(el, pendingImages).trim()
    return text ? `> ${text.split('\n').filter(Boolean).join('\n> ')}\n\n` : ''
  }
  if (tag === 'ul' || tag === 'ol') {
    const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li')
    if (!items.length) return walkNodes(el, pendingImages)
    const ordered = tag === 'ol'
    const lines = items
      .map((li, idx) => {
        const text = inlineNodeToMarkdown(li, pendingImages).trim()
        if (!text) return ''
        return ordered ? `${idx + 1}. ${text}` : `- ${text}`
      })
      .filter(Boolean)
    return lines.length ? `${lines.join('\n')}\n\n` : ''
  }
  if (tag === 'pre') {
    const text = el.textContent?.trim()
    return text ? `${text}\n\n` : ''
  }
  if (tag === 'p') {
    const text = inlineNodeToMarkdown(el, pendingImages).trim()
    return text ? `${text}\n\n` : ''
  }

  const hasBlockChild = Array.from(el.children).some((c) => isBlockTag(c.tagName.toLowerCase()))
  if (hasBlockChild || tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' || tag === 'body') {
    return walkNodes(el, pendingImages)
  }

  const text = inlineNodeToMarkdown(el, pendingImages).trim()
  return text ? `${text}\n\n` : ''
}

function htmlFragmentToRichContentMarkdown(html: string, pendingImages: PendingPasteImage[]): string {
  if (typeof DOMParser === 'undefined') {
    return normalizePlainMarkdown(html.replace(/<[^>]+>/g, ' '))
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.body
  const walked = walkNodes(root, pendingImages).trim()

  if (walked) {
    return normalizePlainMarkdown(collapseBlankLines(walked))
  }

  const tableParts: string[] = []
  for (const table of Array.from(root.querySelectorAll('table'))) {
    const md = tableToMarkdown(table, pendingImages)
    if (md.trim()) tableParts.push(md.trim())
  }
  if (tableParts.length) {
    return normalizePlainMarkdown(collapseBlankLines(tableParts.join('\n\n')))
  }

  const fallback = inlineNodeToMarkdown(root, pendingImages).trim()
  return normalizePlainMarkdown(fallback)
}

function htmlHasRichStructure(html: string): boolean {
  return /<(table|thead|tbody|tr|t[dh]|h[1-6]|ul|ol|blockquote|strong|b|img|p)\b/i.test(html)
}

function buildPasteResult(markdown: string, pendingImages: PendingPasteImage[]): RichContentPasteResult {
  return { markdown, pendingImages }
}

/** 将剪贴板 HTML / 纯文本转为编辑器 Markdown 正文 */
export function clipboardDataToRichContentMarkdown(
  html?: string | null,
  plain?: string | null,
): RichContentPasteResult {
  const pendingImages: PendingPasteImage[] = []
  const p = String(plain ?? '')
  const h = String(html ?? '').trim()

  if (h && htmlHasRichStructure(h)) {
    const fromHtml = htmlFragmentToRichContentMarkdown(h, pendingImages)
    if (fromHtml.trim()) {
      if (!hasMarkdownTable(fromHtml) && p && plainLikelyHasTable(p)) {
        const fromPlain = normalizePlainMarkdown(reconstructPlainTables(p))
        if (hasMarkdownTable(fromPlain)) {
          return buildPasteResult(fromPlain, pendingImages)
        }
      }
      return buildPasteResult(fromHtml, pendingImages)
    }
  }

  if (p && hasMarkdownTable(p)) {
    return buildPasteResult(normalizePlainMarkdown(p), pendingImages)
  }

  if (p.trim()) {
    const withTables = reconstructPlainTables(p)
    return buildPasteResult(normalizePlainMarkdown(withTables), pendingImages)
  }

  if (h && /<[a-z][\s>]/i.test(h)) {
    const fromHtml = htmlFragmentToRichContentMarkdown(h, pendingImages)
    if (fromHtml.trim()) return buildPasteResult(fromHtml, pendingImages)
  }

  return buildPasteResult('', pendingImages)
}

function dataUriToFile(dataUri: string, fileName: string): File | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(dataUri || '').trim())
  if (!m) return null
  try {
    const mime = m[1]!
    const binary = atob(m[2]!)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    return new File([bytes], fileName || `paste.${ext}`, { type: mime })
  } catch {
    return null
  }
}

/** 上传粘贴中的 data-uri 图片并替换占位符 */
export async function resolvePendingPasteImages(
  markdown: string,
  pendingImages: PendingPasteImage[],
  upload: (file: File) => Promise<{ ok: true; imageUrl: string } | { ok: false; error?: string }>,
): Promise<string> {
  let out = String(markdown || '')
  for (let i = 0; i < pendingImages.length; i++) {
    const item = pendingImages[i]!
    const marker = pendingImgMarker(i)
    const file = dataUriToFile(item.dataUri, `paste-${Date.now()}-${i}.png`)
    if (!file) {
      out = out.replace(`![${item.alt}](${marker})`, '')
      continue
    }
    const r = await upload(file)
    if (r.ok && /^https?:\/\//i.test(r.imageUrl)) {
      out = out.split(marker).join(r.imageUrl)
    } else {
      out = out.replace(`![${item.alt}](${marker})`, '')
    }
  }
  return out
}
