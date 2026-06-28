import { ImagePlus, Type } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type MouseEvent } from 'react'
import { cn } from '../../cn'
import { buildRichSpanStyle, richContentToHtml } from '../../meooRegistryShared/richContentCore.js'
import {
  clipboardDataToRichContentMarkdown,
  resolvePendingPasteImages,
  richContentHtmlToMarkdown,
} from '../../meooRegistryShared/richContentPaste.js'
import { uploadOpsContentImage } from '../opsContentImageApi'

type Props = {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minRows?: number
  textareaClassName?: string
  hintClassName?: string
  variant?: 'dark' | 'light'
}

const FONT_SIZE_OPTIONS = [
  { label: '默认 14px', value: '14px' },
  { label: '小 12px', value: '12px' },
  { label: '大 16px', value: '16px' },
  { label: '特大 18px', value: '18px' },
]

const QUICK_TEXT_COLORS = [
  { label: '红', value: '#ef4444' },
  { label: '橙', value: '#f97316' },
  { label: '绿', value: '#22c55e' },
  { label: '蓝', value: '#3b82f6' },
  { label: '紫', value: '#a855f7' },
  { label: '灰', value: '#94a3b8' },
]

function isEmptyEditorHtml(html: string): boolean {
  const t = String(html || '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .trim()
  return !t
}

export default function OpsRichContentEditor({
  value,
  onChange,
  placeholder = '在此直接编辑正文；支持表格、粗体、字色与图片',
  minRows = 6,
  textareaClassName,
  hintClassName,
  variant = 'dark',
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const skipEditorSyncRef = useRef(false)
  const syncTimerRef = useRef<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [fmtHint, setFmtHint] = useState<string | null>(null)
  const [showSource, setShowSource] = useState(false)
  const [fontSize, setFontSize] = useState('14px')
  const [textColor, setTextColor] = useState('#ef4444')
  const [bgColor, setBgColor] = useState('#ffffff')

  const flashHint = (msg: string) => {
    setFmtHint(msg)
    window.setTimeout(() => setFmtHint(null), 2200)
  }

  const syncEditorToValue = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    skipEditorSyncRef.current = true
    const html = el.innerHTML
    const md = isEmptyEditorHtml(html) ? '' : richContentHtmlToMarkdown(html)
    onChange(md)
    window.setTimeout(() => {
      skipEditorSyncRef.current = false
    }, 0)
  }, [onChange])

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current != null) window.clearTimeout(syncTimerRef.current)
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null
      syncEditorToValue()
    }, 280)
  }, [syncEditorToValue])

  useEffect(() => {
    const el = editorRef.current
    if (!el || skipEditorSyncRef.current) return
    const html = value.trim() ? richContentToHtml(value) : ''
    if (el.innerHTML !== html) el.innerHTML = html
  }, [value])

  useEffect(
    () => () => {
      if (syncTimerRef.current != null) window.clearTimeout(syncTimerRef.current)
    },
    [],
  )

  const focusEditor = () => {
    editorRef.current?.focus()
  }

  const selectionInEditor = (): Range | null => {
    const root = editorRef.current
    const sel = window.getSelection()
    if (!root || !sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return null
    return range
  }

  const captureSelection = () => {
    const range = selectionInEditor()
    if (range && !range.collapsed) savedRangeRef.current = range.cloneRange()
  }

  /** 工具栏点击会抢焦点；优先恢复编辑区内上次有效选区 */
  const getActiveRange = (): Range | null => {
    const live = selectionInEditor()
    if (live && !live.collapsed) {
      savedRangeRef.current = live.cloneRange()
      return live
    }
    const saved = savedRangeRef.current
    const root = editorRef.current
    if (saved && root?.contains(saved.commonAncestorContainer)) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(saved)
      return saved
    }
    return live
  }

  const requireNonCollapsedRange = (): Range | null => {
    const range = getActiveRange()
    if (!range || range.collapsed) {
      flashHint('请先在下方编辑区选中文字')
      return null
    }
    return range
  }

  /** 阻止工具栏 mousedown 抢焦点，避免选区丢失 */
  const keepEditorSelection = (e: MouseEvent) => {
    e.preventDefault()
  }

  const wrapRangeWithSpan = (style: string, range?: Range | null): boolean => {
    const active = range ?? getActiveRange()
    if (!active || active.collapsed) {
      flashHint('请先在下方编辑区选中文字')
      return false
    }
    focusEditor()
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(active)
    const span = document.createElement('span')
    span.setAttribute('style', style)
    try {
      active.surroundContents(span)
    } catch {
      const frag = active.extractContents()
      span.appendChild(frag)
      active.insertNode(span)
    }
    sel?.removeAllRanges()
    syncEditorToValue()
    return true
  }

  const applyForeColor = (color: string): boolean => {
    const range = requireNonCollapsedRange()
    if (!range) return false
    focusEditor()
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    try {
      document.execCommand('styleWithCSS', false, 'true')
    } catch {
      /* 部分浏览器不支持 */
    }
    if (document.execCommand('foreColor', false, color)) {
      syncEditorToValue()
      return true
    }
    const style = buildRichSpanStyle({ color })
    return style ? wrapRangeWithSpan(style, range) : false
  }

  const applyInlineStyle = (overrides?: {
    color?: string
    backgroundColor?: string
    fontSize?: string
    colorOnly?: boolean
  }) => {
    if (overrides?.colorOnly && overrides.color) {
      applyForeColor(overrides.color)
      return
    }
    const style = buildRichSpanStyle({
      color: overrides?.color ?? textColor,
      backgroundColor: overrides?.backgroundColor ?? (bgColor !== '#ffffff' ? bgColor : ''),
      fontSize: overrides?.fontSize ?? fontSize,
    })
    if (!style) {
      flashHint('请设置字色、背景或字号后再应用')
      return
    }
    wrapRangeWithSpan(style)
  }

  const onBold = () => {
    const range = requireNonCollapsedRange()
    if (!range) return
    focusEditor()
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    document.execCommand('bold')
    syncEditorToValue()
  }

  const onHeading = () => {
    focusEditor()
    document.execCommand('formatBlock', false, 'h3')
    syncEditorToValue()
  }

  const clearInlineFormat = () => {
    const range = requireNonCollapsedRange()
    if (!range) return
    focusEditor()
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    document.execCommand('removeFormat')
    syncEditorToValue()
  }

  const insertCenterBlock = () => {
    focusEditor()
    const range = selectionInEditor()
    const selected = range && !range.collapsed ? range.toString().trim() : ''
    const inner = selected || '居中内容'
    document.execCommand(
      'insertHTML',
      false,
      `<div style="text-align:center">${inner.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div><p><br></p>`,
    )
    syncEditorToValue()
  }

  const insertHtmlAtCursor = (html: string) => {
    focusEditor()
    document.execCommand('insertHTML', false, html)
    syncEditorToValue()
  }

  const onEditorPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    void (async () => {
      const imageFiles = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
      if (imageFiles.length) {
        e.preventDefault()
        setUploading(true)
        setUploadErr(null)
        try {
          for (const file of imageFiles) {
            const r = await uploadOpsContentImage(file)
            if (!r.ok) {
              setUploadErr(r.detail ?? r.error)
              continue
            }
            const alt = file.name.replace(/\.[^.]+$/, '') || '配图'
            insertHtmlAtCursor(
              `<p><img src="${r.imageUrl}" alt="${alt.replace(/"/g, '&quot;')}" style="max-width:100%;height:auto;display:block;margin:8px 0;" /></p>`,
            )
          }
        } finally {
          setUploading(false)
        }
        return
      }

      const html = e.clipboardData.getData('text/html')
      const plain = e.clipboardData.getData('text/plain')
      const { markdown, pendingImages } = clipboardDataToRichContentMarkdown(html, plain)
      if (!markdown && !pendingImages.length) return

      e.preventDefault()
      let finalMarkdown = markdown
      if (pendingImages.length) {
        setUploading(true)
        setUploadErr(null)
        try {
          finalMarkdown = await resolvePendingPasteImages(finalMarkdown, pendingImages, uploadOpsContentImage)
        } finally {
          setUploading(false)
        }
      }
      insertHtmlAtCursor(richContentToHtml(finalMarkdown))
    })()
  }

  const onPickImage = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    setUploadErr(null)
    try {
      const r = await uploadOpsContentImage(file)
      if (!r.ok) {
        setUploadErr(r.detail ?? r.error)
        return
      }
      const alt = file.name.replace(/\.[^.]+$/, '') || '配图'
      insertHtmlAtCursor(
        `<p><img src="${r.imageUrl}" alt="${alt.replace(/"/g, '&quot;')}" style="max-width:100%;height:auto;display:block;margin:8px 0;" /></p>`,
      )
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const reformatBody = () => {
    syncEditorToValue()
    const { markdown } = clipboardDataToRichContentMarkdown('', value)
    if (!markdown.trim()) return
    onChange(markdown)
    if (editorRef.current) editorRef.current.innerHTML = richContentToHtml(markdown)
  }

  const richPreviewClass =
    variant === 'light'
      ? 'rich-content min-h-[120px] text-sm leading-relaxed text-slate-300 outline-none [&_blockquote]:my-2 [&_blockquote]:rounded-lg [&_blockquote]:border-l-4 [&_blockquote]:border-slate-600 [&_blockquote]:bg-slate-900/60 [&_blockquote]:px-3 [&_blockquote]:py-2 [&_h3]:mb-2 [&_h3]:mt-1 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-100 [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_span]:rounded-sm [&_strong]:font-semibold [&_table.rich-table]:my-3 [&_table.rich-table]:w-full [&_table.rich-table]:border-collapse [&_table.rich-table_td]:border [&_table.rich-table_td]:border-slate-700 [&_table.rich-table_td]:px-2 [&_table.rich-table_td]:py-1.5 [&_table.rich-table_td]:align-top [&_table.rich-table_th]:border [&_table.rich-table_th]:border-slate-600 [&_table.rich-table_th]:bg-slate-800 [&_table.rich-table_th]:px-2 [&_table.rich-table_th]:py-1.5 [&_table.rich-table_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5'
      : 'rich-content min-h-[120px] text-sm leading-relaxed text-slate-300 outline-none [&_blockquote]:my-2 [&_blockquote]:rounded-lg [&_blockquote]:border-l-4 [&_blockquote]:border-violet-400/40 [&_blockquote]:bg-violet-500/10 [&_blockquote]:px-3 [&_blockquote]:py-2 [&_h3]:mb-2 [&_h3]:mt-1 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_span]:rounded-sm [&_strong]:font-semibold [&_table.rich-table]:my-3 [&_table.rich-table]:w-full [&_table.rich-table]:border-collapse [&_table.rich-table_td]:border [&_table.rich-table_td]:border-white/15 [&_table.rich-table_td]:px-2 [&_table.rich-table_td]:py-1.5 [&_table.rich-table_td]:align-top [&_table.rich-table_th]:border [&_table.rich-table_th]:border-white/20 [&_table.rich-table_th]:bg-white/10 [&_table.rich-table_th]:px-2 [&_table.rich-table_th]:py-1.5 [&_table.rich-table_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5'

  const btnClass =
    variant === 'light'
      ? 'inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800'
      : 'inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/20 px-2 py-1 text-xs text-slate-200 hover:bg-white/10'
  const imgBtnClass =
    variant === 'light'
      ? 'inline-flex items-center gap-1 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50'
      : 'inline-flex items-center gap-1 rounded-md border border-violet-400/40 bg-violet-500/10 px-2 py-1 text-xs text-violet-200 hover:bg-violet-500/20 disabled:opacity-50'
  const previewWrapClass =
    variant === 'light'
      ? 'rounded-lg border border-emerald-500/30 bg-slate-950 p-3 ring-1 ring-emerald-500/20'
      : 'rounded-lg border border-emerald-400/25 bg-black/30 p-3 ring-1 ring-emerald-400/15'
  const fmtLabelClass = 'text-[11px] text-slate-500'
  const editorMinH = Math.max(120, minRows * 18)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnClass} onMouseDown={keepEditorSelection} onClick={onBold}>
          <Type className="h-3.5 w-3.5" />
          粗体
        </button>
        <button type="button" className={btnClass} onMouseDown={keepEditorSelection} onClick={onHeading}>
          小标题
        </button>
        <button
          type="button"
          disabled={uploading}
          className={imgBtnClass}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {uploading ? '上传中…' : '插入图片'}
        </button>
        <button type="button" className={btnClass} disabled={!value.trim()} onClick={reformatBody}>
          优化排版
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => void onPickImage(e.target.files?.[0])}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-black/10 p-2">
        <div className="flex flex-col gap-1">
          <span className={fmtLabelClass}>字号</span>
          <select
            className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-slate-200"
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value)}
          >
            {FONT_SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className={fmtLabelClass}>字色</span>
          <input
            type="color"
            value={textColor}
            onChange={(e) => setTextColor(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-white/15 bg-transparent"
            title="字体颜色"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={fmtLabelClass}>背景</span>
          <input
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-white/15 bg-transparent"
            title="字体背景色"
          />
        </div>
        <button
          type="button"
          className={imgBtnClass}
          onMouseDown={keepEditorSelection}
          onClick={() => applyInlineStyle()}
        >
          应用样式
        </button>
        <button type="button" className={btnClass} onMouseDown={keepEditorSelection} onClick={clearInlineFormat}>
          清除样式
        </button>
        <button type="button" className={btnClass} onMouseDown={keepEditorSelection} onClick={insertCenterBlock}>
          居中段落
        </button>
        <div className="flex flex-wrap items-center gap-1">
          <span className={fmtLabelClass}>快捷色</span>
          {QUICK_TEXT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className="rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-slate-300 hover:bg-white/10"
              style={{ color: c.value }}
              onMouseDown={keepEditorSelection}
              onClick={() => applyInlineStyle({ color: c.value, colorOnly: true })}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <p className={cn('text-[11px] text-slate-500', hintClassName)}>
        在下方绿色边框区域直接编辑；选中文字后点工具栏即可改字色/字号。编辑内容会自动同步，点页面「保存文章」即上传。
      </p>
      {fmtHint ? <p className="text-xs text-amber-300">{fmtHint}</p> : null}

      <div className={previewWrapClass}>
        <p className="mb-2 text-[11px] font-medium text-emerald-400/90">
          读者看到的效果（可在此直接编辑，保存后各端按此展示）
        </p>
        <div
          ref={editorRef}
          className={richPreviewClass}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          style={{ minHeight: editorMinH }}
          onInput={scheduleSync}
          onMouseUp={captureSelection}
          onKeyUp={captureSelection}
          onBlur={syncEditorToValue}
          onPaste={onEditorPaste}
        />
      </div>

      <button
        type="button"
        className="text-[11px] text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-300"
        onClick={() => setShowSource((v) => !v)}
      >
        {showSource ? '收起 Markdown 源码' : '展开 Markdown 源码（高级）'}
      </button>
      {showSource ? (
        <textarea
          ref={sourceRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            if (editorRef.current) {
              editorRef.current.innerHTML = e.target.value.trim() ? richContentToHtml(e.target.value) : ''
            }
          }}
          rows={minRows}
          className={
            textareaClassName ??
            'min-h-[100px] w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 font-mono text-xs text-white'
          }
        />
      ) : null}

      {uploadErr ? <p className="text-xs text-rose-300">{uploadErr}</p> : null}

      <style>{`
        .rich-content[contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: rgb(100 116 139);
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
