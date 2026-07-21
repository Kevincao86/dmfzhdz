/**
 * 服务商 · AI 创作 · 录播工坊（半自动）
 * 口播稿按页 → TTS（预设/克隆音色）→ 导播播放；另窗 PPT + OBS 录屏。
 */
import {
  Download,
  Loader2,
  Mic2,
  Play,
  RefreshCw,
  Square,
  Upload,
  Clapperboard,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import {
  estimateSpeechSec,
  formatTimelineChecklist,
  parseOralScriptMarkdown,
  SAMPLE_OPENING_ORAL_SCRIPT,
  type CourseRecordPage,
} from '../lib/courseRecordWorkshop'
import {
  ICE_MIX_VOICE_DEFAULT_ID,
  ICE_MIX_VOICE_PRESETS,
  voicePresetById,
} from '../lib/digitalHumanBroadcast'
import { blobToPureAudioBase64, fileToAudioBlob } from '../lib/digitalHumanAudioChunks'
import { synthesizeDigitalHumanSpeech } from '../services/digitalHumanTtsApi'

type PageAudio = {
  status: 'idle' | 'running' | 'done' | 'error'
  blobUrl?: string
  blob?: Blob
  message?: string
  durationSec?: number
}

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  const url = URL.createObjectURL(blob)
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

function base64ToMp3Blob(b64: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: 'audio/mpeg' })
}

