import { ChevronDown, ImagePlus, Loader2, Mic, Send, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MeooAgentMascot } from './MeooAgentMascot'
import { useAiAgent } from '../context/AiAgentContext'
import { cn } from '../cn'

type Layout = 'centered' | 'dock'
type ModelFilterTab = 'all' | 'chat' | 'image'

function readImageFilesFromClipboard(ev: React.ClipboardEvent<HTMLTextAreaElement>): File[] {
  const out: File[] = []
  const items = ev.clipboardData?.items
  if (!items) return out
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it?.kind === 'file') {
      const f = it.getAsFile()
      if (f && /^image\//i.test(f.type)) out.push(f)
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
    pendingComposerImages,
    addComposerImages,
    addComposerImageFiles,
    removeComposerImage,
    messages,
    pendingQuote,
    clearPendingQuote,
  } = useAiAgent()

  const fileRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<SpeechRecognition | null>(null)
  const [listening, setListening] = useState(false)
  const [modelFilter, setModelFilter] = useState<ModelFilterTab>('all')

  const filteredModelOptions = useMemo(() => {
    if (modelFilter === 'all') return modelPickerOptions
    return modelPickerOptions.filter((o) => (o.capability ?? 'chat') === modelFilter)
  }, [modelPickerOptions, modelFilter])

  useEffect(() => {
    if (filteredModelOptions.some((o) => o.key === modelPickerKey)) return
    const first = filteredModelOptions[0]?.key
    if (first) setModelPickerKey(first)
  }, [filteredModelOptions, modelPickerKey, setModelPickerKey])

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
  }, [listening, setInputDraft, stopListening])

  const speakLastReply = useCallback(() => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant' && m.content.trim())
    if (!last?.content.trim()) {
      window.alert('暂无可朗读的助手回复，请先对话一轮。')
      return
    }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(last.content)
    u.lang = 'zh-CN'
    window.speechSynthesis.speak(u)
  }, [messages])

  const rows = layout === 'centered' ? 5 : 2
  const disabled = Boolean(pendingPreviewId)

  return (
    <div className="w-full">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          void addComposerImages(e.target.files).finally(() => {
            if (fileRef.current) fileRef.current.value = ''
          })
        }}
      />

      <div className="flex items-end gap-1.5 sm:gap-2">
        <MeooAgentMascot
          aiSending={aiSending}
          inputDraft={inputDraft}
          className="shrink-0 scale-[0.92] pb-0.5 sm:scale-100"
        />
        <div className="min-w-0 flex-1">
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
      {pendingComposerImages.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {pendingComposerImages.map((src, i) => (
            <div key={i} className="group relative">
              <img src={src} alt="" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
              <button
                type="button"
                onClick={() => removeComposerImage(i)}
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white opacity-0 shadow group-hover:opacity-100"
                aria-label="移除图片"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div
        className={cn(
          layout === 'centered' ? 'rounded-t-3xl px-2 pt-2 sm:px-3' : 'px-1 pt-1',
        )}
      >
        <textarea
          value={inputDraft}
          onChange={(e) => setInputDraft(e.target.value)}
          onPaste={(e) => {
            const files = readImageFilesFromClipboard(e)
            if (!files.length) return
            e.preventDefault()
            void addComposerImageFiles(files)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendUserText(inputDraft)
            }
          }}
          rows={rows}
          disabled={disabled}
          placeholder={
            modelFilter === 'image'
              ? '文生图：直接描述画面；图生图：先点右侧上传参考图，再写希望保留或修改的内容。'
              : '描述你想完成的任务，或输入 @ 提及页面要点；可直接粘贴多张截图（Ctrl+V）…'
          }
          className={cn(
            'w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50',
            layout === 'dock' && 'max-h-40 min-h-[2.75rem]',
          )}
        />
      </div>

      <div
        className={cn(
          'flex flex-wrap items-center gap-2 border-slate-100 pt-2',
          layout === 'centered' ? 'border-t px-3 pb-2.5 sm:px-4' : 'px-1 pb-1',
        )}
      >
        <div className="relative min-w-0 flex-1 basis-[10rem] sm:max-w-[min(100%,14rem)]">
          <div className="mb-1 flex flex-wrap gap-1">
            {(
              [
                { id: 'all' as const, label: '全部' },
                { id: 'chat' as const, label: '对话' },
                { id: 'image' as const, label: '文生图 / 图生图' },
              ] satisfies { id: ModelFilterTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                disabled={aiSending || disabled}
                onClick={() => setModelFilter(tab.id)}
                className={cn(
                  'rounded-lg px-2 py-0.5 text-[11px] font-medium transition',
                  modelFilter === tab.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  (aiSending || disabled) && 'cursor-not-allowed opacity-50',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <select
            aria-label="选择助手风格"
            value={modelPickerKey}
            disabled={aiSending || disabled}
            onChange={(e) => setModelPickerKey(e.target.value)}
            className={cn(
              'h-10 w-full min-w-0 cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 py-0 pl-3 pr-9',
              'text-xs font-medium text-slate-800 hover:bg-white',
              'focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100',
              (aiSending || disabled) && 'cursor-not-allowed opacity-60',
            )}
          >
            {filteredModelOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50',
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            title="朗读最近一条助手回复"
            aria-label="语音朗读"
            onClick={speakLastReply}
          >
            <Volume2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={disabled || aiSending || pendingComposerImages.length >= 4}
            onClick={() => fileRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40"
            title="上传或粘贴截图（最多 4 张；输入框内 Ctrl+V 可一次粘贴多张）"
            aria-label="上传图片"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => sendUserText(inputDraft)}
            disabled={
              (!inputDraft.trim() && pendingComposerImages.length === 0 && !pendingQuote) ||
              aiSending ||
              disabled
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="发送"
          >
            {aiSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
        </div>
      </div>
    </div>
  )
}
