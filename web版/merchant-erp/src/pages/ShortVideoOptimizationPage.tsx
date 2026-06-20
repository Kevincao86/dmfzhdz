import { Cloud, Download, FileText, Film, ImagePlus, Loader2, PauseCircle, Sparkles, Upload, Video, Wand2, X } from 'lucide-react'
import { ShortVideoIceBatchPanel } from '../components/ShortVideoIceBatchPanel'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import { concatVideoSegmentsToMp4 } from '../lib/concatVideoSegments'
import {
  VIDEO_ENGINE_LABEL_KLING,
  VIDEO_ENGINE_LABEL_SEEDANCE,
  SEEDANCE_SERVER_AUTO,
  SEEDANCE_AUTO_LABEL,
} from '../lib/shortVideoUiLabels'
import {
  downloadVideoUrlAsBlob,
  fetchVideoAiConfig,
  postLongformVideoPlan,
  formatVideoAiUserError,
  runShortVideoJobWithFailover,
  type LongformPlanMode,
  type VideoAiBackendConfig,
} from '../services/videoAiApi'
import { parseGuidanceDocumentFile } from '../lib/shortVideoGuidanceDoc'
import {
  optimizeShortVideoGuidancePrompt,
  productFocusPromptSuffix,
} from '../services/shortVideoGuidanceAi'

type MainPane = 'optimize' | 'generate' | 'cloud_batch'

type StoryFrameItem = {
  id: string
  file: File
  previewUrl: string
}

const STORY_FRAME_MAX = 20

function storyFrameFileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`
}
/** 模型1=千问，模型2=豆包/Seedance；额度不足时互备切换 */
type Engine = 'qwen' | 'seedance'
const POLL_MS_SD = 5000
const POLL_MAX_TRIES = 200
const LONGFORM_SEGMENT_SEC = 10

function readBlobVideoDurationSec(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    const u = URL.createObjectURL(blob)
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0
      URL.revokeObjectURL(u)
      resolve(d)
    }
    v.onerror = () => {
      URL.revokeObjectURL(u)
      resolve(0)
    }
    v.src = u
  })
}

async function formatLongformMergedHint(blobs: Blob[], final: Blob): Promise<string> {
  const measured = await readBlobVideoDurationSec(final)
  const approx = blobs.length * LONGFORM_SEGMENT_SEC
  const sec = measured > 0 ? Math.round(measured) : approx
  return `已合成约 ${sec} 秒长片，可预览下载。`
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

/** 从成片 Blob 截取接近结尾的一帧，供下一段图生视频衔接 */
async function extractVideoLastFramePureBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    const url = URL.createObjectURL(blob)
    video.src = url
    let settled = false
    const finalize = () => URL.revokeObjectURL(url)

    video.onloadedmetadata = () => {
      const dur = video.duration
      if (!Number.isFinite(dur) || dur <= 0) {
        if (!settled) {
          settled = true
          finalize()
          reject(new Error('无法读取视频时长'))
        }
        return
      }
      const seekTo = Math.max(0.05, dur - 0.12)

      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        void (async () => {
          try {
            const w = video.videoWidth
            const h = video.videoHeight
            if (!w || !h) throw new Error('无法读取视频画面尺寸')

            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('浏览器不支持画布导出')
            ctx.drawImage(video, 0, 0, w, h)
            const jpegBlob = await canvasToBlobJpeg(canvas)
            const pureBase64 = await blobToPureBase64(jpegBlob)
            if (!settled) {
              settled = true
              finalize()
              resolve(pureBase64)
            }
          } catch (e) {
            if (!settled) {
              settled = true
              finalize()
              reject(e instanceof Error ? e : new Error('截取尾帧失败'))
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
        reject(new Error('无法解码该视频片段'))
      }
    }
  })
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
  const [sdAspect, setSdAspect] = useState<'16:9' | '9:16' | '1:1'>('16:9')
  const [sdWatermark, setSdWatermark] = useState<'off' | 'on'>('off')

  const [longformEnabled, setLongformEnabled] = useState(false)
  const [longformSegmentCount, setLongformSegmentCount] = useState(6)
  const [plannerModel, setPlannerModel] = useState<'doubao' | 'qwen'>('doubao')

  const seedanceFlagsLine = useMemo(() => {
    const dur = longformEnabled ? String(LONGFORM_SEGMENT_SEC) : sdDurationSec
    return `--dur ${dur} --fps ${sdFps} --ratio ${sdAspect} --wm ${sdWatermark === 'on' ? 'true' : 'false'}`
  }, [longformEnabled, sdDurationSec, sdFps, sdAspect, sdWatermark])

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
      opts?: { resetCancel?: boolean },
    ) => {
      if (opts?.resetCancel !== false) cancelRef.current = false
      return runShortVideoJobWithFailover({
        engine,
        body: {
          prompt: body.prompt,
          flags: seedanceFlagsLine,
          images_base64: body.images_base64,
          /** 始终服务端按时长自动选模型，用户下拉选项不参与提交 */
          model: body.model ?? SEEDANCE_SERVER_AUTO,
        },
        poolModels: seedancePoolModels,
        shouldCancel: () => cancelRef.current,
        onProgress: (text) => setProgress(text),
        pollIntervalMs: POLL_MS_SD,
        pollMaxTries: POLL_MAX_TRIES,
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
    }
  }, [longformEnabled])

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
    const incoming = [...files].filter((f) => (f.type || '').toLowerCase().startsWith('image/'))
    if (!incoming.length) {
      setErr('请选择图片文件（jpg / png / webp）')
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
        next.push({
          id: `${k}-${next.length}-${Date.now()}`,
          file: f,
          previewUrl: URL.createObjectURL(f),
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
      setGenPrompt(text)
      setHint(`已从「${f.name}」解析执导文案，可继续 AI 优化或直接生成。`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '文档解析失败')
    } finally {
      setAuxBusy(false)
      if (genDocInputRef.current) genDocInputRef.current.value = ''
    }
  }

  const onOptimizeGuidancePrompt = async () => {
    setAuxBusy(true)
    setErr(null)
    try {
      const r = await optimizeShortVideoGuidancePrompt(genPrompt, {
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

  const runLongformOptimize = async () => {
    const p = optPrompt.trim()
    setProgress('正在生成分镜脚本…')
    cancelRef.current = false
    const plan = await postLongformVideoPlan({
      plannerModel,
      overallPrompt: p,
      segmentCount: longformSegmentCount,
      mode: 'optimize',
      negativeHint: undefined,
    })
    if (!plan.ok) {
      setErr(plan.message)
      return
    }
    const prompts = plan.prompts
    const blobs: Blob[] = []
    let prevBlob: Blob | null = null

    for (let i = 0; i < prompts.length; i++) {
      if (cancelRef.current) {
        setHint('已取消长视频生成。')
        return
      }
      setProgress(`长视频 ${i + 1}/${prompts.length} · 生成中…`)
      let frameB64: string
      if (i === 0) {
        frameB64 = framePureB64!.replace(/\s/g, '')
      } else {
        try {
          frameB64 = await extractVideoLastFramePureBase64(prevBlob!)
        } catch (e) {
          setErr(e instanceof Error ? e.message : '截取衔接帧失败')
          return
        }
      }
      const segPrompt = prompts[i]

      const r = await runShortVideo(
        {
          prompt: segPrompt,
          images_base64: [`data:image/jpeg;base64,${frameB64}`],
        },
        { resetCancel: false },
      )
      if (!r.ok) {
        setErr(formatVideoAiUserError(r.message))
        return
      }
      if (r.engineUsed) hintEngineSwitch(r.engineUsed)
      if (r.modelUsed) setHint((h) => h ?? `已使用视频模型：${r.modelUsed}`)
      const urlOut = r.videoUrl
      try {
        const blob = await downloadVideoUrlAsBlob(urlOut)
        blobs.push(blob)
        prevBlob = blob
      } catch (e) {
        setErr(e instanceof Error ? e.message : '下载片段失败')
        return
      }
    }

    if (cancelRef.current || blobs.length === 0) return
    setProgress('正在拼接成片…')
    try {
      const final = await concatVideoSegmentsToMp4(blobs)
      if (resultBlobRef.current) URL.revokeObjectURL(resultBlobRef.current)
      const u = URL.createObjectURL(final)
      resultBlobRef.current = u
      setResultUrl(u)
      setHint(await formatLongformMergedHint(blobs, final))
    } catch (e) {
      setErr(e instanceof Error ? e.message : '片段拼接失败，请重试或缩短段数。')
    }
  }

  const runLongformGenerate = async () => {
    const txt = genPrompt.trim()
    const imgs: string[] = []
    if (genMode === 'frames') {
      for (const item of storyFrames) {
        const f = item.file
        const b64 = await readImageFilePureBase64(f)
        imgs.push(`data:image/${f.type.toLowerCase() === 'image/png' ? 'png' : 'jpeg'};base64,${b64}`)
      }
    }

    const planMode: LongformPlanMode =
      genMode === 'text' ? 'generate_text' : 'generate_frames'

    const hasProduct = Boolean(productPureB64)
    const planPromptBase =
      txt ||
      (imgs.length ? `按 ${imgs.length} 张分镜参考图生成连贯营销短片` : '生成连贯短片')
    const planPrompt = appendProductFocusToPrompt(planPromptBase, hasProduct)

    setProgress('正在生成分镜脚本…')
    cancelRef.current = false
    const plan = await postLongformVideoPlan({
      plannerModel,
      overallPrompt: planPrompt,
      segmentCount: longformSegmentCount,
      mode: planMode,
    })
    if (!plan.ok) {
      setErr(plan.message)
      return
    }
    const prompts = plan.prompts
    const blobs: Blob[] = []
    let prevBlob: Blob | null = null

    for (let i = 0; i < prompts.length; i++) {
      if (cancelRef.current) {
        setHint('已取消长视频生成。')
        return
      }
      setProgress(`长视频 ${i + 1}/${prompts.length} · 生成中…`)
      const segPrompt = prompts[i]

      let images: string[] | undefined
      if (i === 0 && genMode === 'text') {
        images = productPureB64 ? [productImageDataUrl(productPureB64)] : undefined
      } else if (i === 0 && genMode === 'frames') {
        if (!imgs.length && !productPureB64) {
          setErr('分镜模式下至少需要一张示意画面或产品图。')
          return
        }
        const first: string[] = []
        if (productPureB64) first.push(productImageDataUrl(productPureB64))
        if (imgs.length) first.push(imgs[0]!)
        images = first
      } else {
        try {
          const b = await extractVideoLastFramePureBase64(prevBlob!)
          images = [`data:image/jpeg;base64,${b}`]
        } catch (e) {
          setErr(e instanceof Error ? e.message : '截取衔接帧失败')
          return
        }
      }

      const r = await runShortVideo(
        {
          prompt: segPrompt,
          images_base64: images,
        },
        { resetCancel: false },
      )
      if (!r.ok) {
        setErr(formatVideoAiUserError(r.message))
        return
      }
      if (r.engineUsed) hintEngineSwitch(r.engineUsed)
      const urlOut = r.videoUrl
      try {
        const blob = await downloadVideoUrlAsBlob(urlOut)
        blobs.push(blob)
        prevBlob = blob
      } catch (e) {
        setErr(e instanceof Error ? e.message : '下载片段失败')
        return
      }
    }

    if (cancelRef.current || blobs.length === 0) return
    setProgress('正在拼接成片…')
    try {
      const final = await concatVideoSegmentsToMp4(blobs)
      if (resultBlobRef.current) URL.revokeObjectURL(resultBlobRef.current)
      const u = URL.createObjectURL(final)
      resultBlobRef.current = u
      setResultUrl(u)
      setHint(await formatLongformMergedHint(blobs, final))
    } catch (e) {
      setErr(e instanceof Error ? e.message : '片段拼接失败，请重试或缩短段数。')
    }
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
      const r = await runShortVideo({
        prompt: p,
        images_base64: [`data:image/jpeg;base64,${framePureB64.replace(/\s/g, '')}`],
      })
      if (!r.ok) {
        setErr(formatVideoAiUserError(r.message))
        return
      }
      if (r.engineUsed) hintEngineSwitch(r.engineUsed)
      if (r.modelUsed) setHint(`已使用视频模型：${r.modelUsed}`)
      setResultUrl(r.videoUrl)
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
    const imgs: string[] = []
    if (genMode === 'frames') {
      for (const item of storyFrames) {
        const f = item.file
        const b64 = await readImageFilePureBase64(f)
        imgs.push(`data:image/${f.type.toLowerCase() === 'image/png' ? 'png' : 'jpeg'};base64,${b64}`)
      }
    }

    if (genMode === 'text' && !txt) {
      setErr('请用文字描述成片内容。')
      return
    }
    if (genMode === 'frames' && imgs.length === 0 && !txt) {
      setErr('请填写执导文案或上传至少一张分镜画面。')
      return
    }

    if (longformEnabled) {
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

    setBusy(true)
    setProgress('正在提交视频任务（额度不足将自动切换其它模型）…')
    try {
      const hasProduct = Boolean(productPureB64)
      const textBlock =
        genMode === 'text'
          ? appendProductFocusToPrompt(txt, hasProduct)
          : appendProductFocusToPrompt(
              txt || `连贯演绎 ${imgs.length || 1} 张示意画面构成的短片。`,
              hasProduct,
            )
      const shotsNote =
        genMode === 'frames' && imgs.length > 1 ? `（共 ${imgs.length} 张参考图，按顺序串联镜头）。` : ''
      const prompt =
        genMode === 'frames' && shotsNote && textBlock
          ? `${textBlock}\n${shotsNote}`
          : textBlock

      const imagePayload: string[] = []
      if (productPureB64) imagePayload.push(productImageDataUrl(productPureB64))
      if (genMode === 'frames' && imgs.length) imagePayload.push(...imgs)

      const r = await runShortVideo({
        prompt,
        images_base64: imagePayload.length ? imagePayload : undefined,
      })
      if (!r.ok) {
        setErr(formatVideoAiUserError(r.message))
        return
      }
      if (r.engineUsed) hintEngineSwitch(r.engineUsed)
      if (r.modelUsed) setHint(`已使用视频模型：${r.modelUsed}`)
      setResultUrl(r.videoUrl)
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
                由豆包或通义千问拆成 2～6 段连贯脚本；每段按所选时长（长视频默认 10 秒）生成，续帧段也会带上时长参数，最后在本地拼接成一条成片（首次加载拼接组件可能稍慢）。
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
                <span>片段数量</span>
                <select
                  value={longformSegmentCount}
                  onChange={(e) => setLongformSegmentCount(Number(e.target.value))}
                  disabled={busy}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                >
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} 段（约 {n * LONGFORM_SEGMENT_SEC} 秒）
                    </option>
                  ))}
                </select>
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
              <span className="text-sm font-medium text-zinc-800">执导文案（提示词）</span>
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
                  AI 优化文案
                </button>
              </div>
            </div>
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
                  <p className="text-sm font-medium text-zinc-800">分镜参考图（支持多图，按顺序串联镜头）</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    可一次多选，也可多次添加；最多 {STORY_FRAME_MAX} 张，已选 {storyFrames.length} 张
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={storyFrameInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
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
                    添加分镜图
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
                <p className="mt-2 text-sm text-zinc-700">拖拽图片到此处，或点击选择（可多选）</p>
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
                        aria-label={`移除第 ${idx + 1} 张分镜`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <img
                        src={item.previewUrl}
                        alt={`分镜 ${idx + 1}`}
                        className="aspect-video w-full object-cover"
                      />
                      <p className="truncate px-2 py-1 text-[10px] text-zinc-500" title={item.file.name}>
                        {item.file.name}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">尚未添加分镜图，上传后将按序号作为镜头参考。</p>
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
