/**
 * 服务商 · AI 创作 · 录播工坊（半自动）
 * 口播稿按页 → TTS（预设/克隆音色）→ 导播播放；另窗 PPT + OBS 录屏。
 */
import {
  Download,
  Loader2,
  Mic2,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Square,
  Upload,
  Clapperboard,
  Volume2,
  ImagePlus,
  Film,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import {
  composeCourseRecordVideo,
  estimateSpeechSec,
  formatTimelineChecklist,
  matchImagesToCoursePages,
  pagesToOralMarkdown,
  parseOralScriptMarkdown,
  parseOralScriptWithAi,
  probeAudioDurationSec,
  revokeCourseRecordPageImages,
  SAMPLE_OPENING_ORAL_SCRIPT,
  VOICE_PREVIEW_FALLBACK,
  type CourseRecordPage,
  type CourseRecordPageImage,
} from '../lib/courseRecordWorkshop'
import {
  ICE_MIX_VOICE_DEFAULT_ID,
  ICE_MIX_VOICE_PRESETS,
  voicePresetById,
} from '../lib/digitalHumanBroadcast'
import { blobToPureAudioBase64, fileToAudioBlob } from '../lib/digitalHumanAudioChunks'
import {
  playDigitalHumanSpeech,
  primeDigitalHumanAudioPlayback,
  stopDigitalHumanSpeech,
} from '../lib/digitalHumanTtsPlayer'
import { parseGuidanceDocumentFile } from '../lib/shortVideoGuidanceDoc'
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
  const scriptInputRef = useRef<HTMLInputElement>(null)
  const slideInputRef = useRef<HTMLInputElement>(null)

  const [audios, setAudios] = useState<Record<number, PageAudio>>({})
  const [pageImages, setPageImages] = useState<Record<number, CourseRecordPageImage>>({})
  const [busyAll, setBusyAll] = useState(false)
  const [videoBusy, setVideoBusy] = useState(false)
  const [videoProgress, setVideoProgress] = useState<string | null>(null)
  const [parseBusy, setParseBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [voicePreviewBusy, setVoicePreviewBusy] = useState(false)
  const [voicePreviewPlaying, setVoicePreviewPlaying] = useState(false)
  const [pagePreviewBusy, setPagePreviewBusy] = useState<number | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [guideIndex, setGuideIndex] = useState<number | null>(null)
  const [guidePlaying, setGuidePlaying] = useState(false)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const guideStopRef = useRef(false)
  const videoAbortRef = useRef<AbortController | null>(null)

  const resolvedVoice = useMemo(
    () => voicePresetById(voicePresetId) ?? ICE_MIX_VOICE_PRESETS[0]!,
    [voicePresetId],
  )

  const voiceLabel = useMemo(() => {
    if (voicePresetId === 'v-clone') return cloneFileName ? `克隆 · ${cloneFileName}` : '克隆音色（未上传）'
    return resolvedVoice.label || voicePresetId
  }, [voicePresetId, cloneFileName, resolvedVoice.label])

  const applyPages = useCallback((next: CourseRecordPage[], syncRaw?: boolean) => {
    setPages(next)
    if (syncRaw) setRawScript(pagesToOralMarkdown(next))
    setAudios((prev) => {
      Object.values(prev).forEach((a) => {
        if (a.blobUrl) URL.revokeObjectURL(a.blobUrl)
      })
      return {}
    })
    setPageImages((prev) => {
      revokeCourseRecordPageImages(Object.values(prev))
      return {}
    })
    setGuideIndex(null)
    setGuidePlaying(false)
  }, [])

  const clearPageImages = useCallback(() => {
    setPageImages((prev) => {
      revokeCourseRecordPageImages(Object.values(prev))
      return {}
    })
    setHint('已清空课件图片')
  }, [])

  const onUploadSlides = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return
      if (!pages.length) {
        window.alert('请先解析口播分页，再上传编号图片')
        return
      }
      const { matched, unmatchedNames, missingPageNos } = matchImagesToCoursePages(
        Array.from(fileList),
        pages,
      )
      setPageImages((prev) => {
        revokeCourseRecordPageImages(Object.values(prev))
        const next: Record<number, CourseRecordPageImage> = {}
        for (const m of matched) next[m.pageNo] = m
        return next
      })
      const parts = [`已匹配 ${matched.length}/${pages.length} 页图片`]
      if (missingPageNos.length) parts.push(`缺页：${missingPageNos.slice(0, 12).join(',')}${missingPageNos.length > 12 ? '…' : ''}`)
      if (unmatchedNames.length) parts.push(`未用：${unmatchedNames.slice(0, 3).join('、')}`)
      setHint(parts.join(' · '))
    },
    [pages],
  )

  const parseScriptRules = useCallback(() => {
    const next = parseOralScriptMarkdown(rawScript)
    applyPages(next)
    setHint(next.length ? `规则解析完成：${next.length} 页` : '未识别到分页，请检查格式或改用 AI 解析')
  }, [rawScript, applyPages])

  const parseScriptAi = useCallback(async () => {
    if (!rawScript.trim()) {
      window.alert('请先粘贴或上传口播稿')
      return
    }
    setParseBusy(true)
    setHint(null)
    try {
      const next = await parseOralScriptWithAi(rawScript)
      applyPages(next, true)
      setHint(`AI 解析完成：${next.length} 页（已回写口播稿）`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const fallback = parseOralScriptMarkdown(rawScript)
      if (fallback.length) {
        applyPages(fallback)
        setHint(`AI 解析失败（${msg.slice(0, 80)}），已回退规则解析：${fallback.length} 页`)
      } else {
        setHint(`AI 解析失败：${msg}`)
        window.alert(`AI 解析失败：${msg}`)
      }
    } finally {
      setParseBusy(false)
    }
  }, [rawScript, applyPages])

  useEffect(() => {
    return () => {
      guideStopRef.current = true
      videoAbortRef.current?.abort()
      stopDigitalHumanSpeech()
      audioElRef.current?.pause()
      Object.values(audios).forEach((a) => {
        if (a.blobUrl) URL.revokeObjectURL(a.blobUrl)
      })
      revokeCourseRecordPageImages(Object.values(pageImages))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
  }, [])

  const resolveCloneB64 = useCallback(async (): Promise<string | undefined> => {
    if (voicePresetId !== 'v-clone' || !cloneBlobRef.current) return undefined
    return blobToPureAudioBase64(cloneBlobRef.current)
  }, [voicePresetId])

  const playVoicePreview = useCallback(async () => {
    if (voicePreviewBusy || voicePreviewPlaying) {
      stopDigitalHumanSpeech()
      setVoicePreviewPlaying(false)
      setVoicePreviewBusy(false)
      return
    }
    if (voicePresetId === 'v-clone' && !cloneBlobRef.current) {
      window.alert('请先上传克隆音色样本')
      return
    }
    const sample =
      pages.find((p) => p.script.trim())?.script.trim().slice(0, 120) || VOICE_PREVIEW_FALLBACK
    primeDigitalHumanAudioPlayback()
    setVoicePreviewBusy(true)
    setHint(null)
    try {
      const referenceAudioBase64 = await resolveCloneB64()
      const out = await playDigitalHumanSpeech(
        sample,
        {
          preset: resolvedVoice,
          speechRate: resolvedVoice.rate,
          speechPitch: resolvedVoice.pitch,
          mode: 'tts',
          referenceAudioBase64,
        },
        {
          onStart: () => {
            setVoicePreviewBusy(false)
            setVoicePreviewPlaying(true)
          },
          onEnd: () => setVoicePreviewPlaying(false),
          onError: () => {
            setVoicePreviewBusy(false)
            setVoicePreviewPlaying(false)
          },
        },
      )
      if (!out.ok) {
        setVoicePreviewBusy(false)
        setVoicePreviewPlaying(false)
        setHint(out.message || '音色试听失败')
      } else if (out.cloudFallbackReason) {
        setHint(`已改用浏览器试听：${out.cloudFallbackReason}`)
      }
    } catch (e) {
      setVoicePreviewBusy(false)
      setVoicePreviewPlaying(false)
      setHint(e instanceof Error ? e.message : '音色试听失败')
    }
  }, [
    voicePreviewBusy,
    voicePreviewPlaying,
    voicePresetId,
    pages,
    resolvedVoice,
    resolveCloneB64,
  ])

  const synthOne = useCallback(
    async (page: CourseRecordPage): Promise<PageAudio> => {
      const text = page.script.trim()
      if (!text) return { status: 'error', message: '本页口播为空' }
      if (voicePresetId === 'v-clone' && !cloneBlobRef.current) {
        return { status: 'error', message: '请先上传克隆音色样本' }
      }
      const referenceAudioBase64 = await resolveCloneB64()
      const out = await synthesizeDigitalHumanSpeech({
        text: text.slice(0, 2200),
        voicePresetId,
        speechRate: resolvedVoice.rate,
        speechPitch: resolvedVoice.pitch,
        referenceAudioBase64,
      })
      if (!out.ok) return { status: 'error', message: out.message }
      const blob = base64ToMp3Blob(out.audioBase64)
      const blobUrl = URL.createObjectURL(blob)
      const probed = await probeAudioDurationSec(blob)
      return {
        status: 'done',
        blob,
        blobUrl,
        durationSec: probed ?? estimateSpeechSec(text),
      }
    },
    [voicePresetId, resolvedVoice, resolveCloneB64],
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
      parseScriptRules()
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
      }
    } finally {
      setBusyAll(false)
    }
  }

  /** 已有 MP3 直接播；否则即时合成试听当前音色 */
  const playPage = async (page: CourseRecordPage) => {
    const existing = audios[page.pageNo]
    if (existing?.blobUrl && existing.status === 'done') {
      stopDigitalHumanSpeech()
      audioElRef.current?.pause()
      const el = new Audio(existing.blobUrl)
      audioElRef.current = el
      void el.play()
      return
    }
    if (!page.script.trim()) {
      window.alert('本页口播为空')
      return
    }
    if (voicePresetId === 'v-clone' && !cloneBlobRef.current) {
      window.alert('请先上传克隆音色样本')
      return
    }
    primeDigitalHumanAudioPlayback()
    setPagePreviewBusy(page.pageNo)
    try {
      const referenceAudioBase64 = await resolveCloneB64()
      const out = await playDigitalHumanSpeech(
        page.script.trim().slice(0, 800),
        {
          preset: resolvedVoice,
          speechRate: resolvedVoice.rate,
          speechPitch: resolvedVoice.pitch,
          mode: 'tts',
          referenceAudioBase64,
        },
        {
          onEnd: () => setPagePreviewBusy(null),
          onError: () => setPagePreviewBusy(null),
        },
      )
      if (!out.ok) {
        setPagePreviewBusy(null)
        setHint(out.message || '本页试听失败')
      }
    } catch (e) {
      setPagePreviewBusy(null)
      setHint(e instanceof Error ? e.message : '本页试听失败')
    }
  }

  const stopGuide = () => {
    guideStopRef.current = true
    setGuidePlaying(false)
    stopDigitalHumanSpeech()
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

  const imageMatchedCount = useMemo(
    () => pages.filter((p) => pageImages[p.pageNo]).length,
    [pages, pageImages],
  )
  const videoReadyCount = useMemo(
    () =>
      pages.filter(
        (p) => pageImages[p.pageNo] && audios[p.pageNo]?.status === 'done' && audios[p.pageNo]?.blob,
      ).length,
    [pages, pageImages, audios],
  )

  const generateAndDownloadVideo = async () => {
    const slides = []
    for (const page of pages) {
      const img = pageImages[page.pageNo]
      const a = audios[page.pageNo]
      if (!img || !a?.blob || a.status !== 'done') continue
      let durationSec = a.durationSec
      if (!(durationSec && durationSec > 0)) {
        durationSec = (await probeAudioDurationSec(a.blob)) ?? estimateSpeechSec(page.script)
      }
      slides.push({
        pageNo: page.pageNo,
        title: page.title,
        imageBlob: img.file,
        audioBlob: a.blob,
        durationSec,
      })
    }
    if (!slides.length) {
      window.alert('请先生成音频，并上传与页码对应的课件图片（如 01.png / page-12.jpg）')
      return
    }
    if (slides.length < pages.length) {
      const ok = window.confirm(
        `仅 ${slides.length}/${pages.length} 页同时具备图片+音频，将只合成这些页。继续？`,
      )
      if (!ok) return
    }

    videoAbortRef.current?.abort()
    const ac = new AbortController()
    videoAbortRef.current = ac
    setVideoBusy(true)
    setVideoProgress('准备合成…')
    setHint(null)
    try {
      const blob = await composeCourseRecordVideo({
        slides,
        onProgress: (msg) => setVideoProgress(msg),
        signal: ac.signal,
      })
      const safeTitle = (courseTitle || '录播').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40)
      downloadBlob(blob, `${safeTitle}-图文录播.webm`)
      setHint(`已下载视频（${slides.length} 页，约 ${(blob.size / (1024 * 1024)).toFixed(1)} MB）`)
      setVideoProgress(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== '已取消') {
        setHint(`视频合成失败：${msg}`)
        window.alert(`视频合成失败：${msg}`)
      }
      setVideoProgress(null)
    } finally {
      setVideoBusy(false)
      videoAbortRef.current = null
    }
  }

  const onUploadScript = async (file: File) => {
    setUploadBusy(true)
    setHint(null)
    try {
      const text = await parseGuidanceDocumentFile(file)
      setRawScript(text)
      const next = parseOralScriptMarkdown(text)
      applyPages(next)
      setHint(
        next.length
          ? `已导入「${file.name}」，规则解析 ${next.length} 页（可用 AI 再解析）`
          : `已导入「${file.name}」，未识别分页，请点「AI 解析分页」`,
      )
      if (!courseTitle.trim() || courseTitle === '开场白 · 口播稿总目录') {
        setCourseTitle(file.name.replace(/\.(txt|md|docx?)$/i, ''))
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setUploadBusy(false)
    }
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
          粘贴或上传口播稿 → AI/规则分页 → 选音色并试听 → 一键生成每页 MP3 → 上传编号课件图（与页码对齐）→
          按音频时长出成片下载；也可另窗 PPT + OBS，点「开始导播」同步翻页。
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
        <div className="space-y-1.5 text-sm">
          <span className="font-medium text-slate-800">口播音色</span>
          <div className="flex gap-2">
            <select
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-teal-500"
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
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-50"
              title="试听当前音色"
              disabled={voicePreviewBusy && !voicePreviewPlaying}
              onClick={() => void playVoicePreview()}
            >
              {voicePreviewBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : voicePreviewPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
              {voicePreviewBusy ? '合成' : voicePreviewPlaying ? '停止' : '试听'}
            </button>
          </div>
        </div>
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
                setHint('克隆样本已就绪，可点「试听」确认音色')
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
            <input
              ref={scriptInputRef}
              type="file"
              accept=".txt,.md,.doc,.docx,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void onUploadScript(f)
              }}
            />
            <button
              type="button"
              disabled={uploadBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
              onClick={() => scriptInputRef.current?.click()}
            >
              {uploadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              本地上传
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={() => {
                setRawScript(SAMPLE_OPENING_ORAL_SCRIPT)
                setCourseTitle('开场白 · 口播稿总目录')
                applyPages(parseOralScriptMarkdown(SAMPLE_OPENING_ORAL_SCRIPT))
                setHint('已填入开场白示例')
              }}
            >
              填入开场白示例
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={parseScriptRules}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              规则解析
            </button>
            <button
              type="button"
              disabled={parseBusy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              onClick={() => void parseScriptAi()}
            >
              {parseBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              AI 解析分页
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
          支持上传 .txt / .md / .docx；识别格式{' '}
          <code className="rounded bg-slate-100 px-1">### 第 N 页 · 标题</code>
          。无格式时用「AI 解析分页」。当前 <b>{pages.length}</b> 页，音频{' '}
          <b>
            {doneCount}/{pages.length}
          </b>
          。
          {hint ? <span className="ml-2 text-teal-700">{hint}</span> : null}
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
        <button
          type="button"
          disabled={videoBusy || videoReadyCount === 0}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white',
            videoBusy ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700',
            'disabled:opacity-50',
          )}
          onClick={() => void generateAndDownloadVideo()}
          title="每页图片展示时长 = 对应页音频时长"
        >
          {videoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
          {videoBusy ? '正在合成视频…' : '生成录播视频并下载'}
        </button>
        {videoBusy ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700"
            onClick={() => videoAbortRef.current?.abort()}
          >
            <Square className="h-4 w-4" />
            取消合成
          </button>
        ) : null}
      </section>
      {videoProgress ? (
        <p className="text-sm text-indigo-700">{videoProgress}</p>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">课件图片（按页编号）</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              文件名含页码即可：如 <code className="rounded bg-slate-100 px-1">01.png</code>、
              <code className="rounded bg-slate-100 px-1">page-12.jpg</code>、
              <code className="rounded bg-slate-100 px-1">第3页.webp</code>
              。展示时长自动对齐该页音频。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={slideInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp"
              multiple
              className="hidden"
              onChange={(e) => {
                onUploadSlides(e.target.files)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              disabled={!pages.length || videoBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              onClick={() => slideInputRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              上传编号图片
            </button>
            {imageMatchedCount > 0 ? (
              <button
                type="button"
                disabled={videoBusy}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                onClick={clearPageImages}
              >
                清空图片
              </button>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-slate-500">
          图片已匹配 <b>{imageMatchedCount}</b>/{pages.length} · 可出成片（图+音齐全）{' '}
          <b>{videoReadyCount}</b>/{pages.length}
        </p>
        {imageMatchedCount > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pages.map((page) => {
              const img = pageImages[page.pageNo]
              const a = audios[page.pageNo]
              const dur =
                a?.status === 'done' && a.durationSec
                  ? a.durationSec
                  : estimateSpeechSec(page.script)
              return (
                <div
                  key={page.pageNo}
                  className="w-24 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50"
                >
                  {img ? (
                    <img src={img.previewUrl} alt="" className="h-16 w-full object-cover" />
                  ) : (
                    <div className="flex h-16 items-center justify-center text-[10px] text-slate-400">
                      缺图
                    </div>
                  )}
                  <div className="px-1.5 py-1 text-[10px] leading-tight text-slate-600">
                    <div className="font-semibold text-teal-700">P{page.pageNo}</div>
                    <div>{a?.status === 'done' ? `音 ${dur.toFixed(1)}s` : `估 ${dur.toFixed(1)}s`}</div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </section>

      {current ? (
        <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-lg">
          <div className="text-sm font-medium tracking-wide text-teal-300">导播中 · 请翻 PPT 到本页</div>
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
            const img = pageImages[page.pageNo]
            const previewing = pagePreviewBusy === page.pageNo
            const audioSec =
              a?.status === 'done' && a.durationSec
                ? a.durationSec
                : estimateSpeechSec(page.script)
            return (
              <li key={page.pageNo} className="flex flex-col gap-3 p-4 md:flex-row md:items-start">
                <div className="flex w-28 shrink-0 flex-col gap-1">
                  <div className="text-sm font-bold text-teal-700">P{page.pageNo}</div>
                  {img ? (
                    <img
                      src={img.previewUrl}
                      alt=""
                      className="h-16 w-full rounded-lg object-cover ring-1 ring-slate-200"
                      title={img.fileName}
                    />
                  ) : (
                    <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-slate-200 text-[10px] text-slate-400">
                      未配图
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-medium text-slate-900">{page.title}</div>
                  <p className="line-clamp-3 text-xs leading-relaxed text-slate-600 md:text-sm">{page.script}</p>
                  <div className="text-[11px] text-slate-400">
                    {a?.status === 'done' ? (
                      <>
                        音频 {audioSec.toFixed(1)}s
                        {img ? ' · 成片本页同时长' : ' · 配图后可入成片'}
                      </>
                    ) : (
                      <>预估 ~{estimateSpeechSec(page.script)}s</>
                    )}
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
                    disabled={busyAll || previewing || !page.script.trim()}
                    className="inline-flex items-center gap-1 rounded-lg border border-teal-600/40 bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-50"
                    onClick={() => void playPage(page)}
                    title={a?.status === 'done' ? '播放已生成音频' : '即时合成试听（无需先生成）'}
                  >
                    {previewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    试听
                  </button>
                  <button
                    type="button"
                    disabled={!a?.blob}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                    onClick={() =>
                      a?.blob && downloadBlob(a.blob, `page-${String(page.pageNo).padStart(2, '0')}.mp3`)
                    }
                  >
                    <Download className="h-3 w-3" />
                    MP3
                  </button>
                </div>
              </li>
            )
          })}
          {!pages.length ? (
            <li className="p-8 text-center text-sm text-slate-500">粘贴或上传口播稿后点「AI 解析分页」</li>
          ) : null}
        </ul>
      </section>

      <aside className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <b className="text-slate-800">用法：</b>
        生成全部页音频后，上传与页码对应的课件图 →「生成录播视频并下载」（WebM，Chrome/Edge 最佳）。也可继续用 OBS
        导播录屏。
      </aside>
    </div>
  )
}
