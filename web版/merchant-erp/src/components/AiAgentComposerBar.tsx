import { ChevronDown, Film, ImagePlus, Loader2, Mic, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAiAgent } from '../context/AiAgentContext'
import { cn } from '../cn'
import type { AiComposerAttachment } from '../lib/aiAgentTypes'
import { shouldSubmitComposerOnEnter } from '../lib/composerEnterKey'
import { isComposerImageFile, isComposerVideoFile } from '../lib/aiVideoPoster'

type Layout = 'centered' | 'dock'
type ModelFilterTab = 'all' | 'chat' | 'image'

const FILTER_TABS: { id: ModelFilterTab; label: string; short: string }[] = [
  { id: 'all', label: '全部模型', short: '全部' },
  { id: 'chat', label: '对话', short: '对话' },
  { id: 'image', label: '文生图 / 图生图', short: '生图' },
]

const MEDIA_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,video/*,.mp4,.mov,.m4v,.webm'

function readMediaFilesFromClipboard(ev: React.ClipboardEvent<HTMLTextAreaElement>): File[] {
  const out: File[] = []
  const items = ev.clipboardData?.items
  if (!items) return out
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it?.kind === 'file') {
      const f = it.getAsFile()
      if (f && (isComposerImageFile(f) || isComposerVideoFile(f))) out.push(f)
    }
  }
  return out
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function shortModelLabel(label: string): string {
  const head = label.split(/[·\-–|]/)[0]?.trim() ?? label
  if (head.length <= 10) return head
  return `${head.slice(0, 9)}…`
}

function useClickOutside(refs: React.RefObject<HTMLElement | null>[], onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (refs.some((r) => r.current?.contains(t))) return
      onOutside()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [refs, onOutside, active])
}

function AttachmentPreview({
  att,
  onRemove,
}: {
  att: AiComposerAttachment
  onRemove: () => void
}) {
  return (
    <div className="group relative">
      {att.kind === 'image' ? (
        <img src={att.url} alt="" className="h-14 w-14 rounded-lg border border-slate-200 object-cover" />
      ) : (
        <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-zinc-900">
          <video
            src={att.previewUrl}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
          <span className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-0.5 bg-black/55 py-0.5 text-[9px] text-white">
            <Film className="h-3 w-3" />
            视频
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white opacity-0 shadow group-hover:opacity-100"
        aria-label="移除附件"
      >
        ×
      </button>
    </div>
  )
}

export function AiAgentComposerBar({ layout }: { layout: Layout }) {
  const {
    inputDraft,
    setInputDraft,
    sendUserText,
    modelPickerKey,
    setModelPickerKey,
    modelPickerOptions,
    aiSending,
    pendingPreviewId,
    pendingComposerAttachments,
    addComposerMediaFiles,
    removeComposerAttachment,
    pendingQuote,
    clearPendingQuote,
  } = useAiAgent()

  const fileRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<SpeechRecognition | null>(null)
  const imeComposingRef = useRef(false)
  const filterWrapRef = useRef<HTMLDivElement>(null)
  const modelWrapRef = useRef<HTMLDivElement>(null)
  const [listening, setListening] = useState(false)
  const [modelFilter, setModelFilter] = useState<ModelFilterTab>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  const filteredModelOptions = useMemo(() => {
    if (modelFilter === 'all') return modelPickerOptions
    return modelPickerOptions.filter((o) => (o.capability ?? 'chat') === modelFilter)
  }, [modelPickerOptions, modelFilter])

  const currentModel = useMemo(
    () => modelPickerOptions.find((o) => o.key === modelPickerKey),
    [modelPickerOptions, modelPickerKey],
  )

  const filterShort = FILTER_TABS.find((t) => t.id === modelFilter)?.short ?? '全部'

  useEffect(() => {
    if (filteredModelOptions.some((o) => o.key === modelPickerKey)) return
    const first = filteredModelOptions[0]?.key
    if (first) setModelPickerKey(first)
  }, [filteredModelOptions, modelPickerKey, setModelPickerKey])

  const closeMenus = useCallback(() => {
    setFilterOpen(false)
    setModelOpen(false)
  }, [])

  useClickOutside([filterWrapRef, modelWrapRef], closeMenus, filterOpen || modelOpen)

  const stopListening = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      /* noop */
    }
    recRef.current = null
    setListening(false)
  }, [])

  useEffect(() => {
    return () => stopListening()
  }, [stopListening])

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      window.alert('当前浏览器不支持语音输入，请使用 Chrome 或 Edge 桌面版，并允许麦克风权限。')
      return
    }
    if (listening) {
      stopListening()
      return
    }
    closeMenus()
    const r = new Ctor()
    r.lang = 'zh-CN'
    r.interimResults = false
    r.continuous = false
    r.onresult = (ev: SpeechRecognitionEvent) => {
      const t = ev.results[0]?.[0]?.transcript?.trim()
      if (t) setInputDraft((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))
    }
    r.onerror = () => stopListening()
    r.onend = () => stopListening()
    recRef.current = r
    try {
      r.start()
      setListening(true)
    } catch {
      window.alert('无法启动语音识别，请检查麦克风权限。')
    }
  }, [listening, setInputDraft, stopListening, closeMenus])

  const rows = layout === 'centered' ? 4 : 2
  const disabled = Boolean(pendingPreviewId)
  const modelShort = shortModelLabel(currentModel?.label ?? '模型')
  const attachmentFull = pendingComposerAttachments.length >= 4

  return (
    <div
      className={cn(
        'w-full rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100/80',
        layout === 'centered' && 'rounded-3xl shadow-md shadow-slate-900/5',
      )}
    >
      <input
        ref={fileRef}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          void addComposerMediaFiles(e.target.files).finally(() => {
            if (fileRef.current) fileRef.current.value = ''
          })
        }}
      />

      <div className="px-3 pt-3 sm:px-4 sm:pt-3.5">
        {pendingQuote ? (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-indigo-200/90 bg-indigo-50/90 px-3 py-2 text-xs text-indigo-950">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-indigo-900">引用对话</p>
              <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[11px] text-indigo-900/90">
                {pendingQuote.role === 'user' ? '我' : '助手'}：{pendingQuote.excerpt}
              </p>
            </div>
            <button
              type="button"
              onClick={clearPendingQuote}
              className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100/80"
            >
              移除
            </button>
          </div>
        ) : null}

        {pendingComposerAttachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingComposerAttachments.map((att, i) => (
              <AttachmentPreview
                key={`${att.kind}-${i}`}
                att={att}
                onRemove={() => removeComposerAttachment(i)}
              />
            ))}
          </div>
        ) : null}

        <textarea
          value={inputDraft}
          onChange={(e) => setInputDraft(e.target.value)}
          onPaste={(e) => {
            const files = readMediaFilesFromClipboard(e)
            if (!files.length) return
            e.preventDefault()
            void addComposerMediaFiles(files)
          }}
          onCompositionStart={() => {
            imeComposingRef.current = true
          }}
          onCompositionEnd={() => {
            imeComposingRef.current = false
          }}
          onKeyDown={(e) => {
            if (imeComposingRef.current && e.key === 'Enter') return
            if (!shouldSubmitComposerOnEnter(e)) return
            e.preventDefault()
            sendUserText(inputDraft)
          }}
          rows={rows}
          disabled={disabled}
          placeholder={
            modelFilter === 'image'
              ? '文生图：描述画面；图生图：先上传参考图/视频首帧再写修改要求…'
              : '描述你想完成的任务；可上传图片或视频（视频将提取首帧供模型理解），也可粘贴截图…'
          }
          className={cn(
            'w-full resize-none border-0 bg-transparent px-0 py-0 text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 disabled:opacity-50',
            layout === 'dock' && 'max-h-36 min-h-[2.5rem]',
          )}
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-2 py-2 sm:px-3">
        <button
          type="button"
          disabled={disabled || aiSending || attachmentFull}
          onClick={() => fileRef.current?.click()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-slate-50 text-slate-600 hover:bg-white disabled:opacity-40"
          title="上传图片或视频（最多 4 个，视频单文件 ≤100MB）"
          aria-label="上传图片或视频"
        >
          <ImagePlus className="h-4 w-4" />
        </button>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-1.5">
          <div ref={filterWrapRef} className="relative">
            <button
              type="button"
              disabled={aiSending || disabled}
              onClick={() => {
                setModelOpen(false)
                setFilterOpen((v) => !v)
              }}
              className={cn(
                'inline-flex h-8 max-w-[5.5rem] items-center gap-0.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-medium text-slate-700 hover:bg-white',
                filterOpen && 'border-indigo-300 bg-indigo-50 text-indigo-800',
                (aiSending || disabled) && 'cursor-not-allowed opacity-50',
              )}
              aria-expanded={filterOpen}
              aria-haspopup="listbox"
            >
              <span className="truncate">{filterShort}</span>
              <ChevronDown className={cn('h-3 w-3 shrink-0 opacity-60', filterOpen && 'rotate-180')} />
            </button>
            {filterOpen ? (
              <div
                role="listbox"
                className="absolute bottom-full right-0 z-50 mb-1.5 min-w-[9.5rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10"
              >
                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">模式</p>
                {FILTER_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="option"
                    aria-selected={modelFilter === tab.id}
                    onClick={() => {
                      setModelFilter(tab.id)
                      setFilterOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50',
                      modelFilter === tab.id && 'bg-indigo-50 font-medium text-indigo-900',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div ref={modelWrapRef} className="relative">
            <button
              type="button"
              disabled={aiSending || disabled}
              onClick={() => {
                setFilterOpen(false)
                setModelOpen((v) => !v)
              }}
              className={cn(
                'inline-flex h-8 max-w-[7.5rem] items-center gap-0.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-medium text-slate-700 hover:bg-white',
                modelOpen && 'border-indigo-300 bg-indigo-50 text-indigo-800',
                (aiSending || disabled) && 'cursor-not-allowed opacity-50',
              )}
              title={currentModel?.label}
              aria-expanded={modelOpen}
              aria-haspopup="listbox"
            >
              <span className="truncate">{modelShort}</span>
              <ChevronDown className={cn('h-3 w-3 shrink-0 opacity-60', modelOpen && 'rotate-180')} />
            </button>
            {modelOpen ? (
              <div
                role="listbox"
                className="absolute bottom-full right-0 z-50 mb-1.5 max-h-52 w-[min(16rem,calc(100vw-3rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10"
              >
                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">模型</p>
                {filteredModelOptions.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    role="option"
                    aria-selected={modelPickerKey === o.key}
                    onClick={() => {
                      setModelPickerKey(o.key)
                      setModelOpen(false)
                    }}
                    className={cn(
                      'flex w-full px-3 py-2 text-left text-xs leading-snug text-slate-700 hover:bg-slate-50',
                      modelPickerKey === o.key && 'bg-indigo-50 font-medium text-indigo-900',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-slate-50 text-slate-600 hover:bg-white',
              listening && 'border-indigo-300 bg-indigo-50 text-indigo-700',
            )}
            title={listening ? '点击停止听写' : '语音转文字'}
            aria-label="语音输入"
            onClick={startListening}
          >
            {listening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => sendUserText(inputDraft)}
            disabled={
              (!inputDraft.trim() &&
                pendingComposerAttachments.length === 0 &&
                !pendingQuote) ||
              aiSending ||
              disabled
            }
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="发送"
          >
            {aiSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