export default function CourseRecordWorkshopPage() {
  const [courseTitle, setCourseTitle] = useState('开场白 · 口播稿总目录')
  const [rawScript, setRawScript] = useState(SAMPLE_OPENING_ORAL_SCRIPT)
  const [pages, setPages] = useState<CourseRecordPage[]>(() =>
    parseOralScriptMarkdown(SAMPLE_OPENING_ORAL_SCRIPT),
  )
  const [voicePresetId, setVoicePresetId] = useState(ICE_MIX_VOICE_DEFAULT_ID)
  const [cloneFileName, setCloneFileName] = useState<string | null>(null)
  const cloneBlobRef = useRef<Blob | null>(null)
  const cloneInputRef = useRef<HTMLInputElement>(null)

  const [audios, setAudios] = useState<Record<number, PageAudio>>({})
  const [busyAll, setBusyAll] = useState(false)
  const [guideIndex, setGuideIndex] = useState<number | null>(null)
  const [guidePlaying, setGuidePlaying] = useState(false)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const guideStopRef = useRef(false)

  const voiceLabel = useMemo(() => {
    if (voicePresetId === 'v-clone') return cloneFileName ? `克隆 · ${cloneFileName}` : '克隆音色（未上传）'
    return voicePresetById(voicePresetId)?.label || voicePresetId
  }, [voicePresetId, cloneFileName])

  const parseScript = useCallback(() => {
    const next = parseOralScriptMarkdown(rawScript)
    setPages(next)
    setAudios({})
    setGuideIndex(null)
    setGuidePlaying(false)
  }, [rawScript])

  useEffect(() => {
    return () => {
      guideStopRef.current = true
      audioElRef.current?.pause()
      Object.values(audios).forEach((a) => {
        if (a.blobUrl) URL.revokeObjectURL(a.blobUrl)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
  }, [])

  const synthOne = useCallback(
    async (page: CourseRecordPage): Promise<PageAudio> => {
      const text = page.script.trim()
      if (!text) return { status: 'error', message: '本页口播为空' }
      if (voicePresetId === 'v-clone' && !cloneBlobRef.current) {
        return { status: 'error', message: '请先上传克隆音色样本' }
      }
      let referenceAudioBase64: string | undefined
      if (voicePresetId === 'v-clone' && cloneBlobRef.current) {
        referenceAudioBase64 = await blobToPureAudioBase64(cloneBlobRef.current)
      }
      const preset = voicePresetById(voicePresetId)
      const out = await synthesizeDigitalHumanSpeech({
        text: text.slice(0, 2200),
        voicePresetId,
        speechRate: preset?.rate ?? 1,
        speechPitch: preset?.pitch ?? 1,
        referenceAudioBase64,
      })
      if (!out.ok) return { status: 'error', message: out.message }
      const blob = base64ToMp3Blob(out.audioBase64)
      const blobUrl = URL.createObjectURL(blob)
      return {
        status: 'done',
        blob,
        blobUrl,
        durationSec: estimateSpeechSec(text),
      }
    },
    [voicePresetId],
  )

  const generatePage = async (page: CourseRecordPage) => {
    setAudios((prev) => {
      const old = prev[page.pageNo]
      if (old?.blobUrl) URL.revokeObjectURL(old.blobUrl)
      return { ...prev, [page.pageNo]: { status: 'running' } }
    })
    const result = await synthOne(page)
    setAudios((prev) => ({ ...prev, [page.pageNo]: result }))
  }

  const generateAll = async () => {
    if (!pages.length) {
      parseScript()
      return
    }
    if (voicePresetId === 'v-clone' && !cloneBlobRef.current) {
      window.alert('请先上传克隆音色样本（MP3/WAV/M4A）')
      return
    }
    setBusyAll(true)
    guideStopRef.current = true
    setGuidePlaying(false)
    try {
      for (const page of pages) {
        setAudios((prev) => {
          const old = prev[page.pageNo]
          if (old?.blobUrl) URL.revokeObjectURL(old.blobUrl)
          return { ...prev, [page.pageNo]: { status: 'running' } }
        })
        const result = await synthOne(page)
        setAudios((prev) => ({ ...prev, [page.pageNo]: result }))
        if (result.status === 'error') {
          /* 继续下一页，不中断整批 */
        }
      }
    } finally {
      setBusyAll(false)
    }
  }

  const playPage = (pageNo: number) => {
    const a = audios[pageNo]
    if (!a?.blobUrl) return
    audioElRef.current?.pause()
    const el = new Audio(a.blobUrl)
    audioElRef.current = el
    void el.play()
  }

  const stopGuide = () => {
    guideStopRef.current = true
    setGuidePlaying(false)
    audioElRef.current?.pause()
  }

  const startGuide = async () => {
    const ready = pages.filter((p) => audios[p.pageNo]?.status === 'done' && audios[p.pageNo]?.blobUrl)
    if (!ready.length) {
      window.alert('请先生成至少一页音频')
      return
    }
    guideStopRef.current = false
    setGuidePlaying(true)
    for (let i = 0; i < pages.length; i++) {
      if (guideStopRef.current) break
      const page = pages[i]!
      const a = audios[page.pageNo]
      if (!a?.blobUrl) continue
      setGuideIndex(i)
      await new Promise<void>((resolve) => {
        const el = new Audio(a.blobUrl!)
        audioElRef.current = el
        el.onended = () => resolve()
        el.onerror = () => resolve()
        void el.play().catch(() => resolve())
      })
      if (guideStopRef.current) break
      await new Promise((r) => window.setTimeout(r, 800))
    }
    setGuidePlaying(false)
    setGuideIndex(null)
  }

  const exportChecklist = () => {
    const md = formatTimelineChecklist(pages, { courseTitle, voiceLabel })
    downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${courseTitle || '录播'}-时间轴.md`)
  }

  const downloadAllAudio = () => {
    let n = 0
    for (const page of pages) {
      const a = audios[page.pageNo]
      if (!a?.blob) continue
      downloadBlob(a.blob, `page-${String(page.pageNo).padStart(2, '0')}.mp3`)
      n += 1
    }
    if (!n) window.alert('暂无已生成音频')
  }

  const doneCount = pages.filter((p) => audios[p.pageNo]?.status === 'done').length
  const current = guideIndex != null ? pages[guideIndex] : null

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-teal-600">
          <Clapperboard className="h-5 w-5" />
          <span className="text-xs font-semibold tracking-wider uppercase">AI 创作 · 录播工坊</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">半自动录播工坊</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          粘贴按页口播稿 → 选音色或上传克隆样本 → 一键生成每页 MP3 → 另窗打开 PPT 全屏，用 OBS
          录屏，同时点「开始导播」播音并按页号翻 PPT。不做全自动无人录屏，适合服务商批量出课。
        </p>
      </header>

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 md:p-5">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-slate-800">课程标题</span>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-teal-500"
            value={courseTitle}
            onChange={(e) => setCourseTitle(e.target.value)}
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-slate-800">口播音色</span>
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-teal-500"
            value={voicePresetId}
            onChange={(e) => setVoicePresetId(e.target.value)}
          >
            {ICE_MIX_VOICE_PRESETS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
                {v.id === 'v-clone' ? '（需上传样本）' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <input
            ref={cloneInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                const blob = await fileToAudioBlob(f)
                cloneBlobRef.current = blob
                setCloneFileName(f.name)
                setVoicePresetId('v-clone')
              } catch (err) {
                window.alert(err instanceof Error ? err.message : String(err))
              }
            }}
          />
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            onClick={() => cloneInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            上传音色样本
          </button>
          <span className="text-xs text-slate-500">
            {cloneFileName ? `已选：${cloneFileName}` : '克隆音色请上传 10～30 秒清晰人声样本'}
          </span>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">口播稿（按页）</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={() => {
                setRawScript(SAMPLE_OPENING_ORAL_SCRIPT)
                setCourseTitle('开场白 · 口播稿总目录')
                setPages(parseOralScriptMarkdown(SAMPLE_OPENING_ORAL_SCRIPT))
                setAudios({})
              }}
            >
              填入开场白示例
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
              onClick={parseScript}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              解析分页
            </button>
          </div>
        </div>
        <textarea
          className="min-h-[220px] w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-teal-500 md:text-sm"
          value={rawScript}
          onChange={(e) => setRawScript(e.target.value)}
          placeholder={'### 第 1 页 · 封面\n口播正文…\n\n### 第 2 页 · …'}
        />
        <p className="text-xs text-slate-500">
          识别标题格式：<code className="rounded bg-slate-100 px-1">### 第 N 页 · 标题</code>
          （与课程口播稿一致）。解析后共 <b>{pages.length}</b> 页，已生成音频{' '}
          <b>
            {doneCount}/{pages.length}
          </b>
          。
        </p>
      </section>

      <section className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busyAll || !pages.length}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white',
            busyAll ? 'bg-teal-400' : 'bg-teal-600 hover:bg-teal-700',
            'disabled:opacity-50',
          )}
          onClick={() => void generateAll()}
        >
          {busyAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4" />}
          {busyAll ? '正在按页合成…' : '一键生成全部页音频'}
        </button>
        <button
          type="button"
          disabled={guidePlaying || doneCount === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-teal-600 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
          onClick={() => void startGuide()}
        >
          <Play className="h-4 w-4" />
          开始导播（录屏用）
        </button>
        {guidePlaying ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700"
            onClick={stopGuide}
          >
            <Square className="h-4 w-4" />
            停止导播
          </button>
        ) : null}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
          onClick={downloadAllAudio}
        >
          <Download className="h-4 w-4" />
          下载全部 MP3
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
          onClick={exportChecklist}
        >
          <Download className="h-4 w-4" />
          导出时间轴清单
        </button>
      </section>

      {current ? (
        <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-lg">
          <div className="text-teal-300 text-sm font-medium tracking-wide">导播中 · 请翻 PPT 到本页</div>
          <div className="mt-2 text-3xl font-bold md:text-4xl">
            第 {current.pageNo} 页 · {current.title}
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-200 md:text-base">{current.script}</p>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">按页列表</div>
        <ul className="divide-y divide-slate-100">
          {pages.map((page) => {
            const a = audios[page.pageNo]
            return (
              <li key={page.pageNo} className="flex flex-col gap-3 p-4 md:flex-row md:items-start">
                <div className="w-16 shrink-0 text-sm font-bold text-teal-700">P{page.pageNo}</div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-medium text-slate-900">{page.title}</div>
                  <p className="line-clamp-3 text-xs leading-relaxed text-slate-600 md:text-sm">{page.script}</p>
                  <div className="text-[11px] text-slate-400">
                    预估 ~{estimateSpeechSec(page.script)}s
                    {a?.status === 'error' ? ` · ${a.message}` : null}
                    {a?.status === 'done' ? ' · 已生成' : null}
                    {a?.status === 'running' ? ' · 合成中…' : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyAll || a?.status === 'running'}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => void generatePage(page)}
                  >
                    {a?.status === 'running' ? (
                      <Loader2 className="inline h-3.5 w-3.5 animate-spin" />
                    ) : (
                      '生成本页'
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={a?.status !== 'done'}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => playPage(page.pageNo)}
                  >
                    <Play className="h-3 w-3" />
                    试听
                  </button>
                  <button
                    type="button"
                    disabled={!a?.blob}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => a?.blob && downloadBlob(a.blob, `page-${String(page.pageNo).padStart(2, '0')}.mp3`)}
                  >
                    <Download className="h-3 w-3" />
                    MP3
                  </button>
                </div>
              </li>
            )
          })}
          {!pages.length ? (
            <li className="p-8 text-center text-sm text-slate-500">粘贴口播稿后点「解析分页」</li>
          ) : null}
        </ul>
      </section>

      <aside className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <b className="text-slate-800">录屏步骤：</b>
        1）本机打开课程 PPT/HTML 全屏；2）OBS 选该窗口；3）本页生成音频并「开始导播」；4）听到页码提示后翻 PPT；5）导出时间轴清单归档。
        口播音色与数字人/混剪同源（含克隆）。
      </aside>
    </div>
  )
}
