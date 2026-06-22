import { ImagePlus, Type } from 'lucide-react'
import { useRef, useState } from 'react'
import { cn } from '../../cn'
import { richContentToHtml } from '../../meooRegistryShared/richContentCore.js'
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
  const previewTextClass =
    variant === 'light'
      ? 'rich-content text-sm leading-relaxed text-slate-300 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-100 [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_strong]:text-slate-100'
      : 'rich-content text-sm leading-relaxed text-slate-300 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_strong]:text-white'

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
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => void onPickImage(e.target.files?.[0])}
        />
      </div>
      <p className={cn('text-[11px] text-slate-500', hintClassName)}>
        段落之间空一行；图片将上传到 OSS 并插入为 Markdown。支持 **粗体**、## 小标题、![说明](图片链接)
      </p>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={minRows}
        className={
          textareaClassName ??
          'min-h-[140px] w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white'
        }
      />
      {uploadErr ? <p className="text-xs text-rose-300">{uploadErr}</p> : null}
      {previewHtml ? (
        <div className={previewWrapClass}>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">预览</p>
          <div className={previewTextClass} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      ) : null}
    </div>
  )
}
