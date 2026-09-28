import { useEffect, useRef, useState } from 'react'

const ARTICLE_TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'img', 'span', 'div', 'font', 'hr'])
const FONT_PX: Record<string, string> = { '1': '12px', '2': '14px', '3': '16px', '4': '18px', '5': '24px', '6': '32px', '7': '40px' }
const COLORS = ['#353535', '#576b95', '#07c160', '#fa9d3b', '#e64340']

export const articleBodyClass = 'text-[17px] leading-[1.75] text-[#353535] [&_img]:my-3 [&_img]:block [&_img]:w-full [&_blockquote]:my-3 [&_blockquote]:border-l-[3px] [&_blockquote]:border-[#e5e5e5] [&_blockquote]:pl-3 [&_blockquote]:text-[#888] [&_h2]:my-4 [&_h2]:text-[20px] [&_h2]:font-bold [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-[0.6em] [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_hr]:my-4 [&_hr]:border-[#ededed]'

function articleStyle(style: string) {
  const parts: string[] = []
  for (const chunk of String(style || '').split(';')) {
    const idx = chunk.indexOf(':')
    if (idx < 0) continue
    const key = chunk.slice(0, idx).trim().toLowerCase()
    const val = chunk.slice(idx + 1).trim()
    if (!key || !val || /url\(|expression|javascript/i.test(val)) continue
    if ((key === 'color' || key === 'background-color') && (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(val) || /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(val))) {
      parts.push(`${key}:${val}`)
    } else if (key === 'font-size') {
      const n = Number(/^(\d{1,2})px$/.exec(val)?.[1])
      if (n >= 12 && n <= 48) parts.push(`font-size:${n}px`)
    } else if (key === 'text-align' && /^(left|center|right|justify)$/i.test(val)) {
      parts.push(`text-align:${val.toLowerCase()}`)
    } else if (key === 'font-weight' && /^(normal|bold|[1-9]00)$/i.test(val)) {
      parts.push(`font-weight:${val.toLowerCase()}`)
    }
  }
  return parts.join(';')
}

function articleImageSrc(src: string) {
  const s = String(src || '').trim()
  if (/^https:\/\/[^\s"'<>]+$/i.test(s) && s.length < 500) return s
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i.test(s) && s.length <= 280000) return s
  return ''
}

export function sanitizeArticleHtml(raw: string) {
  let html = String(raw || '')
  if (html.length > 2_000_000) html = html.slice(0, 2_000_000)
  html = html.replace(/<!--[\s\S]*?-->/g, '')
  html = html.replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1>/gi, '')
  let images = 0
  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, tag: string, attrs: string) => {
    const name = tag.toLowerCase()
    if (!ARTICLE_TAGS.has(name)) return ''
    if (full.startsWith('</')) return name === 'br' || name === 'img' || name === 'hr' ? '' : `</${name}>`
    if (name === 'br') return '<br>'
    if (name === 'hr') return '<hr>'
    if (name === 'img') {
      images += 1
      if (images > 8) return ''
      const src = articleImageSrc(/src\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] || '')
      return src ? `<img src="${src}" alt="">` : ''
    }
    let style = articleStyle(/style\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] || '')
    const align = /align\s*=\s*["']?(left|center|right|justify)["']?/i.exec(attrs)?.[1]
    if (align) style = [style, `text-align:${align.toLowerCase()}`].filter(Boolean).join(';')
    if (name === 'font') {
      const size = FONT_PX[/size\s*=\s*["']?([1-7])["']?/i.exec(attrs)?.[1] || '']
      const color = /color\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] || ''
      const extra = [size ? `font-size:${size}` : '', articleStyle(`color:${color}`)].filter(Boolean)
      style = [style, ...extra].filter(Boolean).join(';')
    }
    return style ? `<${name} style="${style}">` : `<${name}>`
  })
  return html.length > 1_400_000 ? '' : html
}

export function plainTextFromArticle(html: string) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 800)
}

export function noteToArticleHtml(note: string) {
  const text = String(note || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()
  return text ? `<p>${text}</p>` : ''
}

function compressArticleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const max = 1080
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('无法处理图片'))
        return
      }
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      let quality = 0.72
      let data = canvas.toDataURL('image/jpeg', quality)
      while (data.length > 240000 && quality > 0.4) {
        quality -= 0.12
        data = canvas.toDataURL('image/jpeg', quality)
      }
      if (data.length > 280000) {
        reject(new Error('这张图太大，请换一张小一点的'))
        return
      }
      resolve(data)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取图片'))
    }
    img.src = url
  })
}

