import { Cloud, Download, FileText, Film, ImagePlus, Loader2, PauseCircle, Sparkles, Upload, Video, Wand2, X } from 'lucide-react'
import { ShortVideoIceBatchPanel } from '../components/ShortVideoIceBatchPanel'
import ShortVideoScriptTableEditor from '../components/ShortVideoScriptTableEditor'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import { concatVideoSegmentsToMp4 } from '../lib/concatVideoSegments'
import {
  finalizeShortVideoOutput,
  extractShortVideoNarrationScript,
  finalizeNarrationScript,
  sanitizePromptForVideoModel,
} from '../lib/shortVideoPostProcess'
import {
  VIDEO_ENGINE_LABEL_KLING,
  VIDEO_ENGINE_LABEL_SEEDANCE,
  SEEDANCE_SERVER_AUTO,
  SEEDANCE_AUTO_LABEL,
} from '../lib/shortVideoUiLabels'
import {
  concatVideoBlobsOnServer,
  concatVideoUrlsOnServer,
  downloadVideoUrlAsBlob,
  fetchVideoAiConfig,
  postLongformVideoPlan,
  postShortVideoNarrationExtract,
  postVideoLastFrameFromUrl,
  formatVideoAiUserError,
  isVideoModelHopableError,
  runShortVideoJobWithFailover,
  shouldFallbackVideoDurationToFiveSec,
  type LongformPlanMode,
  type VideoAiBackendConfig,
} from '../services/videoAiApi'
import { parseGuidanceDocumentFile } from '../lib/shortVideoGuidanceDoc'
import {
  optimizeShortVideoGuidancePrompt,
  planShortVideoScriptFromGuidance,
  productFocusPromptSuffix,
} from '../services/shortVideoGuidanceAi'
import { extractVideoLastFramePureBase64 } from '../lib/videoFrameUtils'
import {
  defaultScriptRows,
  isScriptRowsUsable,
  inferScriptSegmentCountFromText,
  parseScriptRowsFromPlainText,
  resizeScriptRows,
  scriptRowsHaveExplicitTimeRanges,
  scriptRowsToOverallPrompt,
  segmentCountFromTargetTotalSec,
  type ShortVideoScriptRow,
} from '../lib/shortVideoScriptTable'

type MainPane = 'optimize' | 'generate' | 'cloud_batch'

type StoryFrameItem = {
  id: string
  file: File
  previewUrl: string
  kind: 'image' | 'video'
}

const STORY_FRAME_MAX = 20

function storyFrameFileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`
}

function isStoryFrameVideoFile(f: File): boolean {
  const mime = (f.type || '').toLowerCase()
  const nameLow = (f.name || '').toLowerCase()
  return mime.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi)$/i.test(nameLow)
}

function isStoryFrameImageFile(f: File): boolean {
  const mime = (f.type || '').toLowerCase()
  const nameLow = (f.name || '').toLowerCase()
  return mime.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(nameLow)
}

function isStoryFrameMediaFile(f: File): boolean {
  return isStoryFrameImageFile(f) || isStoryFrameVideoFile(f)
}

async function storyFrameFileToImageDataUrl(f: File): Promise<string> {
  if (isStoryFrameVideoFile(f)) {
    const { pureBase64 } = await extractVideoFirstFrame(f)
    return `data:image/jpeg;base64,${pureBase64}`
  }
  const b64 = await readImageFilePureBase64(f)
  return `data:image/${f.type.toLowerCase() === 'image/png' ? 'png' : 'jpeg'};base64,${b64}`
}
/** 模型1=千问，模型2=豆包/Seedance；额度不足时互备切换 */
type Engine = 'qwen' | 'seedance'
const POLL_MS_SD = 5000
const LONGFORM_DEFAULT_SEGMENT_SEC = 10

const LONGFORM_MAX_SEGMENT_COUNT = 12

const LONGFORM_TARGET_TOTAL_OPTIONS = [15, 30, 45, 60] as const

function resolveGuidanceSegmentCount(
  draft: string,
  targetTotalSec: number,
  segmentSec: number,
): number {
  const parsed = parseScriptRowsFromPlainText(draft)
  if (parsed.length >= 2) return Math.min(LONGFORM_MAX_SEGMENT_COUNT, parsed.length)
  const inferred = inferScriptSegmentCountFromText(draft)
  if (inferred >= 2) return inferred
  return segmentCountFromTargetTotalSec(targetTotalSec, segmentSec)
}

function buildSeedanceFlagsLine(input: {
  durationSec: number
  fps: string
  aspect: string
  watermark: 'off' | 'on'
}): string {
  return `--dur ${input.durationSec} --fps ${input.fps} --ratio ${input.aspect} --wm ${input.watermark === 'on' ? 'true' : 'false'}`
}

async function formatLongformMergedHint(
  segmentCount: number,
  final: Blob,
  segmentSec: number,
  targetTotalSec?: number,
): Promise<string> {
  const measured = await readBlobVideoDurationSec(final)
  const approx = segmentCount * segmentSec
  const sec = measured > 0 ? Math.round(measured) : approx
  const target = targetTotalSec ?? approx
  const targetNote =
    Math.abs(sec - target) <= 3 ? '' : `（目标约 ${target} 秒，若偏短请检查 10 秒模型额度）`
  return `已合成约 ${sec} 秒长片（${segmentCount} 段 × ${segmentSec} 秒）${targetNote}，可预览下载。`
}

function readBlobVideoDurationSec(blob: Blob, timeoutMs = 12_000): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    const u = URL.createObjectURL(blob)
    let settled = false
    const finish = (d: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      URL.revokeObjectURL(u)
      v.removeAttribute('src')
      v.load()
      resolve(d)
    }
    const timer = setTimeout(() => finish(0), timeoutMs)
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0
      finish(d)
    }
    v.onerror = () => finish(0)
    v.src = u
  })
}

function readUrlVideoDurationSec(url: string, timeoutMs = 15_000): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    let settled = false
    const finish = (d: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      v.removeAttribute('src')
      v.load()
      resolve(d)
    }
    const timer = setTimeout(() => finish(0), timeoutMs)
    v.preload = 'metadata'
    v.crossOrigin = 'anonymous'
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0
      finish(d)
    }
    v.onerror = () => finish(0)
    v.src = url
  })
}

async function blobToPureBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const s = typeof fr.result === 'string' ? fr.result : ''
      const ix = s.indexOf('base64,')
      resolve(ix >= 0 ? s.slice(ix + 'base64,'.length) : s.replace(/\s/g, ''))
    }
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.readAsDataURL(blob)
  })
}

async function canvasToBlobJpeg(c: HTMLCanvasElement, q = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('无法导出画面'))
    }, 'image/jpeg', q)
  })
}

async function extractVideoFirstFrame(videoFile: File): Promise<{ pureBase64: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    const url = URL.createObjectURL(videoFile)
    video.src = url
    let settled = false
    const finalize = () => URL.revokeObjectURL(url)

    video.onloadeddata = () => {
      const seekTo = Number.isFinite(video.duration)
        ? Math.min(Math.max(video.duration * 0.03, 0.05), 0.42)
        : 0.05

      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        void (async () => {
          try {
            const w = video.videoWidth
            const h = video.videoHeight
            if (!w || !h) throw new Error('无法读取视频宽高（可能解码受限）')

            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('浏览器不支持画布导出')
            ctx.drawImage(video, 0, 0, w, h)
            const blob = await canvasToBlobJpeg(canvas)
            const pureBase64 = await blobToPureBase64(blob)
            if (!settled) {
              settled = true
              finalize()
              resolve({ pureBase64 })
            }
          } catch (e) {
            if (!settled) {
              settled = true
              finalize()
              reject(e instanceof Error ? e : new Error('截取帧失败'))
            }
          }
        })()
      }

      video.addEventListener('seeked', onSeeked)
      video.currentTime = seekTo
    }

    video.onerror = () => {
      if (!settled) {
        settled = true
        finalize()
        reject(new Error('无法在浏览器中预览该视频，请换用图片或常见 MP4 格式。'))
      }
    }
  })
}

async function readImageFilePureBase64(f: File): Promise<string> {
  return blobToPureBase64(f)
}

function productImageDataUrl(pureB64: string): string {
  const b = pureB64.replace(/\s/g, '')
  return b.startsWith('data:image') ? b : `data:image/jpeg;base64,${b}`
}

function appendProductFocusToPrompt(prompt: string, hasProductImage: boolean): string {
  const p = prompt.trim()
  if (!hasProductImage) return p
  const suffix = productFocusPromptSuffix()
  return p.includes('【产品呈现】') ? p : `${p}\n${suffix}`
}

async function resolveSegmentTailFrameBase64(
  prevVideoUrl: string | null,
  onProgress?: (msg: string) => void,
): Promise<string> {
  const url = String(prevVideoUrl || '').trim()
  if (!url) throw new Error('缺少上一段视频地址')

  const serverFrame = await postVideoLastFrameFromUrl(url, { onProgress })
  if (serverFrame.ok) return serverFrame.pureBase64

  onProgress?.(`服务端截帧失败（${serverFrame.message}），改为下载后本地截取…`)
  const blob = await downloadVideoUrlAsBlob(url, {
    maxAttempts: 3,
    onRetry: (attempt, maxAttempts, message) =>
      onProgress?.(`下载上一段成片… 重试 ${attempt}/${maxAttempts}（${message}）`),
  })
  onProgress?.('本地截取尾帧…')
  return extractVideoLastFramePureBase64(blob)
}

export default function ShortVideoOptimizationPage() {
  const [mainPane, setMainPane] = useState<MainPane>('optimize')
  const [engine, setEngine] = useState<Engine>('qwen')
  const [cfg, setCfg] = useState<VideoAiBackendConfig | null>(null)
  const [cfgLoaded, setCfgLoaded] = useState(false)

  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [optPrompt, setOptPrompt] = useState('')
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  /** 参考帧：JPEG/PNG/base64 payload；来自视频截取或图片读取 */
  const [framePureB64, setFramePureB64] = useState<string | null>(null)

  const [genMode, setGenMode] = useState<'text' | 'frames'>('text')
  const [genPrompt, setGenPrompt] = useState('')
  const [scriptRows, setScriptRows] = useState<ShortVideoScriptRow[]>(() =>
    defaultScriptRows(segmentCountFromTargetTotalSec(30, LONGFORM_DEFAULT_SEGMENT_SEC), LONGFORM_DEFAULT_SEGMENT_SEC),
  )
  const [storyFrames, setStoryFrames] = useState<StoryFrameItem[]>([])
  const [storyDropActive, setStoryDropActive] = useState(false)
  const [productPureB64, setProductPureB64] = useState<string | null>(null)
  const [productThumbUrl, setProductThumbUrl] = useState<string | null>(null)
  const [auxBusy, setAuxBusy] = useState(false)

  const genDocInputRef = useRef<HTMLInputElement>(null)
  const productImgInputRef = useRef<HTMLInputElement>(null)
  const storyFrameInputRef = useRef<HTMLInputElement>(null)
  const storyFramesRef = useRef(storyFrames)
  storyFramesRef.current = storyFrames

  const [sdModelEp, setSdModelEp] = useState('')
  /** 火山视频（Seedance）尾随参数，由下方选项拼接，与原先手写 `--dur …` 格式一致 */
  const [sdDurationSec, setSdDurationSec] = useState<'5' | '10'>('5')
  const [sdFps, setSdFps] = useState<'24' | '30'>('24')
  const [sdAspect, setSdAspect] = useState<'16:9' | '9:16' | '1:1'>('9:16')
  const [sdWatermark, setSdWatermark] = useState<'off' | 'on'>('off')

  const [longformEnabled, setLongformEnabled] = useState(false)
  const [longformTargetTotalSec, setLongformTargetTotalSec] = useState(30)
  const [longformSegmentSec, setLongformSegmentSec] = useState(LONGFORM_DEFAULT_SEGMENT_SEC)
  const [plannerModel, setPlannerModel] = useState<'doubao' | 'qwen'>('doubao')

  const longformSegmentCountEstimate = useMemo(
    () => segmentCountFromTargetTotalSec(longformTargetTotalSec, longformSegmentSec),
    [longformTargetTotalSec, longformSegmentSec],
  )

  const seedanceFlagsLine = useMemo(
    () =>
      buildSeedanceFlagsLine({
        durationSec: longformEnabled ? longformSegmentSec : Number(sdDurationSec),
        fps: sdFps,
        aspect: sdAspect,
        watermark: sdWatermark,
      }),
    [longformEnabled, longformSegmentSec, sdDurationSec, sdFps, sdAspect, sdWatermark],
  )

  const seedancePoolModels = useMemo(
    () => cfg?.arkVideoModels.map((m) => m.endpointId) ?? [],
    [cfg?.arkVideoModels],
  )

  const runShortVideo = useCallback(
    async (
      body: {
        prompt: string
        images_base64?: string[]
        model?: string
      },
      opts?: {
        resetCancel?: boolean
        flagsOverride?: string
        allowAutoHalveDuration?: boolean
        onProgress?: (text: string) => void
      },
    ) => {
      if (opts?.resetCancel !== false) cancelRef.current = false
      return runShortVideoJobWithFailover({
        engine,
        body: {
          prompt: sanitizePromptForVideoModel(body.prompt),
          flags: opts?.flagsOverride ?? seedanceFlagsLine,
          images_base64: body.images_base64,
          model: body.model ?? SEEDANCE_SERVER_AUTO,
        },
        poolModels: seedancePoolModels,
        shouldCancel: () => cancelRef.current,
        onProgress: opts?.onProgress ?? ((text) => setProgress(text)),
        pollIntervalMs: POLL_MS_SD,
        allowAutoHalveDuration: opts?.allowAutoHalveDuration,
      })
    },
    [engine, seedanceFlagsLine, seedancePoolModels],
  )

  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const cancelRef = useRef(false)
  const resultBlobRef = useRef<string | null>(null)

  useEffect(() => {
    cancelRef.current = false
    return () => {
      cancelRef.current = true
      if (resultBlobRef.current) {
        URL.revokeObjectURL(resultBlobRef.current)
        resultBlobRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    void fetchVideoAiConfig().then((c) => {
      setCfg(c)
      if (c?.arkVideoModels.length) {
        setSdModelEp(SEEDANCE_SERVER_AUTO)
      }
      setCfgLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (longformEnabled) {
      setSdDurationSec('10')
      setLongformSegmentSec(LONGFORM_DEFAULT_SEGMENT_SEC)
      setScriptRows((prev) =>
        resizeScriptRows(
          prev,
          segmentCountFromTargetTotalSec(longformTargetTotalSec, LONGFORM_DEFAULT_SEGMENT_SEC),
          LONGFORM_DEFAULT_SEGMENT_SEC,
        ),
      )
    }
  }, [longformEnabled])

  useEffect(() => {
    if (!longformEnabled) return
    setScriptRows((prev) =>
      resizeScriptRows(
        prev,
        segmentCountFromTargetTotalSec(longformTargetTotalSec, longformSegmentSec),
        longformSegmentSec,
      ),
    )
  }, [longformEnabled, longformTargetTotalSec, longformSegmentSec])

  const onLongformTargetTotalSecChange = (nextSec: number) => {
    setLongformTargetTotalSec(nextSec)
  }

  useEffect(() => {
    const lp = cfg?.longformPlanner
    if (!lp) return
    setPlannerModel((pm) => {
      if (pm === 'doubao' && !lp.doubao && lp.qwen) return 'qwen'
      if (pm === 'qwen' && !lp.qwen && lp.doubao) return 'doubao'
      return pm
    })
  }, [cfg?.longformPlanner])

  const revokeThumb = () => {
    if (thumbUrl?.startsWith('blob:')) URL.revokeObjectURL(thumbUrl)
  }

  const revokeStoryFrame = (item: StoryFrameItem) => {
    if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
  }

  const appendStoryFrames = (files: FileList | File[]) => {
    const incoming = [...files].filter(isStoryFrameMediaFile)
    if (!incoming.length) {
      setErr('请选择图片（jpg / png / webp）或视频（mp4 / mov / webm）')
      return
    }
    setStoryFrames((prev) => {
      const keys = new Set(prev.map((x) => storyFrameFileKey(x.file)))
      const next = [...prev]
      for (const f of incoming) {
        if (next.length >= STORY_FRAME_MAX) break
        const k = storyFrameFileKey(f)
        if (keys.has(k)) continue
        keys.add(k)
        const kind: StoryFrameItem['kind'] = isStoryFrameVideoFile(f) ? 'video' : 'image'
        next.push({
          id: `${k}-${next.length}-${Date.now()}`,
          file: f,
          previewUrl: URL.createObjectURL(f),
          kind,
        })
      }
      return next
    })
    setErr(null)
  }

  const removeStoryFrame = (id: string) => {
    setStoryFrames((prev) => {
      const item = prev.find((x) => x.id === id)
      if (item) revokeStoryFrame(item)
      return prev.filter((x) => x.id !== id)
    })
  }

  const clearStoryFrames = () => {
    setStoryFrames((prev) => {
      prev.forEach(revokeStoryFrame)
      return []
    })
  }

  const onStoryFrameInputChange = (files: FileList | null) => {
    if (files?.length) appendStoryFrames(files)
    if (storyFrameInputRef.current) storyFrameInputRef.current.value = ''
  }

  const revokeProductThumb = () => {
    if (productThumbUrl?.startsWith('blob:')) URL.revokeObjectURL(productThumbUrl)
  }

  const onPickProductImage = async (files: FileList | null) => {
    const f = files?.[0] ?? null
    if (!f) return
    if (!(f.type || '').toLowerCase().startsWith('image/')) {
      setErr('请选择 JPG / PNG / WebP 产品图')
      return
    }
    try {
      const b64 = await readImageFilePureBase64(f)
      revokeProductThumb()
      setProductPureB64(b64)
      setProductThumbUrl(URL.createObjectURL(f))
      setHint('已载入重点产品图，生成时镜头转到产品将参考此图保持清晰。')
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '产品图读取失败')
    }
  }

  const onPickGuidanceDoc = async (files: FileList | null) => {
    const f = files?.[0] ?? null
    if (!f) return
    setAuxBusy(true)
    setErr(null)
    try {
      const text = await parseGuidanceDocumentFile(f)
      const parsedRows = parseScriptRowsFromPlainText(text)
      const inferredCount = inferScriptSegmentCountFromText(text)
      if (longformEnabled && parsedRows.length >= 2) {
        setGenPrompt(text)
        const count = Math.max(parsedRows.length, inferredCount >= 2 ? inferredCount : parsedRows.length)
        setScriptRows(resizeScriptRows(parsedRows, count, longformSegmentSec))
        setHint(
          scriptRowsHaveExplicitTimeRanges(parsedRows)
            ? `已从「${f.name}」解析分镜表（${count} 段，含自定义时间段），请核对或继续 AI 规划。`
            : `已从「${f.name}」解析分镜表（${count} 行），请核对或继续 AI 规划。`,
        )
      } else if (longformEnabled) {
        setGenPrompt(text)
        setHint(`已从「${f.name}」载入指导文案，点击「AI 规划分镜」自动填入下方表格。`)
      } else {
        setGenPrompt(text)
        setHint(`已从「${f.name}」解析执导文案，可继续 AI 优化或直接生成。`)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '文档解析失败')
    } finally {
      setAuxBusy(false)
      if (genDocInputRef.current) genDocInputRef.current.value = ''
    }
  }

  const onOptimizeGuidancePrompt = async () => {
    if (longformEnabled) {
      const draft = genPrompt.trim()
      if (draft.length < 4) {
        setErr('请先输入或上传指导文案，再点击 AI 规划分镜。')
        return
      }
      setAuxBusy(true)
      setErr(null)
      setHint(null)
      const preParsed = parseScriptRowsFromPlainText(draft)
      const preCount = resolveGuidanceSegmentCount(draft, longformTargetTotalSec, longformSegmentSec)
      if (
        preParsed.length >= 2 &&
        scriptRowsHaveExplicitTimeRanges(preParsed) &&
        isScriptRowsUsable(preParsed)
      ) {
        const count = preParsed.length
        setScriptRows(resizeScriptRows(preParsed, count, longformSegmentSec))
        setHint(`已从指导文案解析 ${count} 段分镜（含自定义时间段），请核对后点击「开始生成短片」。`)
        setAuxBusy(false)
        return
      }
      setProgress('AI 正在根据指导文案规划分镜脚本…')
      try {
        const r = await planShortVideoScriptFromGuidance(draft, {
          targetTotalSec: longformTargetTotalSec,
          segmentSec: longformSegmentSec,
          plannerModel,
          mode: genMode === 'text' ? 'generate_text' : 'generate_frames',
          hasProductImage: Boolean(productPureB64),
          frameMode: genMode === 'frames',
        })
        if (!r.ok) {
          setErr(r.message)
          return
        }
        const nextCount = r.segmentCount
        setScriptRows(r.rows)
        setHint(
          scriptRowsHaveExplicitTimeRanges(r.rows) && preCount >= 2
            ? `已按指导文案中的 ${nextCount} 个时间段填入分镜，请核对后点击「开始生成短片」。`
            : 'AI 已根据指导文案规划分镜脚本，请核对表格后点击「开始生成短片」。',
        )
      } finally {
        setAuxBusy(false)
        setProgress(null)
      }
      return
    }

    const sourceText = genPrompt
    if (!sourceText.trim()) {
      setErr('请先输入执导文案。')
      return
    }
    setAuxBusy(true)
    setErr(null)
    try {
      const r = await optimizeShortVideoGuidancePrompt(sourceText, {
        hasProductImage: Boolean(productPureB64),
        frameMode: genMode === 'frames',
      })
      if (!r.ok) {
        setErr(r.message)
        return
      }
      setGenPrompt(r.text)
      setHint('AI 已优化执导文案，请核对后点击「开始生成短片」。')
    } finally {
      setAuxBusy(false)
    }
  }

  const resetOutputs = () => {
    setErr(null)
    setHint(null)
    setProgress(null)
    if (resultBlobRef.current) {
      URL.revokeObjectURL(resultBlobRef.current)
      resultBlobRef.current = null
    }
    setResultUrl(null)
  }

  const onPickOptimizeMedia = async (files: FileList | null) => {
    resetOutputs()
    setFramePureB64(null)
    revokeThumb()
    setThumbUrl(null)
    const f = files?.[0] ?? null
    if (!f) return

    const mime = (f.type || '').toLowerCase()
    const nameLow = (f.name || '').toLowerCase()
    const extVid = /\.(mp4|webm|mov|m4v|avi)$/i.test(nameLow)

    try {
      if (mime.startsWith('video/') || (!mime && extVid)) {
        setHint('已从视频中截取一帧；也可直接上传图片作为参考。')
        const { pureBase64 } = await extractVideoFirstFrame(f)
        setFramePureB64(pureBase64)
        setThumbUrl(`data:image/jpeg;base64,${pureBase64}`)
      } else if (mime.startsWith('image/')) {
        setHint('已载入参考图像。')
        const b64 = await readImageFilePureBase64(f)
        setFramePureB64(b64)
        setThumbUrl(URL.createObjectURL(f))
      } else {
        setErr('请选择图片，或常见格式的视频文件。')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '文件解析失败')
    }
  }

  const validateEngine = (): string | null => {
    if (engine === 'qwen' && !cfg?.qwenVideoConfigured)
      return `当前环境未开通${VIDEO_ENGINE_LABEL_KLING}（通义千问视频），请在运营台配置 MERCHANT_AI_QWEN_KEY。`
    if (engine === 'seedance' && !cfg?.arkKeyConfigured)
      return `当前环境未开通${VIDEO_ENGINE_LABEL_SEEDANCE}，请联系管理员。`
    if (engine === 'seedance' && !sdModelEp.trim())
      return cfg?.arkVideoSetupIssue ?? '请先选择视频模型（需配置火山方舟真实 ep- 接入点）。'
    return null
  }

  const validateLongform = (): string | null => {
    if (!longformEnabled) return null
    if (isScriptRowsUsable(scriptRows)) return null
    const lp = cfg?.longformPlanner
    if (plannerModel === 'doubao' && !lp?.doubao)
      return '长片策划需配置豆包 API Key（系统设置 → AI 模型绑定，或与视频共用的火山 Key）。'
    if (plannerModel === 'qwen' && !lp?.qwen)
      return '长片策划需配置通义千问 API Key（系统设置 → AI 模型绑定）。'
    return null
  }

  const hintEngineSwitch = (used: 'qwen' | 'seedance') => {
    if (used === engine) return
    setHint(
      used === 'qwen'
        ? `${VIDEO_ENGINE_LABEL_KLING}（千问）额度不足，已自动切换${VIDEO_ENGINE_LABEL_SEEDANCE}…`
        : `${VIDEO_ENGINE_LABEL_SEEDANCE}额度不足，已自动切换${VIDEO_ENGINE_LABEL_KLING}（千问）…`,
    )
  }

  const resolveNarrationForFinalVideo = async (guidance: string, targetSec?: number): Promise<string> => {
    const g = guidance.trim()
    if (g.length < 8) return g
    const extracted = await postShortVideoNarrationExtract({
      overallPrompt: g,
      plannerModel,
    })
    const raw =
      extracted.ok && extracted.narrationScript.trim()
        ? extracted.narrationScript.trim()
        : extractShortVideoNarrationScript(g)
    return finalizeNarrationScript(raw, targetSec && targetSec > 0 ? targetSec : 30)
  }

  const restartLongformAfterHalve = async (input: {
    reason: string
    loadPlan: () => Promise<string[] | null>
    clearSegments: () => void
    resetIndex: () => void
  }): Promise<string[] | null> => {
    setHint(input.reason)
    setProgress('重新策划分镜脚本…')
    input.clearSegments()
    input.resetIndex()
    return input.loadPlan()
  }

  const commitFinalVideo = async (
    source: string | Blob,
    narrationSource: string,
    targetDurationSec?: number,
    opts?: { preferFullNarration?: boolean },
  ): Promise<boolean> => {
    const fin = await finalizeShortVideoOutput(source, narrationSource, (text) => setProgress(text), {
      targetDurationSec,
      preferFullNarration: opts?.preferFullNarration,
    })
    if (!fin.ok) {
      setErr(fin.message)
      return false
    }
    if (resultBlobRef.current) URL.revokeObjectURL(resultBlobRef.current)
    resultBlobRef.current = fin.objectUrl
    setResultUrl(fin.objectUrl)
    return true
  }

  const execLongformSegments = async (input: {
    fetchPlan: (
      targetTotalSec: number,
      segmentSec: number,
      segmentCountHint: number,
    ) => ReturnType<typeof postLongformVideoPlan>
    resolveImages: (i: number, prevVideoUrl: string | null) => Promise<string[] | undefined>
    narrationSource: string
  }) => {
    const targetTotalSec = longformTargetTotalSec
    let activeSegmentSec =
      longformSegmentSec >= 5 && longformSegmentSec <= 10 ? longformSegmentSec : LONGFORM_DEFAULT_SEGMENT_SEC
    const expectedSegSec =
      activeSegmentSec >= 10 ? Math.max(5, Math.round(activeSegmentSec * 0.72)) : activeSegmentSec
    let segmentCountHint = segmentCountFromTargetTotalSec(targetTotalSec, expectedSegSec)
    let halvedOnce = false
    let planNarrationScript = ''
    const segmentActualDurations: number[] = []

    const loadPlan = async () => {
      const plan = await input.fetchPlan(targetTotalSec, activeSegmentSec, segmentCountHint)
      if (!plan.ok) {
        setErr(plan.message)
        return null
      }
      if (plan.usedRuleBasedFallback) {
        setHint(
          `策划模型未返回标准分镜 JSON，已按执导文案自动拆成 ${plan.prompts.length} 段继续生成（不影响成片；如需更精细分镜可换策划模型后重试）。`,
        )
      }
      if (plan.narrationScript?.trim()) {
        planNarrationScript = plan.narrationScript.trim()
      }
      if (plan.prompts.length < segmentCountHint) {
        setHint(
          `分镜策划返回 ${plan.prompts.length} 段（约 ${targetTotalSec} 秒目标），将按 ${plan.prompts.length} 段生成。`,
        )
      }
      return plan.prompts
    }

    let prompts = await loadPlan()
    if (!prompts) return

    const segmentUrls: string[] = []
    let prevVideoUrl: string | null = null

    for (let i = 0; i < prompts.length; ) {
      if (cancelRef.current) {
        setHint('已取消长视频生成。')
        return
      }
      setProgress(`长视频 ${i + 1}/${prompts.length} · ${activeSegmentSec}秒 · 生成中…`)

      let images: string[] | undefined
      try {
        if (i > 0 && prevVideoUrl) {
          setProgress(`长视频 ${i + 1}/${prompts.length} · 截取上一段尾帧…`)
        }
        images = await input.resolveImages(i, prevVideoUrl)
      } catch (e) {
        setErr(e instanceof Error ? e.message : '准备参考图失败')
        return
      }

      const flags = buildSeedanceFlagsLine({
        durationSec: activeSegmentSec,
        fps: sdFps,
        aspect: sdAspect,
        watermark: sdWatermark,
      })

      const segmentPrompts = prompts
      const segmentProgress = (detail: string) =>
        setProgress(`长视频 ${i + 1}/${segmentPrompts.length} · ${activeSegmentSec}秒 · ${detail}`)

      segmentProgress('提交任务…')

      const r = await runShortVideo(
        { prompt: segmentPrompts[i]!, images_base64: images },
        {
          resetCancel: false,
          flagsOverride: flags,
          allowAutoHalveDuration: false,
          onProgress: segmentProgress,
        },
      )

      if (!r.ok) {
        if (
          !halvedOnce &&
          activeSegmentSec >= 10 &&
          shouldFallbackVideoDurationToFiveSec(r.message, activeSegmentSec, {
            exhaustedAtDuration: r.exhaustedAtDuration,
            triedCount: r.triedCount,
          })
        ) {
          halvedOnce = true
          activeSegmentSec = 5
          segmentCountHint = segmentCountFromTargetTotalSec(targetTotalSec, 5)
          setLongformSegmentSec(5)
          prompts =
            (await restartLongformAfterHalve({
              reason: `10秒模型额度已满，自动切换为 5秒 × ${segmentCountHint} 段（目标总时长约 ${targetTotalSec} 秒）…`,
              loadPlan,
              clearSegments: () => {
                prevVideoUrl = null
                segmentUrls.length = 0
                segmentActualDurations.length = 0
              },
              resetIndex: () => {
                i = 0
              },
            })) ?? null
          if (!prompts) return
          continue
        }
        const base = formatVideoAiUserError(r.message)
        if (halvedOnce && isVideoModelHopableError(r.message)) {
          setErr(
            `${base}（第 ${i + 1}/${prompts.length} 段，5 秒模型额度可能也已用尽；请充值火山/百炼账户，或减少长视频段数后重试）`,
          )
        } else {
          setErr(base)
        }
        return
      }

      if (r.engineUsed) hintEngineSwitch(r.engineUsed)
      if (r.modelUsed) setHint((h) => h ?? `已使用视频模型：${r.modelUsed}`)

      const videoUrl = String(r.videoUrl || '').trim()
      if (!videoUrl) {
        setErr(`第 ${i + 1}/${segmentPrompts.length} 段生成成功但未返回视频地址`)
        return
      }

      let actualSec = 0
      if (!halvedOnce && activeSegmentSec >= 10) {
        segmentProgress('校验片段时长…')
        actualSec = await readUrlVideoDurationSec(videoUrl)
        if (actualSec <= 0) {
          try {
            const probeBlob = await downloadVideoUrlAsBlob(videoUrl, {
              maxAttempts: 2,
              onRetry: (attempt, maxAttempts) =>
                segmentProgress(`校验时长… 重试 ${attempt}/${maxAttempts}`),
            })
            actualSec = await readBlobVideoDurationSec(probeBlob)
          } catch {
            /* 无法探测时长则继续，避免卡在下载 */
          }
        }
        if (actualSec > 0.3 && actualSec < activeSegmentSec * 0.85) {
          const prevSegSec = activeSegmentSec
          halvedOnce = true
          activeSegmentSec = 5
          segmentCountHint = segmentCountFromTargetTotalSec(targetTotalSec, 5)
          setLongformSegmentSec(5)
          prompts =
            (await restartLongformAfterHalve({
              reason: `检测到每段实际约 ${Math.round(actualSec)} 秒（非 ${prevSegSec} 秒），已切换为 5秒 × ${segmentCountHint} 段（目标总时长约 ${targetTotalSec} 秒）…`,
              loadPlan,
              clearSegments: () => {
                prevVideoUrl = null
                segmentUrls.length = 0
                segmentActualDurations.length = 0
              },
              resetIndex: () => {
                i = 0
              },
            })) ?? null
          if (!prompts) return
          continue
        }
      } else {
        actualSec = await readUrlVideoDurationSec(videoUrl)
      }

      segmentUrls.push(videoUrl)
      segmentActualDurations.push(
        actualSec > 0.3 ? actualSec : activeSegmentSec,
      )
      prevVideoUrl = videoUrl
      segmentProgress(`第 ${i + 1} 段完成`)
      i++
    }

    if (cancelRef.current || segmentUrls.length === 0) return
    setProgress(`正在云端拼接 ${segmentUrls.length} 段成片…`)
    try {
      let final: Blob
      try {
        final = await concatVideoUrlsOnServer(segmentUrls, { ratio: sdAspect, fps: sdFps })
      } catch (concatErr) {
        const concatMsg = concatErr instanceof Error ? concatErr.message : '云端拼接失败'
        setProgress(`云端拼接不可用（${concatMsg}），改为下载后本地拼接…`)
        const blobs: Blob[] = []
        for (let si = 0; si < segmentUrls.length; si++) {
          if (cancelRef.current) return
          setProgress(`下载片段 ${si + 1}/${segmentUrls.length}…`)
          blobs.push(
            await downloadVideoUrlAsBlob(segmentUrls[si]!, {
              onRetry: (attempt, maxAttempts) =>
                setProgress(`下载片段 ${si + 1}/${segmentUrls.length}… 重试 ${attempt}/${maxAttempts}`),
            }),
          )
        }
        try {
          final = await concatVideoBlobsOnServer(blobs, { ratio: sdAspect, fps: sdFps })
        } catch {
          final = await concatVideoSegmentsToMp4(blobs, { ratio: sdAspect, fps: sdFps })
        }
      }
      setProgress('合成口播配音与中文字幕…')
      const planNarr = planNarrationScript.trim()
      const narration = planNarr
        ? finalizeNarrationScript(planNarr, targetTotalSec)
        : await resolveNarrationForFinalVideo(input.narrationSource, targetTotalSec)
      const ok = await commitFinalVideo(final, narration, targetTotalSec, {
        preferFullNarration: true,
      })
      if (!ok) return
      setHint(
        await formatLongformMergedHint(segmentUrls.length, final, activeSegmentSec, targetTotalSec),
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : '片段拼接失败，请重试或缩短段数。')
    }
  }

  const runLongformOptimize = async () => {
    const p = optPrompt.trim()
    setProgress('正在生成分镜脚本…')
    cancelRef.current = false
    await execLongformSegments({
      fetchPlan: (targetTotalSec, segmentSec, segmentCountHint) =>
        postLongformVideoPlan({
          plannerModel,
          overallPrompt: p,
          targetTotalSec,
          segmentCount: segmentCountHint,
          segmentSec,
          mode: 'optimize',
          negativeHint: undefined,
        }),
      resolveImages: async (i, prevVideoUrl) => {
        if (i === 0) {
          return [`data:image/jpeg;base64,${framePureB64!.replace(/\s/g, '')}`]
        }
        const frameB64 = await resolveSegmentTailFrameBase64(prevVideoUrl, (msg) => setProgress(msg))
        return [`data:image/jpeg;base64,${frameB64}`]
      },
      narrationSource: p,
    })
  }

  const runLongformGenerate = async () => {
    const scriptUsable = isScriptRowsUsable(scriptRows)
    const txt = scriptUsable ? scriptRowsToOverallPrompt(scriptRows) : genPrompt.trim()
    const imgs: string[] = []
    if (genMode === 'frames') {
      for (const item of storyFrames) {
        imgs.push(await storyFrameFileToImageDataUrl(item.file))
      }
    }

    const planMode: LongformPlanMode =
      genMode === 'text' ? 'generate_text' : 'generate_frames'

    const hasProduct = Boolean(productPureB64)
    const planPromptBase =
      txt ||
      (imgs.length ? `按 ${imgs.length} 个分镜参考（图/视频）生成连贯营销短片` : '生成连贯短片')
    const planPrompt = appendProductFocusToPrompt(planPromptBase, hasProduct)

    setProgress('正在生成分镜脚本…')
    cancelRef.current = false
    await execLongformSegments({
      fetchPlan: (targetTotalSec, segmentSec, segmentCountHint) =>
        postLongformVideoPlan({
          plannerModel,
          overallPrompt: planPrompt,
          targetTotalSec,
          segmentCount: segmentCountHint,
          segmentSec,
          mode: planMode,
          scriptSegments: scriptUsable ? scriptRows : undefined,
        }),
      resolveImages: async (i, prevVideoUrl) => {
        if (i === 0 && genMode === 'text') {
          return productPureB64 ? [productImageDataUrl(productPureB64)] : undefined
        }
        if (i === 0 && genMode === 'frames') {
          if (!imgs.length && !productPureB64) {
            throw new Error('分镜模式下至少需要一张参考图/视频或产品图。')
          }
          const first: string[] = []
          if (productPureB64) first.push(productImageDataUrl(productPureB64))
          if (imgs.length) first.push(imgs[0]!)
          return first
        }
        if (genMode === 'frames' && i > 0 && i < imgs.length) {
          return [imgs[i]!]
        }
        const b = await resolveSegmentTailFrameBase64(prevVideoUrl, (msg) => setProgress(msg))
        return [`data:image/jpeg;base64,${b}`]
      },
      narrationSource:
        scriptUsable
          ? scriptRows
              .map((r) => r.dialogue.trim())
              .filter(Boolean)
              .join('。') || txt
          : txt || planPromptBase,
    })
  }

  const runSingleShortVideoWithDurationFallback = async (body: {
    prompt: string
    images_base64?: string[]
    model?: string
  }) => {
    const requestedDur = longformEnabled ? longformSegmentSec : Number(sdDurationSec)
    let r = await runShortVideo(body)
    if (
      !r.ok &&
      requestedDur >= 10 &&
      shouldFallbackVideoDurationToFiveSec(r.message, requestedDur, {
        exhaustedAtDuration: r.exhaustedAtDuration,
        triedCount: r.triedCount,
      })
    ) {
      setHint('10秒模型额度已满，自动切换为5秒视频模型…')
      setProgress('正在以 5 秒时长重新提交…')
      const flags5 = buildSeedanceFlagsLine({
        durationSec: 5,
        fps: sdFps,
        aspect: sdAspect,
        watermark: sdWatermark,
      })
      r = await runShortVideo(body, {
        flagsOverride: flags5,
        allowAutoHalveDuration: false,
      })
    }
    return r
  }

  const submitOptimize = async () => {
    resetOutputs()
    const vErr = validateEngine() ?? validateLongform()
    if (vErr) {
      setErr(vErr)
      return
    }
    const p = optPrompt.trim()
    if (!p) {
      setErr('请输入「希望如何改短视频」的描述。')
      return
    }
    if (!framePureB64) {
      setErr('请上传源视频（自动截帧）或一张参考图像。')
      return
    }

    if (longformEnabled) {
      setBusy(true)
      setProgress('排队中……')
      try {
        await runLongformOptimize()
      } finally {
        setBusy(false)
        setProgress(null)
      }
      return
    }

    setBusy(true)
    setProgress('正在提交视频任务（额度不足将自动切换其它模型）…')
    try {
      const r = await runSingleShortVideoWithDurationFallback({
        prompt: p,
        images_base64: [`data:image/jpeg;base64,${framePureB64.replace(/\s/g, '')}`],
      })
      if (!r.ok) {
        setErr(formatVideoAiUserError(r.message))
        return
      }
      if (r.engineUsed) hintEngineSwitch(r.engineUsed)
      if (r.modelUsed) setHint(`已使用视频模型：${r.modelUsed}`)
      setProgress('合成口播配音与中文字幕…')
      const narration = await resolveNarrationForFinalVideo(p, Number(sdDurationSec))
      const ok = await commitFinalVideo(r.videoUrl, narration, Number(sdDurationSec))
      if (!ok) return
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const submitGenerate = async () => {
    resetOutputs()
    const vErr = validateEngine() ?? validateLongform()
    if (vErr) {
      setErr(vErr)
      return
    }

    const txt = genPrompt.trim()
    const scriptUsable = longformEnabled && isScriptRowsUsable(scriptRows)
    const imgs: string[] = []
    if (genMode === 'frames') {
      for (const item of storyFrames) {
        imgs.push(await storyFrameFileToImageDataUrl(item.file))
      }
    }

    if (longformEnabled) {
      if (!scriptUsable && genMode === 'text') {
        setErr('请填写分镜表：至少 2 段，且每段填写画面或口播文案。')
        return
      }
      if (!scriptUsable && genMode === 'frames' && imgs.length === 0) {
        setErr('请填写分镜表，或上传至少一个分镜参考（图/视频）。')
        return
      }
      setBusy(true)
      setProgress('排队中……')
      try {
        await runLongformGenerate()
      } finally {
        setBusy(false)
        setProgress(null)
      }
      return
    }

    if (genMode === 'text' && !txt) {
      setErr('请用文字描述成片内容。')
      return
    }
    if (genMode === 'frames' && imgs.length === 0 && !txt) {
      setErr('请填写执导文案或上传至少一个分镜参考（图/视频）。')
      return
    }

    setBusy(true)
    setProgress('正在提交视频任务（额度不足将自动切换其它模型）…')
    try {
      const hasProduct = Boolean(productPureB64)
      const textBlock =
        genMode === 'text'
          ? appendProductFocusToPrompt(txt, hasProduct)
          : appendProductFocusToPrompt(
              txt || `连贯演绎 ${imgs.length || 1} 个分镜参考（图/视频）构成的短片。`,
              hasProduct,
            )
      const shotsNote =
        genMode === 'frames' && imgs.length > 1
          ? `（共 ${imgs.length} 个参考，图/视频按顺序串联镜头）。`
          : ''
      const prompt =
        genMode === 'frames' && shotsNote && textBlock
          ? `${textBlock}\n${shotsNote}`
          : textBlock

      const imagePayload: string[] = []
      if (productPureB64) imagePayload.push(productImageDataUrl(productPureB64))
      if (genMode === 'frames' && imgs.length) imagePayload.push(...imgs)

      const r = await runSingleShortVideoWithDurationFallback({
        prompt,
        images_base64: imagePayload.length ? imagePayload : undefined,
      })
      if (!r.ok) {
        setErr(formatVideoAiUserError(r.message))
        return
      }
      if (r.engineUsed) hintEngineSwitch(r.engineUsed)
      if (r.modelUsed) setHint(`已使用视频模型：${r.modelUsed}`)
      setProgress('合成口播配音与中文字幕…')
      const narrationSource = genMode === 'text' ? txt : txt || textBlock
      const narration = await resolveNarrationForFinalVideo(narrationSource, Number(sdDurationSec))
      const ok = await commitFinalVideo(r.videoUrl, narration, Number(sdDurationSec))
      if (!ok) return
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const cancelWait = () => {
    cancelRef.current = true
    setBusy(false)
    setProgress(null)
    setHint('已停止等待；后台任务可能不会自动取消。')
  }

  useEffect(() => {
    return () => {
      revokeThumb()
      revokeProductThumb()
      storyFramesRef.current.forEach(revokeStoryFrame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbUrl, productThumbUrl])

  return (
    <div
      className={cn(
        'short-video-page mx-auto px-4 py-8 lg:py-12',
        mainPane === 'cloud_batch' ? 'max-w-6xl' : 'max-w-4xl',
      )}
    >
      <header className="relative mb-10 space-y-2 pl-4">
        <span className="absolute left-0 top-2 h-10 w-1 rounded-full bg-gradient-to-b from-orange-500 to-cyan-500" aria-hidden />
        <div className="flex items-center gap-3">
          <Film className="h-8 w-8 shrink-0 text-orange-500" aria-hidden />
          <h1 className="erp-page-title text-[1.35rem] leading-tight sm:text-2xl">短视频AI处理</h1>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
          参考画面 AI 优化、文案生成短片，或批量云剪包装。先选择灵祺视频模型与参数，再上传素材并描述需求即可。
        </p>
      </header>

      <div className="erp-panel mb-8 flex overflow-hidden p-1">
        {(
          [
            { id: 'optimize' as const, label: '参考画面处理', icon: Video },
            { id: 'generate' as const, label: '短视频生成', icon: Sparkles },
            { id: 'cloud_batch' as const, label: '灵祺AI云剪', icon: Cloud },
          ] as const
        ).map((t) => {
          const Ico = t.icon
          const active = mainPane === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                resetOutputs()
                setMainPane(t.id)
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                active
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-zinc-50',
              )}
            >
              <Ico className="h-4 w-4 shrink-0" aria-hidden />
              {t.label}
            </button>
          )
        })}
      </div>

      {mainPane !== 'cloud_batch' ? (
      <section className="mb-10 rounded-xl border border-zinc-200 bg-zinc-50/60 px-5 py-4">
        <div className="flex flex-wrap gap-6">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
            <input
              type="radio"
              name="vid-engine"
              checked={engine === 'qwen'}
              onChange={() => setEngine('qwen')}
            />
            {VIDEO_ENGINE_LABEL_KLING}
            <span className="text-zinc-500">
              {cfgLoaded ? (cfg?.qwenVideoConfigured ? '· 千问可用' : '· 未开通') : '…'}
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
            <input
              type="radio"
              name="vid-engine"
              checked={engine === 'seedance'}
              onChange={() => setEngine('seedance')}
            />
            {VIDEO_ENGINE_LABEL_SEEDANCE}
            <span className="text-zinc-500">
              {cfgLoaded
                ? cfg?.arkKeyConfigured
                  ? (cfg?.arkVideoModels ?? []).length > 0
                    ? '· 可用'
                    : '· 待配置模型'
                  : '· 未开通'
                : '…'}
            </span>
          </label>
        </div>

        <div className="mt-4 rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-800">
            <input
              type="checkbox"
              className="mt-1"
              checked={longformEnabled}
              onChange={(e) => setLongformEnabled(e.target.checked)}
              disabled={busy}
            />
            <span>
              <span className="font-medium">长视频合成（最长约 60 秒）</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
                选择目标总时长后，由豆包或通义千问自动规划 2～12 段连贯分镜；每段默认 10 秒生成，若 10 秒模型额度用尽将自动降为 5 秒并加倍段数，总时长保持不变。
              </span>
            </span>
          </label>
          {longformEnabled ? (
            <div className="mt-3 flex flex-wrap items-end gap-4 border-t border-zinc-100 pt-3">
              <label className="flex flex-col gap-1 text-xs text-zinc-600">
                <span>分镜策划模型</span>
                <select
                  value={plannerModel}
                  onChange={(e) => setPlannerModel(e.target.value as 'doubao' | 'qwen')}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="doubao" disabled={cfgLoaded && !cfg?.longformPlanner?.doubao}>
                    豆包
                    {cfgLoaded && !cfg?.longformPlanner?.doubao ? '（未配置）' : ''}
                  </option>
                  <option value="qwen" disabled={cfgLoaded && !cfg?.longformPlanner?.qwen}>
                    通义千问
                    {cfgLoaded && !cfg?.longformPlanner?.qwen ? '（未配置）' : ''}
                  </option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-600">
                <span>目标总时长</span>
                <select
                  value={longformTargetTotalSec}
                  onChange={(e) => onLongformTargetTotalSecChange(Number(e.target.value))}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                >
                  {LONGFORM_TARGET_TOTAL_OPTIONS.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec} 秒
                    </option>
                  ))}
                </select>
                <span className="text-[11px] leading-snug text-zinc-500">
                  段数由 AI 自动规划（当前表格约 {longformSegmentCountEstimate} 段占位，点「AI 规划分镜」后按内容生成）
                </span>
              </label>
            </div>
          ) : null}
        </div>

        {engine === 'qwen' && (
          <div className="mt-4 space-y-4">
            <p className="text-xs leading-relaxed text-zinc-500">
              默认使用通义千问视频模型池；额度不足时自动切换{VIDEO_ENGINE_LABEL_SEEDANCE}（豆包/Seedance）。
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs text-zinc-600">
                <span>时长</span>
                <select
                  value={sdDurationSec}
                  onChange={(e) => setSdDurationSec(e.target.value as '5' | '10')}
                  disabled={busy || longformEnabled}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm disabled:opacity-60"
                >
                  <option value="5">5 秒</option>
                  <option value="10">10 秒</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-600">
                <span>帧率</span>
                <select
                  value={sdFps}
                  onChange={(e) => setSdFps(e.target.value as '24' | '30')}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="24">24 fps</option>
                  <option value="30">30 fps</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-600">
                <span>画面比例</span>
                <select
                  value={sdAspect}
                  onChange={(e) => setSdAspect(e.target.value as typeof sdAspect)}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="16:9">横屏 16:9</option>
                  <option value="9:16">竖屏 9:16</option>
                  <option value="1:1">方屏 1:1</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-600">
                <span>水印</span>
                <select
                  value={sdWatermark}
                  onChange={(e) => setSdWatermark(e.target.value as 'off' | 'on')}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="off">关闭</option>
                  <option value="on">开启</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {engine === 'seedance' && (
          <div className="mt-4 space-y-4">
            <p className="text-xs leading-relaxed text-zinc-500">
              豆包/Seedance 模型池；额度不足时自动切换{VIDEO_ENGINE_LABEL_KLING}（通义千问）。
            </p>
            <label className="flex flex-col gap-1 text-xs text-zinc-600">
              <span>视频模型</span>
              {(cfg?.arkVideoModels ?? []).length > 0 ? (
                <select
                  value={sdModelEp}
                  onChange={(e) => setSdModelEp(e.target.value)}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                >
                  <option value={SEEDANCE_SERVER_AUTO}>{SEEDANCE_AUTO_LABEL}</option>
                  {cfg!.arkVideoModels.map((row) => (
                    <option key={row.endpointId} value={row.endpointId}>
                      {row.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                  {cfg?.configLoadError
                    ? `无法加载视频配置（${cfg.configLoadError}）。请检查网络后刷新页面。`
                    : cfg?.arkVideoSetupIssue ??
                      '暂无可用模型。请在运营台填写 Seedance 1.5 Pro|doubao-seedance-1-5-pro-251215 或视频 ep- 接入点；勿使用 Doubao-Seed 对话模型的 ep。'}
                </div>
              )}
            </label>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs text-zinc-600">
                <span>时长</span>
                <select
                  value={sdDurationSec}
                  onChange={(e) => setSdDurationSec(e.target.value as '5' | '10')}
                  disabled={busy || longformEnabled}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm disabled:opacity-60"
                >
                  <option value="5">5 秒</option>
                  <option value="10">10 秒</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-600">
                <span>帧率</span>
                <select
                  value={sdFps}
                  onChange={(e) => setSdFps(e.target.value as '24' | '30')}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="24">24 fps</option>
                  <option value="30">30 fps</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-600">
                <span>画面比例</span>
                <select
                  value={sdAspect}
                  onChange={(e) => setSdAspect(e.target.value as typeof sdAspect)}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="16:9">横屏 16:9</option>
                  <option value="9:16">竖屏 9:16</option>
                  <option value="1:1">方屏 1:1</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-600">
                <span>画面水印</span>
                <select
                  value={sdWatermark}
                  onChange={(e) => setSdWatermark(e.target.value as 'off' | 'on')}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                >
                  <option value="off">无</option>
                  <option value="on">有</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </section>
      ) : null}

      <div className={mainPane === 'cloud_batch' ? undefined : 'hidden'} aria-hidden={mainPane !== 'cloud_batch'}>
        <ShortVideoIceBatchPanel lastResultUrl={resultUrl} />
      </div>

      {mainPane === 'optimize' && (
        <section className="space-y-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
              <Upload className="h-6 w-6" aria-hidden />
            </div>
            <div className="space-y-2">
              <div className="text-base font-medium text-zinc-900">来源素材</div>
              <div className="text-sm leading-relaxed text-zinc-600">
                可上传短视频（自动截取一帧）或商品图作为画面参考。
              </div>
            </div>
          </div>

          <label className="flex cursor-pointer flex-col items-center gap-4 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/60 px-4 py-14 text-center text-sm transition hover:border-orange-500">
            <Film className="h-11 w-11 text-orange-600" aria-hidden />
            <div>
              <div className="font-medium text-orange-950">拖拽或点击选取视频 / 图片</div>
              <div className="mt-2 text-[13px] text-orange-950/75">建议使用短于 120s 的镜头，以便快速截帧。</div>
            </div>
            <input
              accept="video/*,image/jpeg,image/png,image/webp"
              type="file"
              className="hidden"
              onChange={(e) => void onPickOptimizeMedia(e.target.files)}
            />
          </label>

          {thumbUrl ? (
            <div className="flex flex-wrap gap-6">
              <figure className="space-y-2">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <img
                  alt="参考预览"
                  src={thumbUrl}
                  className="max-h-64 max-w-[min(520px,calc(100vw-96px))] rounded-lg border border-zinc-200 object-contain"
                />
                <figcaption className="text-xs text-zinc-500">将作为画面参考参与生成。</figcaption>
              </figure>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">尚未选择素材。</p>
          )}

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-800">
              <Sparkles className="mr-1 inline h-4 w-4 text-orange-600" aria-hidden />
              希望如何改款 / 重写镜头
            </span>
            <textarea
              spellCheck={false}
              placeholder="示例：提亮餐厅灯光、加入更多人流、突出招牌字体、切换到竖屏观感……"
              className="min-h-[132px] w-full resize-y rounded-lg border border-zinc-300 px-4 py-3 text-sm outline-none ring-orange-600/35 focus-visible:ring-2"
              value={optPrompt}
              onChange={(e) => setOptPrompt(e.target.value)}
              disabled={busy}
            />
          </label>

          {(hint || err) && (
            <div
              className={cn(
                'rounded-lg px-4 py-3 text-sm leading-relaxed',
                err ? 'border border-red-200 bg-red-50 text-red-900' : 'border border-orange-100 bg-orange-50/80 text-orange-950',
              )}
              role={err ? 'alert' : undefined}
            >
              {err ?? hint}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submitOptimize()}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? (progress ?? '处理中……') : '提交优化'}
            </button>
            {busy ? (
              <button
                type="button"
                onClick={cancelWait}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-800 hover:bg-zinc-50"
              >
                <PauseCircle className="h-4 w-4" />
                停止等待
              </button>
            ) : null}
          </div>
        </section>
      )}

      {mainPane === 'generate' && (
        <section className="space-y-10 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                resetOutputs()
                setGenMode('text')
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition',
                genMode === 'text'
                  ? 'border-orange-600 bg-orange-50 text-orange-950'
                  : 'border-transparent bg-zinc-100 text-zinc-700 hover:bg-zinc-200',
              )}
            >
              <Sparkles className="h-4 w-4" />
              纯文案生成
            </button>
            <button
              type="button"
              onClick={() => {
                resetOutputs()
                setGenMode('frames')
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition',
                genMode === 'frames'
                  ? 'border-orange-600 bg-orange-50 text-orange-950'
                  : 'border-transparent bg-zinc-100 text-zinc-700 hover:bg-zinc-200',
              )}
            >
              <ImagePlus className="h-4 w-4" />
              分镜 / 多张参考图
            </button>
          </div>

          <label className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-800">
                {longformEnabled ? '指导文案' : '执导文案（提示词）'}
              </span>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={genDocInputRef}
                  type="file"
                  accept=".txt,.md,.doc,.docx,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => void onPickGuidanceDoc(e.target.files)}
                />
                <button
                  type="button"
                  disabled={busy || auxBusy}
                  onClick={() => genDocInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  <FileText className="h-3.5 w-3.5" />
                  上传 doc/txt
                </button>
                <button
                  type="button"
                  disabled={busy || auxBusy || !genPrompt.trim()}
                  onClick={() => void onOptimizeGuidancePrompt()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-900 hover:bg-orange-100 disabled:opacity-50"
                >
                  {auxBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {longformEnabled ? 'AI 规划分镜' : 'AI 优化文案'}
                </button>
              </div>
            </div>
            {longformEnabled ? (
              <>
                <textarea
                  spellCheck={false}
                  placeholder="输入商业创意、卖点、场景与叙事意图；可上传 Word/txt。点击下方「AI 规划分镜」自动拆成时间段、画面指令与口播文案。"
                  value={genPrompt}
                  disabled={busy || auxBusy}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  className="min-h-[112px] w-full resize-y rounded-lg border border-zinc-300 px-4 py-3 text-sm outline-none ring-orange-600/35 focus-visible:ring-2"
                />
                <p className="text-xs text-zinc-500">
                  指导文案为创作输入；规划完成后在下方分镜表中核对，生成时将严格按表执行。
                </p>
                <div className="mt-1 flex flex-col gap-2">
                  <span className="text-sm font-medium text-zinc-800">执导分镜脚本</span>
                  <ShortVideoScriptTableEditor
                    rows={scriptRows}
                    disabled={busy || auxBusy}
                    onChange={setScriptRows}
                  />
                  <p className="text-xs text-zinc-500">
                    段数由 AI 按目标总时长自动规划；规划完成后可直接编辑各段时间段、画面与口播。
                  </p>
                </div>
              </>
            ) : (
              <>
                <textarea
                  spellCheck={false}
                  placeholder={
                    genMode === 'text'
                      ? '描述画面节奏、光线、人物与氛围等；可上传 Word/txt 或点「AI 优化文案」。'
                      : '用文字说明各镜头顺序与动作；首张图会作为重要参考。'
                  }
                  value={genPrompt}
                  disabled={busy || auxBusy}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  className="min-h-[128px] w-full resize-y rounded-lg border border-zinc-300 px-4 py-3 text-sm outline-none ring-orange-600/35 focus-visible:ring-2"
                />
                <p className="text-xs text-zinc-500">
                  支持 .txt / .doc / .docx 指导文案自动填入；复杂旧版 .doc 建议另存为 .docx。
                </p>
              </>
            )}
          </label>

          <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-amber-950">重点突出产品图（选填）</p>
                <p className="mt-0.5 text-xs text-amber-900/80">
                  上传清晰产品图后，AI 在镜头转到产品时将参考此图，主体更清晰、细节更可辨。
                </p>
              </div>
              <input
                ref={productImgInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => void onPickProductImage(e.target.files)}
              />
              <button
                type="button"
                disabled={busy || auxBusy}
                onClick={() => productImgInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100/80 disabled:opacity-50"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {productPureB64 ? '更换产品图' : '上传产品图'}
              </button>
            </div>
            {productThumbUrl ? (
              <div className="flex items-start gap-3">
                <img
                  src={productThumbUrl}
                  alt="重点产品参考"
                  className="h-24 w-24 rounded-lg border border-amber-200 object-cover"
                />
                <button
                  type="button"
                  disabled={busy || auxBusy}
                  onClick={() => {
                    revokeProductThumb()
                    setProductPureB64(null)
                    setProductThumbUrl(null)
                  }}
                  className="text-xs text-amber-900/70 underline hover:text-amber-950"
                >
                  移除产品图
                </button>
              </div>
            ) : (
              <p className="text-xs text-amber-900/60">未上传产品图时按纯文案生成。</p>
            )}
          </div>

          {genMode === 'frames' && (
            <div className="space-y-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-zinc-800">分镜参考（图/视频，按顺序串联镜头）</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    可一次多选，也可多次添加；最多 {STORY_FRAME_MAX} 个，已选 {storyFrames.length} 个
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={storyFrameInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm,.m4v,.avi"
                    className="hidden"
                    disabled={busy || auxBusy}
                    onChange={(e) => onStoryFrameInputChange(e.target.files)}
                  />
                  <button
                    type="button"
                    disabled={busy || auxBusy || storyFrames.length >= STORY_FRAME_MAX}
                    onClick={() => storyFrameInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    添加参考
                  </button>
                  {storyFrames.length > 0 ? (
                    <button
                      type="button"
                      disabled={busy || auxBusy}
                      onClick={clearStoryFrames}
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                    >
                      清空
                    </button>
                  ) : null}
                </div>
              </div>

              <div
                role="presentation"
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!busy && !auxBusy) setStoryDropActive(true)
                }}
                onDragLeave={() => setStoryDropActive(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setStoryDropActive(false)
                  if (busy || auxBusy) return
                  if (e.dataTransfer.files?.length) appendStoryFrames(e.dataTransfer.files)
                }}
                onClick={() => {
                  if (!busy && !auxBusy) storyFrameInputRef.current?.click()
                }}
                className={cn(
                  'cursor-pointer rounded-lg border border-dashed px-4 py-6 text-center transition',
                  storyDropActive
                    ? 'border-orange-400 bg-orange-50/80'
                    : 'border-zinc-300 bg-white hover:border-zinc-400',
                )}
              >
                <Upload className="mx-auto h-6 w-6 text-zinc-400" />
                <p className="mt-2 text-sm text-zinc-700">拖拽图片或视频到此处，或点击选择（可多选）</p>
                <p className="mt-1 text-xs text-zinc-500">支持 jpg / png / webp / mp4 / mov / webm；视频将自动截取首帧作为参考</p>
              </div>

              {storyFrames.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {storyFrames.map((item, idx) => (
                    <div
                      key={item.id}
                      className="group relative overflow-hidden rounded-lg border border-zinc-200 bg-white"
                    >
                      <span className="absolute left-1.5 top-1.5 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {idx + 1}
                      </span>
                      <button
                        type="button"
                        disabled={busy || auxBusy}
                        onClick={(e) => {
                          e.stopPropagation()
                          removeStoryFrame(item.id)
                        }}
                        className="absolute right-1.5 top-1.5 z-10 rounded-full bg-black/55 p-0.5 text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-40"
                        aria-label={`移除第 ${idx + 1} 个分镜参考`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      {item.kind === 'video' ? (
                        <video
                          src={item.previewUrl}
                          muted
                          playsInline
                          preload="metadata"
                          className="aspect-video w-full object-cover"
                        />
                      ) : (
                        <img
                          src={item.previewUrl}
                          alt={`分镜 ${idx + 1}`}
                          className="aspect-video w-full object-cover"
                        />
                      )}
                      <p className="truncate px-2 py-1 text-[10px] text-zinc-500" title={item.file.name}>
                        {item.kind === 'video' ? '视频 · ' : ''}
                        {item.file.name}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">尚未添加分镜参考，上传后将按序号作为镜头参考。</p>
              )}
            </div>
          )}

          {(hint || err) && (
            <div
              className={cn(
                'rounded-lg px-4 py-3 text-sm',
                err ? 'border border-red-200 bg-red-50 text-red-900' : 'border border-amber-200 bg-amber-50 text-amber-950',
              )}
              role={err ? 'alert' : undefined}
            >
              {err ?? hint}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || auxBusy}
              onClick={() => void submitGenerate()}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? (progress ?? '处理中……') : '开始生成短片'}
            </button>
            {busy ? (
              <button
                type="button"
                onClick={cancelWait}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-800 hover:bg-zinc-50"
              >
                <PauseCircle className="h-4 w-4" /> 停止等待
              </button>
            ) : null}
          </div>
        </section>
      )}

      {resultUrl && (
        <section className="mt-12 rounded-xl border border-zinc-200 bg-zinc-900 p-8 text-white shadow-inner">
          <div className="mb-6 flex flex-wrap items-center gap-6">
            <h2 className="text-lg font-semibold">预览 & 下载</h2>
            <a href={resultUrl} download className={cn(buttonGhost, '!text-orange-400')}>
              <Download className="h-5 w-5" aria-hidden /> 浏览器下载链接
            </a>
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            controls
            src={resultUrl}
            className="w-full rounded-lg border border-zinc-800 bg-black"
          />
            <div className="mt-6 text-[13px] leading-relaxed text-zinc-300">
              下载链接可能有时效，请尽快保存到本地。
            </div>
        </section>
      )}

      <footer className="mt-12 border-t border-dashed border-zinc-200 pt-8 text-[13px] text-zinc-500">
        生成内容由 AI 提供，请合规使用并自行备份成片。
      </footer>
    </div>
  )
}

const buttonGhost =
  'inline-flex items-center gap-3 rounded-xl border border-orange-900/55 bg-transparent px-4 py-2 text-sm hover:bg-orange-950/70'
