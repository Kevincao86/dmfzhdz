import { ImagePlus, Type } from 'lucide-react'
import { useRef, useState, type ClipboardEvent } from 'react'
import { cn } from '../../cn'
import { richContentToHtml } from '../../meooRegistryShared/richContentCore.js'
import {
  clipboardDataToRichContentMarkdown,
  resolvePendingPasteImages,
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

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  snippet: string,
  onChange: (v: string) => void,
) {
  const start = textarea.selectionStart ?? textarea.value.length
  const end = textarea.selectionEnd ?? start
  const before = textarea.value.slice(0, start)
  const after = textarea.value.slice(end)
  const next = `${before}${snippet}${after}`
  onChange(next)
  requestAnimationFrame(() => {
    textarea.focus()
    const cursor = start + snippet.length
    textarea.setSelectionRange(cursor, cursor)
  })
}

export default function OpsRichContentEditor({
  value,
  onChange,
  placeholder = '正文支持换行排版；可插入图片、小标题与粗体',
  minRows = 8,
  textareaClassName,
  hintClassName,
  variant = 'dark',
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)

  const wrapSelection = (prefix: string, suffix: string) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? start
    const selected = el.value.slice(start, end)
    const snippet = `${prefix}${selected || '文字'}${suffix}`
    const before = el.value.slice(0, start)
    const after = el.value.slice(end)
    onChange(`${before}${snippet}${after}`)
    requestAnimationFrame(() => {
      el.focus()
      const cursor = start + prefix.length + (selected || '文字').length + suffix.length
      el.setSelectionRange(cursor, cursor)
    })
  }

  const insertMarkdownAtCursor = (markdown: string) => {
    if (!markdown) return
    const el = textareaRef.current
    if (!el) {
      onChange(`${value}${markdown}`)
      return
    }
    insertAtCursor(el, markdown, onChange)
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
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
            insertMarkdownAtCursor(`\n\n![${alt}](${r.imageUrl})\n\n`)
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
      insertMarkdownAtCursor(finalMarkdown)
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
      const el = textareaRef.current
      const alt = file.name.replace(/\.[^.]+$/, '') || '配图'
      const snippet = `\n\n![${alt}](${r.imageUrl})\n\n`
      if (el) {
        insertAtCursor(el, snippet, onChange)
      } else {
        onChange(`${value}${snippet}`)
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const previewHtml = value.trim() ? richContentToHtml(value) : ''

  const reformatBody = () => {
    const { markdown } = clipboardDataToRichContentMarkdown('', value)
    if (markdown.trim()) onChange(markdown)
  }

  const richPreviewClass =
    variant === 'light'
      ? 'rich-content text-sm leading-relaxed text-slate-300 [&_blockquote]:my-2 [&_blockquote]:rounded-lg [&_blockquote]:border-l-4 [&_blockquote]:border-slate-600 [&_blockquote]:bg-slate-900/60 [&_blockquote]:px-3 [&_blockquote]:py-2 [&_h3]:mb-2 [&_h3]:mt-1 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-100 [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_strong]:text-slate-100 [&_table.rich-table]:my-3 [&_table.rich-table]:w-full [&_table.rich-table]:border-collapse [&_table.rich-table_td]:border [&_table.rich-table_td]:border-slate-700 [&_table.rich-table_td]:px-2 [&_table.rich-table_td]:py-1.5 [&_table.rich-table_td]:align-top [&_table.rich-table_th]:border [&_table.rich-table_th]:border-slate-600 [&_table.rich-table_th]:bg-slate-800 [&_table.rich-table_th]:px-2 [&_table.rich-table_th]:py-1.5 [&_table.rich-table_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5'
      : 'rich-content text-sm leading-relaxed text-slate-300 [&_blockquote]:my-2 [&_blockquote]:rounded-lg [&_blockquote]:border-l-4 [&_blockquote]:border-violet-400/40 [&_blockquote]:bg-violet-500/10 [&_blockquote]:px-3 [&_blockquote]:py-2 [&_h3]:mb-2 [&_h3]:mt-1 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_strong]:text-white [&_table.rich-table]:my-3 [&_table.rich-table]:w-full [&_table.rich-table]:border-collapse [&_table.rich-table_td]:border [&_table.rich-table_td]:border-white/15 [&_table.rich-table_td]:px-2 [&_table.rich-table_td]:py-1.5 [&_table.rich-table_td]:align-top [&_table.rich-table_th]:border [&_table.rich-table_th]:border-white/20 [&_table.rich-table_th]:bg-white/10 [&_table.rich-table_th]:px-2 [&_table.rich-table_th]:py-1.5 [&_table.rich-table_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5'

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
      ? 'rounded-lg border border-slate-700 bg-slate-950 p-3'
      : 'rounded-lg border border-white/10 bg-black/30 p-3'
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnClass} onClick={() => wrapSelection('**', '**')}>
          <Type className="h-3.5 w-3.5" />
          粗体
        </button>
        <button
          type="button"
          className={btnClass}
          onClick={() => {
            const el = textareaRef.current
            if (!el) return
            insertAtCursor(el, '\n## 小标题\n\n', onChange)
          }}
        >
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
      <p className={cn('text-[11px] text-slate-500', hintClassName)}>
        可直接粘贴 Word / 网页 / Cursor 回复，以及复制图片后 Ctrl+V 插入；粘贴后会转为 Markdown 源码（含 ** 与 | 表格符号）。读者看到的是下方预览效果，不是源码里的符号。表格乱时可点「优化排版」。
      </p>
      {previewHtml ? (
        <div className={previewWrapClass}>
          <p className="mb-2 text-[11px] font-medium text-emerald-400/90">读者看到的效果（保存后各端按此展示）</p>
          <div className={richPreviewClass} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      ) : null}
      <p className="text-[11px] text-slate-500">Markdown 源码（可继续编辑）</p>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        placeholder={placeholder}
        rows={minRows}
        className={
          textareaClassName ??
          'min-h-[140px] w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white'
        }
      />
      {uploadErr ? <p className="text-xs text-rose-300">{uploadErr}</p> : null}
    </div>
  )
}