function ToolButton({ label, onClick, title }: { label: string; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title || label}
      className="rounded px-2 py-1 text-[13px] text-[#353535] hover:bg-white"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export function TrainingPageArticleEditor({
  openKey,
  title,
  onTitle,
  cover,
  onCoverFile,
  initialHtml,
  onHtml,
  onError,
}: {
  openKey: string
  title: string
  onTitle: (value: string) => void
  cover: string
  onCoverFile: (file: File) => void
  initialHtml: string
  onHtml: (html: string) => void
  onError: (message: string) => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!openKey || !editorRef.current) return
    editorRef.current.innerHTML = initialHtml || ''
    // 只在打开编辑窗时灌入正文，避免每次输入把光标打回开头。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey])

  function emit() {
    const html = editorRef.current?.innerHTML || ''
    onHtml(html === '<br>' ? '' : html)
  }

  function command(name: string, value?: string) {
    editorRef.current?.focus()
    document.execCommand(name, false, value)
    emit()
  }

  function rememberRange() {
    const sel = window.getSelection()
    const editor = editorRef.current
    if (!sel || !sel.rangeCount || !editor) return
    const range = sel.getRangeAt(0)
    if (editor.contains(range.commonAncestorContainer)) savedRange.current = range.cloneRange()
  }

  function insertHtml(html: string) {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    if (savedRange.current && sel) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
    document.execCommand('insertHTML', false, html)
    emit()
  }

  async function insertImageFile(file: File) {
    const count = (editorRef.current?.innerHTML.match(/<img\b/gi) || []).length
    if (count >= 8) {
      onError('一篇详情最多 8 张图')
      return
    }
    setBusy(true)
    try {
      const src = await compressArticleImage(file)
      insertHtml(`<p><img src="${src}" alt=""></p>`)
    } catch (ex) {
      onError(ex instanceof Error ? ex.message : '图片插入失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <style>{`.wx-editor:empty:before{content:attr(data-placeholder);color:#b2b2b2}html[data-theme='dark'] .app-main .wx-paper input.wx-title:not([type='checkbox']){background-color:#fff !important;color:#353535 !important;-webkit-text-fill-color:#353535 !important;border-color:transparent !important}`}</style>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border border-[#e7e7e7] bg-[#f6f7f8] px-2 py-1.5">
        <ToolButton label="加粗" onClick={() => command('bold')} />
        <ToolButton label="斜体" onClick={() => command('italic')} />
        <ToolButton label="下划线" onClick={() => command('underline')} />
        <ToolButton label="删除线" onClick={() => command('strikeThrough')} />
        <span className="mx-1 h-4 w-px bg-[#e0e0e0]" />
        <ToolButton label="小" title="字号" onClick={() => command('fontSize', '2')} />
        <ToolButton label="标准" title="字号" onClick={() => command('fontSize', '3')} />
        <ToolButton label="大" title="字号" onClick={() => command('fontSize', '5')} />
        <ToolButton label="特大" title="字号" onClick={() => command('fontSize', '6')} />
        <span className="mx-1 h-4 w-px bg-[#e0e0e0]" />
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            title="文字颜色"
            className="mx-0.5 h-4 w-4 rounded-full border border-black/10"
            style={{ background: color }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command('foreColor', color)}
          />
        ))}
        <span className="mx-1 h-4 w-px bg-[#e0e0e0]" />
        <ToolButton label="左对齐" onClick={() => command('justifyLeft')} />
        <ToolButton label="居中" onClick={() => command('justifyCenter')} />
        <ToolButton label="右对齐" onClick={() => command('justifyRight')} />
        <ToolButton label="小标题" onClick={() => command('formatBlock', 'h2')} />
        <ToolButton label="引用" onClick={() => command('formatBlock', 'blockquote')} />
        <ToolButton label="列表" onClick={() => command('insertUnorderedList')} />
        <ToolButton label="编号" onClick={() => command('insertOrderedList')} />
        <ToolButton label="分割线" onClick={() => insertHtml('<hr>')} />
        <label className="cursor-pointer rounded px-2 py-1 text-[13px] text-[#576b95] hover:bg-white" onMouseDown={rememberRange}>
          {busy ? '插入中' : '图片'}
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void insertImageFile(file)
            }}
          />
        </label>
        <ToolButton label="清除格式" onClick={() => command('removeFormat')} />
      </div>
      <div className="wx-paper mx-auto max-w-[677px] border border-t-0 border-[#e7e7e7] px-6 py-5 shadow-sm" style={{ background: '#fff', color: '#353535', fontFamily: '"PingFang SC","Helvetica Neue",sans-serif' }}>
        <input
          className="wx-title w-full border-0 text-[22px] font-semibold outline-none placeholder:font-normal placeholder:text-[#b2b2b2]"
          style={{ background: '#fff', color: '#353535' }}
          placeholder="请在这里输入标题"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
        />
        <label className="relative mt-4 flex aspect-video cursor-pointer items-center justify-center overflow-hidden bg-[#f7f7f7]">
          {cover ? <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
          <span className={`relative text-sm ${cover ? 'rounded-full bg-black/55 px-3 py-1 text-white' : 'text-[#888]'}`}>{cover ? '更换封面' : '添加封面'}</span>
          <input className="sr-only" type="file" accept="image/*" onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onCoverFile(file)
          }} />
        </label>
        <div
          ref={editorRef}
          className={`wx-editor mt-4 min-h-[320px] bg-transparent outline-none ${articleBodyClass}`}
          style={{ color: '#353535', background: 'transparent' }}
          contentEditable
          role="textbox"
          aria-multiline="true"
          data-placeholder="从这里开始写正文，可插入图片"
          onInput={emit}
          onPaste={(e) => {
            const image = Array.from(e.clipboardData.files).find((file) => file.type.startsWith('image/'))
            if (image) {
              e.preventDefault()
              rememberRange()
              void insertImageFile(image)
              return
            }
            e.preventDefault()
            const html = e.clipboardData.getData('text/html')
            const text = e.clipboardData.getData('text/plain')
            if (html) insertHtml(sanitizeArticleHtml(html))
            else document.execCommand('insertText', false, text)
            emit()
          }}
        />
      </div>
      <p className="mx-auto mt-2 max-w-[677px] text-xs text-[#999]">正文里的图片和文字样式会按你排的版显示在课程详情页。最多 8 张图。</p>
    </section>
  )
}
