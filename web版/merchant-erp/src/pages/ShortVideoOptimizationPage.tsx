import {
  Clapperboard,
  Cloud,
  Download,
  Eye,
  Film,
  Focus,
  LayoutGrid,
  Loader2,
  PauseCircle,
  Wand2,
  Wrench,
  X,
} from 'lucide-react'
import { ShortVideoIceBatchPanel } from '../components/ShortVideoIceBatchPanel'
import ShortVideoScriptTableEditor from '../components/ShortVideoScriptTableEditor'
import ShortVideoAgentCabin from '../components/ShortVideoAgentCabin'
import ShortVideoCaseGallery from '../components/ShortVideoCaseGallery'
import ShortVideoInfiniteCanvas from '../components/ShortVideoInfiniteCanvas'
import ShortVideoMusicStudio from '../components/ShortVideoMusicStudio'
import type { ShortVideoCaseItem } from '../lib/shortVideoCaseGallery'
import type { ShortVideoMusicTrack } from '../lib/shortVideoMusicLibrary'
import { findShortVideoSkill, type ShortVideoSkillId } from '../lib/shortVideoSkills'
import {
  findStudioMode,
  type ShortVideoStudioModeId,
} from '../lib/shortVideoStudioModes'
import { MpAddonPointsRateBadge } from '../components/MpAddonPointsRateBadge'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { readMpSessionToken } from '../lib/merchantApiAuth'
import { probeVideoDurationSec } from '../lib/digitalHumanSubtitle'
import {
  checkMpAddonPointsAffordable,
  formatMpAddonPointsSpendHint,
  spendMpAddonPoints,
} from '../services/mpAddonPointsSpendClient'
import { readMpEmbedAddonAccess } from '../lib/mpEmbedAddonAccess'
import { cn } from '../cn'
import {
  finishAiGenerationJob,
  findRunningAiGenerationJob,
  startAiGenerationJob,
  subscribeAiGenerationJobs,
  updateAiGenerationJob,
} from '../lib/aiGenerationJobs'
import { concatVideoSegmentsToMp4 } from '../lib/concatVideoSegments'
import {
  finalizeShortVideoOutput,
  extractShortVideoNarrationScript,
  finalizeNarrationScript,
  sanitizePromptForVideoModel,
  SHORT_VIDEO_MOTION_PROMPT_SUFFIX,
} from '../lib/shortVideoPostProcess'
import {
  VIDEO_ENGINE_LABEL_SEEDANCE,
  VIDEO_ENGINE_HINT_SEEDANCE,
  SEEDANCE_SERVER_AUTO,
  SEEDANCE_QUALITY_OPTIONS,
  type SeedanceQualityId,
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
  planShortVideoScriptFromGuidance,
} from '../services/shortVideoGuidanceAi'
import { extractVideoLastFramePureBase64 } from '../lib/videoFrameUtils'
import {
  defaultScriptRows,
  isScriptRowsUsable,
  inferScriptSegmentCountFromText,
  parseScriptRowsFromPlainText,
  resizeScriptRows,
  retimeScriptRowsBySegmentSec,
  appendEmptyScriptRow,
  removeScriptRowAt,
  maxScriptTimeRangeEndSec,
  scriptRowsHaveExplicitTimeRanges,
  scriptRowsToOverallPrompt,
  planLongformSegmentDurations,
  LONGFORM_SEGMENT_UNIT_SEC,
  planLongformAllFiveSecondDurations,
  pickLongformSegmentDurationSec,
  resizeScriptRowsForDurationPlan,
  resolveGuidanceScriptRowCount,
  ensureVideoPromptsForTargetDuration,
  videoPromptDurationSec,
  minSegmentCountForTargetDuration,
  type ShortVideoScriptRow,
} from '../lib/shortVideoScriptTable'

type MainPane = 'generate' | 'canvas' | 'cloud_batch' | 'cases' | 'music'

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
/** 短视频生成固定 Seedance */
const VIDEO_ENGINE = 'seedance' as const
const POLL_MS_SD = 5000
const LONGFORM_DEFAULT_SEGMENT_SEC = LONGFORM_SEGMENT_UNIT_SEC
const LONGFORM_DEFAULT_TARGET_TOTAL_SEC = 60
const LONGFORM_MAX_TARGET_TOTAL_SEC = 60

const LONGFORM_TARGET_TOTAL_OPTIONS = [60, 45, 30, 15] as const

/** 画布分镜总时长对齐到可选长片目标（15/30/45/60） */
function snapLongformTargetTotalSec(
  endSec: number,
  rowCount: number,
): (typeof LONGFORM_TARGET_TOTAL_OPTIONS)[number] {
  const approx =
    endSec > 0
      ? endSec
      : Math.max(LONGFORM_DEFAULT_SEGMENT_SEC, rowCount * LONGFORM_DEFAULT_SEGMENT_SEC)
  for (const opt of [...LONGFORM_TARGET_TOTAL_OPTIONS].reverse()) {
    if (approx <= opt) return opt
  }
  return LONGFORM_MAX_TARGET_TOTAL_SEC
}

const PLANNER_VENDOR_DISPLAY: Record<string, string> = {
  deepseek: 'DeepSeek',
  minimax: 'MiniMax',
  kimi: 'Kimi',
  openai: 'TokenMix · 灵犀',
  claude: 'TokenMix · 慧思',
  gemini: 'TokenMix · 星鉴',
  grok: 'TokenMix · 破界',
  qwen: '通义千问',
  doubao: '豆包',
}

function formatPlannerUsedLabel(vendor: string | undefined, modelId: string | undefined): string {
  if (!vendor) return '本地规则'
  const base = PLANNER_VENDOR_DISPLAY[vendor] ?? vendor
  return modelId ? `${base} · ${modelId}` : base
}

function resolveGuidanceSegmentCount(
  draft: string,
  targetTotalSec: number,
  segmentSec: number,
): number {
  return resolveGuidanceScriptRowCount(draft, targetTotalSec, segmentSec)
}

function buildSeedanceFlagsLine(input: {
  durationSec: number
  fps: string
  aspect: string
  watermark: 'off' | 'on'
  resolution: SeedanceQualityId
}): string {
  return `--dur ${input.durationSec} --fps ${input.fps} --ratio ${input.aspect} --wm ${input.watermark === 'on' ? 'true' : 'false'} --resolution ${input.resolution}`
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
    Math.abs(sec - target) <= 3 ? '' : `（目标约 ${target} 秒，若偏短请检查单段 15 秒额度）`
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

function withVideoMotionPrompt(prompt: string): string {
  const p = prompt.trim()
  /** 仅短视频页使用的观感约束，不改全局 SHORT_VIDEO_MOTION_PROMPT_SUFFIX（避免误伤数字人） */
  const lookSuffix =
    '【动作运镜】镜头持续平滑运动，主体有自然微动与景深变化，禁止静止硬切或单帧停留。' +
    '【观感】主光明确、主体清晰、色调统一；避免灰雾过曝死黑；前 2 秒须有动作或推镜钩子，禁止空镜与幻灯片感。'
  if (!p) return lookSuffix
  if (p.includes('【观感】')) {
    return p.includes('【动作运镜】') ? p : `${p}\n${SHORT_VIDEO_MOTION_PROMPT_SUFFIX}`
  }
  return p.includes('【动作运镜】') ? `${p}\n【观感】主光明确、主体清晰、色调统一；避免灰雾过曝死黑；前 2 秒须有动作或推镜钩子，禁止空镜与幻灯片感。` : `${p}\n${lookSuffix}`
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

export default function ShortVideoOptimizationPage({ embed = false }: { embed?: boolean }) {
  const navigate = useNavigate()
  const embedAddonAccess = useMemo(() => readMpEmbedAddonAccess(), [])
  const paneTabs = useMemo(() => {
    const all = [
      { id: 'generate' as const, label: '短片生成', icon: Clapperboard },
      { id: 'canvas' as const, label: '无限画布', icon: Focus },
      { id: 'cases' as const, label: '案例', icon: LayoutGrid },
      { id: 'cloud_batch' as const, label: 'AI混剪', icon: Cloud },
    ]
    if (!embedAddonAccess.embedMode) return all
    return all.filter((t) => {
      if (t.id === 'cloud_batch') return embedAddonAccess.cloudEdit
      if (t.id === 'cases' || t.id === 'canvas') return embedAddonAccess.shortvideo
      return embedAddonAccess.shortvideo
    })
  }, [embedAddonAccess])
  const [mainPane, setMainPane] = useState<MainPane>('generate')
  const [activeSkillId, setActiveSkillId] = useState<ShortVideoSkillId | null>(null)
  const [studioMode, setStudioMode] = useState<ShortVideoStudioModeId>('agent')
  const [selectedMusicTrackId, setSelectedMusicTrackId] = useState<string | null>(null)
  const [cfg, setCfg] = useState<VideoAiBackendConfig | null>(null)
  const [cfgLoaded, setCfgLoaded] = useState(false)

  useEffect(() => {
    if (!paneTabs.length) return
    // 音乐/配乐是独立 pane，不在快捷卡片里，勿被踢回 generate
    if (mainPane === 'music') return
    if (!paneTabs.some((t) => t.id === mainPane)) {
      setMainPane(paneTabs[0]!.id)
    }
  }, [paneTabs, mainPane])

  const embedBlocked = embedAddonAccess.embedMode && paneTabs.length === 0

  const [busy, setBusy] = useState(false)
  const [auxBusy, setAuxBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [genMode, setGenMode] = useState<'text' | 'frames'>('text')
  const [genPrompt, setGenPrompt] = useState('')
  const [scriptRows, setScriptRows] = useState<ShortVideoScriptRow[]>(() =>
    // 默认 2 段，不依赖「长视频」勾选；可随时「添加时间段」
    defaultScriptRows(2, 15),
  )
  const [storyFrames, setStoryFrames] = useState<StoryFrameItem[]>([])
  const generationBillIdRef = useRef('')

  const ensureShortVideoPointsAffordable = async (durationSec: number): Promise<boolean> => {
    const afford = await checkMpAddonPointsAffordable('shortvideo', durationSec)
    if (afford.ok) return true
    setErr(afford.message)
    return false
  }

  const chargeShortVideoPoints = async (
    blob: Blob,
    billId: string,
    fallbackSec?: number,
  ): Promise<string> => {
    let dur = Math.max(1, Math.ceil(Number(fallbackSec) || 1))
    try {
      const probed = await probeVideoDurationSec(blob)
      if (probed > 0.3) dur = Math.ceil(probed)
    } catch {
      /* use fallback */
    }
    try {
      const charge = await spendMpAddonPoints({
        kind: 'shortvideo',
        durationSec: dur,
        idempotencyKey: `shortvideo:${billId}`,
        note: `shortvideo:${billId}`,
      })
      if (!charge) return ''
      return formatMpAddonPointsSpendHint('shortvideo', charge, dur)
    } catch {
      return ''
    }
  }

  const genDocInputRef = useRef<HTMLInputElement>(null)
  const storyFrameInputRef = useRef<HTMLInputElement>(null)
  const storyFramesRef = useRef(storyFrames)
  storyFramesRef.current = storyFrames

  const [sdDurationSec, setSdDurationSec] = useState<'5' | '10' | '15'>('15')
  const [sdFps, setSdFps] = useState<'24' | '30'>('24')
  const [sdAspect, setSdAspect] = useState<'16:9' | '9:16' | '1:1'>('9:16')
  const [sdWatermark, setSdWatermark] = useState<'off' | 'on'>('off')
  const [sdResolution, setSdResolution] = useState<SeedanceQualityId>('1080p')

  const [longformEnabled, setLongformEnabled] = useState(false)
  const [longformTargetTotalSec, setLongformTargetTotalSec] = useState(15)
  const [longformSegmentSec, setLongformSegmentSec] = useState(LONGFORM_DEFAULT_SEGMENT_SEC)
  /** 画布「应用流程」后递增，通知画布把连线重置为新顺序 */
  const [canvasFlowEpoch, setCanvasFlowEpoch] = useState(0)

  /** 从短片模式打开长视频时，沿用用户已选的单段秒数，禁止静默抬到 60 */
  const enableLongformKeepingUserDuration = useCallback(
    (alreadyEnabled: boolean) => {
      if (!alreadyEnabled) {
        const sec = Number(sdDurationSec)
        const target = ([15, 30, 45, 60] as number[]).includes(sec) ? sec : 15
        setLongformTargetTotalSec(target)
        setLongformSegmentSec(Math.min(LONGFORM_DEFAULT_SEGMENT_SEC, Math.max(5, target)))
      }
      setLongformEnabled(true)
    },
    [sdDurationSec],
  )

  /** 画布分镜 → 短片生成：对齐文案；仅在已开长片或显式要求时才勾选长片（不强制） */
  const syncGenerateWorkspaceFromCanvas = useCallback(
    (rows: ShortVideoScriptRow[], opts?: { fillPrompt?: boolean; enableLongform?: boolean }) => {
      const end = maxScriptTimeRangeEndSec(rows)
      const target = snapLongformTargetTotalSec(end, rows.length)
      if (opts?.enableLongform) {
        setLongformEnabled(true)
        setLongformTargetTotalSec(target)
        setLongformSegmentSec(LONGFORM_DEFAULT_SEGMENT_SEC)
      } else if (longformEnabled) {
        setLongformTargetTotalSec(target)
        setLongformSegmentSec(LONGFORM_DEFAULT_SEGMENT_SEC)
      }
      if (opts?.fillPrompt && isScriptRowsUsable(rows)) {
        setGenPrompt((prev) => (prev.trim() ? prev : scriptRowsToOverallPrompt(rows)))
      }
    },
    [longformEnabled],
  )

  /** 当前新增分镜的默认段长：长片用分段方案，否则用所选单段时长 */
  const activeScriptSegmentSec = useMemo(() => {
    if (longformEnabled) {
      return Math.min(15, Math.max(5, longformSegmentSec || LONGFORM_DEFAULT_SEGMENT_SEC))
    }
    return Math.min(15, Math.max(5, Number(sdDurationSec) || 15))
  }, [longformEnabled, longformSegmentSec, sdDurationSec])

  const longformDurationPlan = useMemo(
    () =>
      longformSegmentSec <= 5 && longformEnabled
        ? planLongformAllFiveSecondDurations(longformTargetTotalSec)
        : planLongformSegmentDurations(longformTargetTotalSec),
    [longformEnabled, longformTargetTotalSec, longformSegmentSec],
  )

  const seedanceFlagsLine = useMemo(
    () =>
      buildSeedanceFlagsLine({
        durationSec: longformEnabled
          ? (longformDurationPlan[0] ?? longformSegmentSec)
          : Number(sdDurationSec),
        fps: sdFps,
        aspect: sdAspect,
        watermark: sdWatermark,
        resolution: sdResolution,
      }),
    [longformEnabled, longformDurationPlan, longformSegmentSec, sdDurationSec, sdFps, sdAspect, sdWatermark, sdResolution],
  )

  const seedancePoolModels = useMemo(() => {
    const raw = cfg?.arkVideoModels.map((m) => m.endpointId) ?? []
    // 短片台只用火山 Seedance 族；排除误配进方舟池的 wan / 千问模型
    return raw.filter((id) => {
      const t = String(id || '').trim()
      if (!t) return false
      if (/^wan[\d._-]/i.test(t) || /t2v|i2v/i.test(t) && /^wan/i.test(t)) return false
      if (/^wan2/i.test(t)) return false
      if (/^ep-/i.test(t)) return true
      return /seedance|seaweed|doubao-seed/i.test(t)
    })
  }, [cfg?.arkVideoModels])

  /** 生成前门禁：按钮禁用原因（避免可点但点击后无反馈或清空提示） */
  const generateGateReason = useMemo((): string | null => {
    if (busy) return '正在生成短片，请稍候…'
    if (auxBusy) return 'AI 正在处理，请稍候…'
    if (!cfgLoaded) return '正在加载视频引擎配置…'
    if (cfg?.configLoadError) {
      return `视频配置加载失败：${cfg.configLoadError.slice(0, 120)}`
    }
    if (!cfg?.arkKeyConfigured) {
      return `当前环境未开通${VIDEO_ENGINE_LABEL_SEEDANCE}，请在运营台配置火山方舟 Key 后再生成。`
    }
    if (!(cfg?.arkVideoModels?.length ?? 0)) {
      return '火山方舟已配置但未设置视频模型端点，请在运营台 · AI 模型中配置 Seedance 端点。'
    }
    if (longformEnabled || (isScriptRowsUsable(scriptRows) && scriptRows.length >= 2)) {
      if (genMode === 'text' && !isScriptRowsUsable(scriptRows)) {
        return '请先填写分镜表：至少 2 段，且每段填写画面或口播文案。'
      }
      if (genMode === 'frames' && !isScriptRowsUsable(scriptRows) && storyFrames.length === 0) {
        return '请填写分镜表，或上传至少一个分镜参考（图/视频）。'
      }
    } else if (genMode === 'text' && !genPrompt.trim()) {
      return '请用文字描述成片内容。'
    } else if (genMode === 'frames' && storyFrames.length === 0 && !genPrompt.trim()) {
      return '请填写执导文案或上传至少一个分镜参考（图/视频）。'
    }
    return null
  }, [
    busy,
    auxBusy,
    cfgLoaded,
    cfg,
    longformEnabled,
    genMode,
    scriptRows,
    storyFrames.length,
    genPrompt,
  ])

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
        engine: VIDEO_ENGINE,
        body: {
          prompt: sanitizePromptForVideoModel(body.prompt),
          flags: opts?.flagsOverride ?? seedanceFlagsLine,
          images_base64: body.images_base64,
          model: body.model ?? SEEDANCE_SERVER_AUTO,
          // 商家短片台写死 Seedance：禁止自动落到千问 wan*
          skip_qwen: true,
        },
        poolModels: seedancePoolModels,
        shouldCancel: () => cancelRef.current,
        onProgress: opts?.onProgress ?? ((text) => setProgress(text)),
        pollIntervalMs: POLL_MS_SD,
        allowAutoHalveDuration: opts?.allowAutoHalveDuration,
      })
    },
    [seedanceFlagsLine, seedancePoolModels],
  )

  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultPreviewOpen, setResultPreviewOpen] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  const cancelRef = useRef(false)
  const resultBlobRef = useRef<string | null>(null)
  const videoJobIdRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    if (findRunningAiGenerationJob('short_video')) setBusy(true)
    const unsub = subscribeAiGenerationJobs(() => {
      if (!mountedRef.current) return
      setBusy(!!findRunningAiGenerationJob('short_video'))
    })
    return () => {
      mountedRef.current = false
      unsub()
    }
  }, [])

  useEffect(() => {
    cancelRef.current = false
    return () => {
      // 切页不取消轮询：后台视频任务继续，仅释放本地预览 URL
      if (resultBlobRef.current) {
        URL.revokeObjectURL(resultBlobRef.current)
        resultBlobRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    void fetchVideoAiConfig().then((c) => {
      setCfg(c)
      setCfgLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (longformEnabled) {
      const plan = planLongformSegmentDurations(longformTargetTotalSec)
      setSdDurationSec('15')
      setLongformSegmentSec(Math.max(...plan))
      setScriptRows((prev) => resizeScriptRowsForDurationPlan(prev, plan))
    }
  }, [longformEnabled])

  useEffect(() => {
    if (!longformEnabled) return
    setScriptRows((prev) => resizeScriptRowsForDurationPlan(prev, longformDurationPlan))
  }, [longformEnabled, longformTargetTotalSec, longformDurationPlan])

  /** 未勾选长视频时：单段时长变更 → 分镜时间轴同步为 N×该秒数 */
  useEffect(() => {
    if (longformEnabled) return
    const seg = Math.min(15, Math.max(5, Number(sdDurationSec) || 15))
    setScriptRows((prev) => retimeScriptRowsBySegmentSec(prev, seg))
  }, [sdDurationSec, longformEnabled])

  const onLongformTargetTotalSecChange = (nextSec: number) => {
    setLongformTargetTotalSec(nextSec)
    const plan = planLongformSegmentDurations(nextSec)
    setLongformSegmentSec(Math.max(...plan))
    setScriptRows((prev) => resizeScriptRowsForDurationPlan(prev, plan))
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

  const onPickGuidanceDoc = async (files: FileList | null) => {
    const f = files?.[0] ?? null
    if (!f) return
    setAuxBusy(true)
    setErr(null)
    try {
      const text = await parseGuidanceDocumentFile(f)
      const parsedRows = parseScriptRowsFromPlainText(text)
      const inferredCount = inferScriptSegmentCountFromText(text)
      if (parsedRows.length >= 2) {
        setGenPrompt(text)
        const count = Math.max(parsedRows.length, inferredCount >= 2 ? inferredCount : parsedRows.length)
        setScriptRows(resizeScriptRows(parsedRows, count, activeScriptSegmentSec))
        setHint(
          scriptRowsHaveExplicitTimeRanges(parsedRows)
            ? `已从「${f.name}」解析分镜表（${count} 段，含自定义时间段），请核对或继续 AI 规划。`
            : `已从「${f.name}」解析分镜表（${count} 行），请核对或继续 AI 规划。`,
        )
      } else {
        setGenPrompt(text)
        setHint(`已从「${f.name}」载入指导文案，可点「AI 规划分镜」填入下方表格，或直接生成。`)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '文档解析失败')
    } finally {
      setAuxBusy(false)
      if (genDocInputRef.current) genDocInputRef.current.value = ''
    }
  }

  const onOptimizeGuidancePrompt = async () => {
    const draft = genPrompt.trim()
    if (draft.length < 4) {
      setErr('请先输入或上传指导文案，再点击 AI 规划分镜。')
      return
    }
    // 任意时长均可规划分镜，不要求勾选「长视频」
    const segmentSec = activeScriptSegmentSec
    const coveredNow = maxScriptTimeRangeEndSec(scriptRows)
    const targetTotalSec = longformEnabled
      ? longformTargetTotalSec
      : Math.min(
          LONGFORM_MAX_TARGET_TOTAL_SEC,
          Math.max(
            segmentSec * 2,
            coveredNow > 0 ? coveredNow : segmentSec * Math.max(2, scriptRows.length),
          ),
        )
    setAuxBusy(true)
    setErr(null)
    setHint(null)
    const preCount = resolveGuidanceSegmentCount(draft, targetTotalSec, segmentSec)
    setProgress('AI 模型 1 正在通读输入框指导文案并规划分镜…')
    try {
      const r = await planShortVideoScriptFromGuidance(draft, {
        targetTotalSec,
        segmentSec,
        plannerModel: 'auto',
        mode: genMode === 'text' ? 'generate_text' : 'generate_frames',
        hasProductImage: false,
        frameMode: genMode === 'frames',
        onProgress: (msg) => setProgress(msg),
      })
      if (!r.ok) {
        setErr(r.message)
        return
      }
      setScriptRows(r.rows)
      const covered = maxScriptTimeRangeEndSec(r.rows)
      const targetNote =
        targetTotalSec >= 10 && covered >= targetTotalSec - 2
          ? `，时间轴已覆盖约 0–${covered} 秒`
          : targetTotalSec >= 10 && covered > 0
            ? `（当前约 0–${covered} 秒，目标 ${targetTotalSec} 秒，请核对末段）`
            : ''
      const modelNote =
        r.reviewVendors?.length === 3
          ? `（三模型复核：${r.reviewVendors.join(' → ')}）`
          : r.usedAiPlanner
            ? `（模型：${formatPlannerUsedLabel(r.plannerVendor, r.plannerModelId)}）`
            : r.usedRuleBasedFallback
              ? '（AI 不可用，已降级为本地规则拆段，请更换模型后重试）'
              : ''
      setHint(
        scriptRowsHaveExplicitTimeRanges(r.rows) && preCount >= 2
          ? `三模型复核通过，已填满 ${r.rows.length} 段分镜${targetNote}${modelNote}，请核对后点击「开始生成短片」。`
          : `三模型复核通过，AI 已规划 ${r.rows.length} 段分镜${targetNote}${modelNote}，请核对表格后点击「开始生成短片」。`,
      )
    } finally {
      setAuxBusy(false)
      setProgress(null)
    }
  }

  const resetOutputs = () => {
    setErr(null)
    setHint(null)
    setProgress(null)
    setResultPreviewOpen(false)
    if (resultBlobRef.current) {
      URL.revokeObjectURL(resultBlobRef.current)
      resultBlobRef.current = null
    }
    setResultUrl(null)
  }

  const validateEngine = (): string | null => {
    if (!cfgLoaded) return '视频引擎配置加载中，请稍候再试。'
    if (cfg?.configLoadError) return `视频配置不可用：${cfg.configLoadError.slice(0, 160)}`
    if (!cfg?.arkKeyConfigured)
      return `当前环境未开通${VIDEO_ENGINE_LABEL_SEEDANCE}，请在运营台配置火山方舟 Key。`
    if (!(cfg?.arkVideoModels?.length ?? 0)) {
      return '火山方舟已配置但未设置视频模型端点，请在运营台配置 Seedance 端点。'
    }
    return null
  }

  const validateLongform = (): string | null => {
    if (!longformEnabled) return null
    if (isScriptRowsUsable(scriptRows)) return null
    if (cfgLoaded && cfg?.longformPlanner?.anyConfigured === false) {
      return '长片分镜策划需至少配置 DeepSeek / MiniMax / Kimi / TokenMix / 千问 / 豆包之一（运营台 · AI 模型）。'
    }
    return null
  }

  const resolveNarrationForFinalVideo = async (guidance: string, targetSec?: number): Promise<string> => {
    const g = guidance.trim()
    if (g.length < 8) return g
    const extracted = await postShortVideoNarrationExtract({
      overallPrompt: g,
      plannerModel: 'auto',
    })
    const raw =
      extracted.ok && extracted.narrationScript.trim()
        ? extracted.narrationScript.trim()
        : extractShortVideoNarrationScript(g)
    return finalizeNarrationScript(
      raw,
      targetSec && targetSec > 0 ? targetSec : LONGFORM_DEFAULT_TARGET_TOTAL_SEC,
    )
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
    opts?: {
      preferFullNarration?: boolean
      productImageBase64?: string
      productStartSec?: number
      productEndSec?: number
    },
  ): Promise<boolean> => {
    const fin = await finalizeShortVideoOutput(source, narrationSource, (text) => setProgress(text), {
      targetDurationSec,
      preferFullNarration: opts?.preferFullNarration,
      productImageBase64: opts?.productImageBase64,
      productStartSec: opts?.productStartSec,
      productEndSec: opts?.productEndSec,
    })
    if (!fin.ok) {
      setErr(fin.message)
      return false
    }
    if (resultBlobRef.current) URL.revokeObjectURL(resultBlobRef.current)
    resultBlobRef.current = fin.objectUrl
    setResultUrl(fin.objectUrl)
    setResultPreviewOpen(true)
    const billId = generationBillIdRef.current || `sv-${Date.now()}`
    const pointsHint = await chargeShortVideoPoints(fin.blob, billId, targetDurationSec)
    if (pointsHint) {
      setHint((prev) => [prev, pointsHint, '点击「预览生成结果」可再次查看成片。'].filter(Boolean).join(''))
    } else {
      setHint((prev) => [prev, '成片已就绪，可点击「预览生成结果」查看。'].filter(Boolean).join(''))
    }
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
    storyboardHintForSegment?: (index: number) => string | null
    /** 重点产品图 pure base64（自动抠图并在产品特写段挂载参考） */
    productPureB64?: string | null
    /** 非长视频合成勾选时（如多分镜自动分段）可覆盖目标总时长 */
    targetTotalSecOverride?: number
    /** 与 targetTotalSecOverride 配套，覆盖单段秒数 */
    segmentSecOverride?: number
  }) => {
    const targetTotalSec = input.targetTotalSecOverride ?? longformTargetTotalSec
    let activeSegmentSec =
      input.segmentSecOverride ??
      (longformSegmentSec >= 5 && longformSegmentSec <= 10 ? longformSegmentSec : LONGFORM_DEFAULT_SEGMENT_SEC)
    let segmentDurationPlan =
      activeSegmentSec <= 5
        ? planLongformAllFiveSecondDurations(targetTotalSec)
        : planLongformSegmentDurations(targetTotalSec)
    let segmentCountHint = segmentDurationPlan.length
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
      const minSegments = minSegmentCountForTargetDuration(targetTotalSec, activeSegmentSec)
      let promptsOut = ensureVideoPromptsForTargetDuration(
        plan.prompts,
        targetTotalSec,
        activeSegmentSec,
      )
      if (promptsOut.length > plan.prompts.length) {
        setHint(
          `分镜策划返回 ${plan.prompts.length} 段，已自动补至 ${promptsOut.length} 段以覆盖目标 ${targetTotalSec} 秒。`,
        )
      } else if (plan.prompts.length < minSegments) {
        setHint(
          `分镜策划返回 ${plan.prompts.length} 段（目标约 ${targetTotalSec} 秒），将按 ${promptsOut.length} 段生成。`,
        )
      }
      return promptsOut
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
      const planPrompts = prompts
      const segDur = videoPromptDurationSec(
        planPrompts[i]!,
        pickLongformSegmentDurationSec(
          segmentDurationPlan,
          i,
          targetTotalSec,
          segmentActualDurations.reduce((sum, d) => sum + d, 0),
        ),
      )
      setProgress(`长视频 ${i + 1}/${planPrompts.length} · ${segDur}秒 · 生成中…`)

      let images: string[] | undefined
      try {
        if (i > 0 && prevVideoUrl) {
          setProgress(`长视频 ${i + 1}/${planPrompts.length} · 截取上一段尾帧…`)
        }
        images = await input.resolveImages(i, prevVideoUrl)
      } catch (e) {
        setErr(e instanceof Error ? e.message : '准备参考图失败')
        return
      }

      const flags = buildSeedanceFlagsLine({
        durationSec: segDur,
        fps: sdFps,
        aspect: sdAspect,
        watermark: sdWatermark,
        resolution: sdResolution,
      })

      const segmentProgress = (detail: string) =>
        setProgress(`长视频 ${i + 1}/${planPrompts.length} · ${segDur}秒 · ${detail}`)

      segmentProgress('提交任务…')

      let segmentPrompt = withVideoMotionPrompt(planPrompts[i]!)
      if (input.storyboardHintForSegment) {
        const hint = input.storyboardHintForSegment(i)
        if (hint) segmentPrompt = `${segmentPrompt}\n${hint}`
      }

      const r = await runShortVideo(
        { prompt: segmentPrompt, images_base64: images },
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
          segDur >= LONGFORM_SEGMENT_UNIT_SEC &&
          shouldFallbackVideoDurationToFiveSec(r.message, segDur, {
            exhaustedAtDuration: r.exhaustedAtDuration,
            triedCount: r.triedCount,
          })
        ) {
          halvedOnce = true
          activeSegmentSec = 5
          segmentDurationPlan = planLongformAllFiveSecondDurations(targetTotalSec)
          segmentCountHint = segmentDurationPlan.length
          setLongformSegmentSec(5)
          prompts =
            (await restartLongformAfterHalve({
              reason: `15秒额度已满，自动切换为 5秒 × ${segmentCountHint} 段（目标总时长约 ${targetTotalSec} 秒）…`,
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

      if (r.modelUsed) setHint((h) => h ?? `已使用视频模型：${r.modelUsed}`)

      const videoUrl = String(r.videoUrl || '').trim()
      if (!videoUrl) {
        setErr(`第 ${i + 1}/${planPrompts.length} 段生成成功但未返回视频地址`)
        return
      }

      let actualSec = 0
      if (!halvedOnce && segDur >= 10) {
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
        if (actualSec > 0.3 && actualSec < segDur * 0.85) {
          const prevSegSec = segDur
          halvedOnce = true
          activeSegmentSec = 5
          segmentDurationPlan = planLongformAllFiveSecondDurations(targetTotalSec)
          segmentCountHint = segmentDurationPlan.length
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
        actualSec > 0.3 ? actualSec : segDur,
      )
      prevVideoUrl = videoUrl
      segmentProgress(`第 ${i + 1} 段完成`)
      i++
    }

    let estimatedTotalSec = segmentActualDurations.reduce((sum, d) => sum + d, 0)
    while (
      !cancelRef.current &&
      targetTotalSec >= 10 &&
      prevVideoUrl &&
      segmentUrls.length < 12 &&
      estimatedTotalSec < targetTotalSec - 2
    ) {
      const segIdx = segmentUrls.length
      const tailDur = pickLongformSegmentDurationSec(
        segmentDurationPlan,
        segIdx,
        targetTotalSec,
        estimatedTotalSec,
      )
      setProgress(
        `实际时长约 ${Math.round(estimatedTotalSec)} 秒，未达目标 ${targetTotalSec} 秒，追加衔接段 ${segIdx + 1}（${tailDur} 秒）…`,
      )
      const flags = buildSeedanceFlagsLine({
        durationSec: tailDur,
        fps: sdFps,
        aspect: sdAspect,
        watermark: sdWatermark,
        resolution: sdResolution,
      })
      const continuationPrompt = withVideoMotionPrompt(
        `承接上一段结尾画面，同一空间与主体连续运镜，补全至目标 ${targetTotalSec} 秒（衔接段 ${segIdx + 1}）。`,
      )
      let tailImages: string[] | undefined
      try {
        const b = await resolveSegmentTailFrameBase64(prevVideoUrl, (msg) => setProgress(msg))
        tailImages = [`data:image/jpeg;base64,${b}`]
      } catch (e) {
        setHint(
          `实际约 ${Math.round(estimatedTotalSec)} 秒，衔接段参考图失败，将按已生成 ${segmentUrls.length} 段拼接。`,
        )
        break
      }
      const extra = await runShortVideo(
        { prompt: continuationPrompt, images_base64: tailImages },
        {
          resetCancel: false,
          flagsOverride: flags,
          allowAutoHalveDuration: false,
          onProgress: (detail) =>
            setProgress(`衔接段 ${segIdx + 1} · ${activeSegmentSec}秒 · ${detail}`),
        },
      )
      if (!extra.ok) {
        setHint(
          `实际约 ${Math.round(estimatedTotalSec)} 秒，衔接段生成失败，将按已生成 ${segmentUrls.length} 段拼接。`,
        )
        break
      }
      const extraUrl = String(extra.videoUrl || '').trim()
      if (!extraUrl) break
      let extraSec = await readUrlVideoDurationSec(extraUrl)
      if (extraSec <= 0) extraSec = activeSegmentSec
      segmentUrls.push(extraUrl)
      segmentActualDurations.push(extraSec)
      prevVideoUrl = extraUrl
      estimatedTotalSec += extraSec
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

  const runLongformGenerate = async (opts?: {
    targetTotalSecOverride?: number
    segmentSecOverride?: number
  }) => {
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

    const planPromptBase =
      txt ||
      (imgs.length ? `按 ${imgs.length} 个分镜参考（图/视频）生成连贯营销短片` : '生成连贯短片')
    const planPrompt = planPromptBase

    setProgress('正在生成分镜脚本…')
    cancelRef.current = false
    await execLongformSegments({
      targetTotalSecOverride: opts?.targetTotalSecOverride,
      segmentSecOverride: opts?.segmentSecOverride,
      fetchPlan: (targetTotalSec, segmentSec, segmentCountHint) =>
        postLongformVideoPlan({
          plannerModel: 'auto',
          overallPrompt: planPrompt,
          targetTotalSec,
          segmentCount: segmentCountHint,
          segmentSec,
          mode: planMode,
          forceAiPlanner: scriptUsable ? false : undefined,
          scriptSegments: scriptUsable ? scriptRows : undefined,
        }),
      resolveImages: async (i, prevVideoUrl) => {
        if (i > 0 && prevVideoUrl) {
          const b = await resolveSegmentTailFrameBase64(prevVideoUrl, (msg) => setProgress(msg))
          return [`data:image/jpeg;base64,${b}`]
        }
        if (i === 0 && genMode === 'frames') {
          if (!imgs.length) return undefined
          return [imgs[0]!]
        }
        return undefined
      },
      storyboardHintForSegment: (i) => {
        if (genMode !== 'frames' || i <= 0 || i >= imgs.length) return null
        return `【分镜意向】构图可参考分镜参考 ${i + 1}，须从上一段尾帧自然运镜过渡，禁止静态切镜。`
      },
      narrationSource:
        scriptUsable
          ? scriptRows
              .map((r) => r.dialogue.trim())
              .filter((d) => d.length >= 2 && !/待填|^[-—–.]+$/.test(d))
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
      requestedDur >= LONGFORM_SEGMENT_UNIT_SEC &&
      shouldFallbackVideoDurationToFiveSec(r.message, requestedDur, {
        exhaustedAtDuration: r.exhaustedAtDuration,
        triedCount: r.triedCount,
      })
    ) {
      setHint('15秒额度已满，自动切换为5秒重新提交…')
      setProgress('正在以 5 秒时长重新提交…')
      const flags5 = buildSeedanceFlagsLine({
        durationSec: 5,
        fps: sdFps,
        aspect: sdAspect,
        watermark: sdWatermark,
        resolution: sdResolution,
      })
      r = await runShortVideo(body, {
        flagsOverride: flags5,
        allowAutoHalveDuration: false,
      })
    }
    return r
  }

  const submitGenerate = async () => {
    if (generateGateReason) {
      setErr(generateGateReason)
      return
    }
    if (findRunningAiGenerationJob('short_video')) {
      setErr('已有视频任务在后台生成中，请稍候或返回本页查看进度')
      return
    }
    setErr(null)
    setResultPreviewOpen(false)
    if (resultBlobRef.current) {
      URL.revokeObjectURL(resultBlobRef.current)
      resultBlobRef.current = null
    }
    setResultUrl(null)
    const vErr = validateEngine() ?? validateLongform()
    if (vErr) {
      setErr(vErr)
      return
    }
    generationBillIdRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sv-${Date.now()}`
    const estSec =
      longformEnabled || (isScriptRowsUsable(scriptRows) && scriptRows.length >= 2)
        ? longformEnabled
          ? longformTargetTotalSec
          : snapLongformTargetTotalSec(maxScriptTimeRangeEndSec(scriptRows), scriptRows.length)
        : genMode === 'frames' && storyFrames.length > 1
          ? Math.min(LONGFORM_MAX_TARGET_TOTAL_SEC, Math.max(15, storyFrames.length * Number(sdDurationSec)))
          : Number(sdDurationSec)
    if (!(await ensureShortVideoPointsAffordable(estSec))) return

    setHint(null)

    const videoJobId = startAiGenerationJob({
      kind: 'short_video',
      label: '短视频 AI 生成',
      route: '/ai-operation/video-check',
    })
    videoJobIdRef.current = videoJobId
    const trackProgress = (text: string) => {
      updateAiGenerationJob(videoJobId, { progress: text })
      if (mountedRef.current) setProgress(text)
    }
    const finishVideoJob = (ok: boolean, message?: string) => {
      finishAiGenerationJob(videoJobId, ok, message)
      videoJobIdRef.current = null
    }

    const txt = genPrompt.trim()
    // 画布已填可用分镜时，即使未勾选长片也走分段合成，避免闭环断裂
    const canvasScriptReady = isScriptRowsUsable(scriptRows) && scriptRows.length >= 2
    if (canvasScriptReady && !longformEnabled) {
      syncGenerateWorkspaceFromCanvas(scriptRows, { fillPrompt: true })
    }
    const useLongformPipeline = longformEnabled || canvasScriptReady
    const scriptUsable = useLongformPipeline && isScriptRowsUsable(scriptRows)
    const imgs: string[] = []
    if (genMode === 'frames') {
      for (const item of storyFrames) {
        imgs.push(await storyFrameFileToImageDataUrl(item.file))
      }
    }

    if (useLongformPipeline) {
      if (!scriptUsable && genMode === 'text') {
        finishVideoJob(false, '请填写分镜表')
        setErr('请填写分镜表：至少 2 段，且每段填写画面或口播文案。')
        return
      }
      if (!scriptUsable && genMode === 'frames' && imgs.length === 0) {
        finishVideoJob(false, '请填写分镜表或上传参考')
        setErr('请填写分镜表，或上传至少一个分镜参考（图/视频）。')
        return
      }
      setBusy(true)
      trackProgress('排队中……')
      cancelRef.current = false
      try {
        const end = maxScriptTimeRangeEndSec(scriptRows)
        const targetOverride = snapLongformTargetTotalSec(end, scriptRows.length)
        await runLongformGenerate({
          targetTotalSecOverride: longformEnabled ? undefined : targetOverride,
          segmentSecOverride: longformEnabled
            ? undefined
            : Math.min(15, Math.max(5, Number(sdDurationSec) || 15)),
        })
        finishVideoJob(!!resultBlobRef.current, cancelRef.current ? '已取消等待' : undefined)
      } finally {
        if (mountedRef.current) {
          setBusy(false)
          setProgress(null)
        }
      }
      return
    }

    if (genMode === 'text' && !txt) {
      finishVideoJob(false, '请填写描述')
      setErr('请用文字描述成片内容。')
      return
    }
    if (genMode === 'frames' && imgs.length === 0 && !txt) {
      finishVideoJob(false, '请填写文案或上传参考')
      setErr('请填写执导文案或上传至少一个分镜参考（图/视频）。')
      return
    }

    if (genMode === 'frames' && imgs.length > 1) {
      const targetTotalSec = Math.min(LONGFORM_MAX_TARGET_TOTAL_SEC, Math.max(15, imgs.length * Number(sdDurationSec)))
      const textBase = txt || `按 ${imgs.length} 个分镜参考生成连贯营销短片。`
      setHint(
        `检测到 ${imgs.length} 个分镜参考，将分段生成并以尾帧衔接（避免多图拼成幻灯片）；目标约 ${targetTotalSec} 秒。` +
          (longformEnabled ? '' : ' 如需更长成片，请勾选「长视频合成」并选择目标总时长。'),
      )
      setBusy(true)
      trackProgress('按分镜分段生成…')
      cancelRef.current = false
      try {
        await execLongformSegments({
          targetTotalSecOverride: targetTotalSec,
          segmentSecOverride: Number(sdDurationSec),
          fetchPlan: async () => ({
            ok: true as const,
            prompts: ensureVideoPromptsForTargetDuration(
              Array.from({ length: imgs.length }, (_, i) =>
                withVideoMotionPrompt(
                  `${textBase}\n【画面】第 ${i + 1}/${imgs.length} 段，与前后镜头自然衔接。`,
                ),
              ),
              targetTotalSec,
              Number(sdDurationSec),
            ),
          }),
          resolveImages: async (i, prevVideoUrl) => {
            if (i > 0 && prevVideoUrl) {
              const b = await resolveSegmentTailFrameBase64(prevVideoUrl, (msg) => trackProgress(msg))
              return [`data:image/jpeg;base64,${b}`]
            }
            return [imgs[i] ?? imgs[0]!]
          },
          storyboardHintForSegment: (i) => {
            if (i <= 0 || i >= imgs.length) return null
            return `【分镜意向】构图可参考分镜 ${i + 1}，须从上一段尾帧自然过渡，禁止静态切镜。`
          },
          narrationSource: txt || textBase,
        })
        finishVideoJob(!!resultBlobRef.current, cancelRef.current ? '已取消等待' : undefined)
      } finally {
        if (mountedRef.current) {
          setBusy(false)
          setProgress(null)
        }
      }
      return
    }

    setBusy(true)
    trackProgress('正在提交视频生成任务…')
    cancelRef.current = false
    try {
      const textBlock =
        genMode === 'text'
          ? txt
          : txt || `连贯演绎 ${imgs.length || 1} 个分镜参考（图/视频）构成的短片。`
      const shotsNote =
        genMode === 'frames' && imgs.length > 1
          ? `（共 ${imgs.length} 个参考，图/视频按顺序串联镜头）。`
          : ''
      const prompt = withVideoMotionPrompt(
        genMode === 'frames' && shotsNote && textBlock
          ? `${textBlock}\n${shotsNote}`
          : textBlock,
      )

      const imagePayload: string[] = []
      if (genMode === 'frames' && imgs.length) imagePayload.push(imgs[0]!)

      const r = await runSingleShortVideoWithDurationFallback({
        prompt,
        images_base64: imagePayload.length ? imagePayload : undefined,
      })
      if (!r.ok) {
        finishVideoJob(false, formatVideoAiUserError(r.message))
        setErr(formatVideoAiUserError(r.message))
        return
      }
      if (r.modelUsed) setHint(`已使用视频模型：${r.modelUsed}`)
      trackProgress('合成口播配音与中文字幕…')
      const narrationSource = genMode === 'text' ? txt : txt || textBlock
      const narration = await resolveNarrationForFinalVideo(narrationSource, Number(sdDurationSec))
      const dur = Number(sdDurationSec)
      const ok = await commitFinalVideo(r.videoUrl, narration, dur)
      finishVideoJob(ok, ok ? undefined : '成片合成失败')
      if (!ok) return
    } finally {
      if (mountedRef.current) {
        setBusy(false)
        setProgress(null)
      }
    }
  }

  const fieldSelectCls =
    'rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/25 disabled:opacity-60'

  const cancelWait = () => {
    cancelRef.current = true
    if (videoJobIdRef.current) {
      finishAiGenerationJob(videoJobIdRef.current, false, '已取消等待')
      videoJobIdRef.current = null
    }
    setBusy(false)
    setProgress(null)
    setHint('已停止等待；后台任务可能不会自动取消。')
  }

  const applyStudioCase = useCallback(
    (item: ShortVideoCaseItem) => {
      setErr(null)
      setGenPrompt(item.prompt)
      setActiveSkillId(item.skillId ?? null)
      setSdAspect(item.aspect)
      // 案例墙预览片约 5s；套用时默认短片 15s，避免被抬成 60s 长视频
      setLongformEnabled(false)
      setSdDurationSec('15')
      setMainPane('generate')
      setHint(`已套用案例「${item.title}」，可继续编辑参数后生成`)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const onStudioModeChange = (id: ShortVideoStudioModeId) => {
    setStudioMode(id)
    const mode = findStudioMode(id)
    if (mode.href) {
      setHint(`即将打开「${mode.label}」…`)
      navigate(mode.href)
      return
    }
    if (mode.pane) {
      resetOutputs()
      setMainPane(mode.pane)
      if (mode.pane === 'music') {
        setHint('已进入音乐/配乐工作区：按内容匹配试听并选用独立曲目')
      } else if (mode.pane === 'cloud_batch') {
        setHint('已切换到 AI混剪：多素材拼接与包装精修')
      } else if (mode.pane === 'canvas') {
        if (longformEnabled || isScriptRowsUsable(scriptRows)) {
          syncGenerateWorkspaceFromCanvas(scriptRows)
        }
        setHint('已进入无限画布：可拖拽路径连线编排分镜，应用流程后回写短片生成区')
      } else {
        setHint(`已切换到${mode.label}`)
      }
    }
  }

  const onAgentCabinSubmit = () => {
    const mode = findStudioMode(studioMode)
    if (mode.href) {
      navigate(mode.href)
      return
    }
    if (mode.pane === 'music') {
      setMainPane('music')
      setHint('已进入音乐/配乐工作区')
      return
    }
    if (mode.pane === 'cloud_batch') {
      resetOutputs()
      setMainPane('cloud_batch')
      setHint('已进入 AI混剪（多素材拼接包装）')
      return
    }
    if (mode.pane === 'canvas') {
      setMainPane('canvas')
      return
    }

    const skill = findShortVideoSkill(activeSkillId)
    if (skill) {
      // 只继承技能的画幅偏好；绝不因 preferLongform 强开长视频或抬高到 60 秒
      setSdAspect(skill.preferAspect)
    }

    // 已在短片生成区且有文案：主按钮直接触发生成（避免「点了没反应」）
    if (mainPane === 'generate' && genPrompt.trim()) {
      if (generateGateReason) {
        setErr(generateGateReason)
        setHint(null)
        queueMicrotask(() => {
          document
            .getElementById('sv-generate-workspace')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
        return
      }
      void submitGenerate()
      return
    }

    setMainPane('generate')
    setHint(
      longformEnabled
        ? `已进入短片生成工作区（长视频 ${longformTargetTotalSec} 秒），可点「AI 规划分镜」或「开始生成短片」`
        : `已进入短片生成工作区（单段 ${sdDurationSec} 秒），可直接编写/新增分镜，或点「AI 规划分镜」`,
    )
    queueMicrotask(() => {
      document
        .getElementById('sv-generate-workspace')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    // 有文案且分镜表尚未填满时自动规划（不要求勾选长视频）
    if (genPrompt.trim() && !isScriptRowsUsable(scriptRows)) {
      void onOptimizeGuidancePrompt()
    }
  }

  const cabinSubmitLabel = useMemo(() => {
    if (studioMode === 'image') return '打开视觉工坊'
    if (studioMode === 'digital_human') return '打开数字人'
    if (studioMode === 'music') return '打开配乐工作区'
    if (studioMode === 'canvas') return '打开无限画布'
    if (mainPane === 'generate' && genPrompt.trim()) return '开始生成短片'
    if (genPrompt.trim()) return '规划并进入生成'
    return '进入短片生成'
  }, [studioMode, mainPane, genPrompt])

  const goPane = (id: MainPane) => {
    resetOutputs()
    setMainPane(id)
    if (id === 'generate') {
      setStudioMode((m) => (m === 'agent' ? 'agent' : 'video'))
      // 仅当分镜已填写可用内容时对齐长片，避免空默认行误开 60 秒
      if (isScriptRowsUsable(scriptRows)) {
        syncGenerateWorkspaceFromCanvas(scriptRows)
      }
    }
    if (id === 'canvas') {
      setStudioMode('canvas')
      if (longformEnabled || isScriptRowsUsable(scriptRows)) {
        syncGenerateWorkspaceFromCanvas(scriptRows)
      }
    }
    if (id === 'music') setStudioMode('music')
    if (id === 'cloud_batch') setStudioMode('agent')
    if (id === 'cases') setStudioMode('agent')
  }

  const onSelectMusicTrack = (track: ShortVideoMusicTrack) => {
    setSelectedMusicTrackId(track.id)
    setHint(`已选用配乐「${track.title}」（${track.moods.join('·')}），可继续生成短片或去 AI混剪包装`)
  }

  const studioQuickEntries = [
    {
      id: 'canvas' as const,
      title: '无限画布',
      sub: '自由创作',
      icon: Focus,
      tone: 'from-sky-500 to-cyan-600',
    },
    {
      id: 'generate' as const,
      title: '短片生成',
      sub: 'Seedance 出片',
      icon: Clapperboard,
      tone: 'from-orange-500 to-rose-500',
    },
    {
      id: 'cases' as const,
      title: '技能案例',
      sub: '做同款灵感',
      icon: Wrench,
      tone: 'from-slate-700 to-slate-900',
    },
    {
      id: 'cloud_batch' as const,
      title: 'AI混剪',
      sub: '包装精修',
      icon: Cloud,
      tone: 'from-violet-500 to-indigo-600',
    },
  ].filter((e) => paneTabs.some((t) => t.id === e.id))

  useEffect(() => {
    return () => {
      storyFramesRef.current.forEach(revokeStoryFrame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={cn(
        'short-video-page sv-jimeng-studio mx-auto w-full min-w-0 max-w-6xl space-y-6 overflow-x-hidden',
        embed ? 'py-0' : 'py-2 sm:py-4',
      )}
    >
      {!embed ? (
      <header className="relative mb-8 space-y-2 text-center sm:mb-10">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Film className="h-8 w-8 shrink-0 text-cyan-600" aria-hidden />
          <h1 className="erp-page-title text-[1.35rem] leading-tight sm:text-2xl">短视频 AI 创作台</h1>
          <MpAddonPointsRateBadge kind="shortvideo" />
        </div>
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-slate-600">
          Skill 技能 · 无限画布 · 短片生成 · 音乐配乐 · 案例做同款。引擎为 Seedance；多素材拼接请切「AI混剪」。
          {readMpSessionToken() ? (
            <span className="mt-1 block text-xs text-cyan-800">
              星选账号：成片成功后按秒扣积分；套餐 ai_video_quota 次数优先，用尽后扣积分余额。
            </span>
          ) : null}
        </p>
        <p
          className="mx-auto max-w-2xl rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs leading-relaxed text-amber-900"
          role="note"
        >
          生成后请及时保存到本地。刷新页面后，本页生成记录将消失。
        </p>
      </header>
      ) : (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">短视频出片 · Agent 同屏</p>
          <MpAddonPointsRateBadge kind="shortvideo" />
        </div>
      )}

      {embedBlocked ? (
        <div className="surface-card rounded-xl border border-amber-200 bg-amber-50/80 p-6 text-sm text-amber-950">
          <p className="font-medium">短视频 AI 处理尚未开通</p>
          <p className="mt-2 text-amber-900/80">
            该增值能力需由灵祺运营在后台开通「短视频 AI 处理」或「灵祺 AI 云剪」后方可使用。如有合作意向请联系灵祺运营。
          </p>
        </div>
      ) : (
        <>
      {!embedBlocked ? (
        <div className="mb-6 w-full min-w-0 max-w-full">
          <input
            ref={genDocInputRef}
            type="file"
            accept=".txt,.md,.doc,.docx,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => void onPickGuidanceDoc(e.target.files)}
          />
          <ShortVideoAgentCabin
            value={genPrompt}
            skillId={activeSkillId}
            studioMode={studioMode}
            onStudioModeChange={onStudioModeChange}
            onSkillChange={(id) => {
              setActiveSkillId(id)
              const skill = findShortVideoSkill(id)
              // 切换技能只改画幅，不改动用户已选的时长 / 长视频开关
              if (skill) setSdAspect(skill.preferAspect)
            }}
            onChange={setGenPrompt}
            onSubmit={onAgentCabinSubmit}
            onPickDoc={() => genDocInputRef.current?.click()}
            disabled={busy}
            busy={auxBusy}
            submitLabel={cabinSubmitLabel}
          >
            {mainPane === 'generate' ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{VIDEO_ENGINE_LABEL_SEEDANCE}</p>
                    <p className="text-xs text-slate-500">
                      {cfgLoaded
                        ? cfg?.arkKeyConfigured
                          ? VIDEO_ENGINE_HINT_SEEDANCE
                          : '未开通火山方舟'
                        : '加载配置…'}
                      · 单段最长 15 秒 · 分镜表常驻，无需勾选长视频
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        resetOutputs()
                        setGenMode('text')
                      }}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-xs font-medium transition',
                        genMode === 'text'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
                      )}
                    >
                      纯文案
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetOutputs()
                        setGenMode('frames')
                      }}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-xs font-medium transition',
                        genMode === 'frames'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
                      )}
                    >
                      分镜参考图
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        syncGenerateWorkspaceFromCanvas(scriptRows)
                        setMainPane('canvas')
                        setHint('已在无限画布中查看分镜；连线后点「应用流程」可回写')
                      }}
                      className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                    >
                      画布
                    </button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-1 accent-cyan-600"
                    checked={longformEnabled}
                    onChange={(e) => {
                      if (e.target.checked) enableLongformKeepingUserDuration(longformEnabled)
                      else setLongformEnabled(false)
                    }}
                    disabled={busy}
                  />
                  <span>
                    <span className="font-medium">长视频合成（最长 {LONGFORM_MAX_TARGET_TOTAL_SEC} 秒）</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      可选：仅用于更长总时长。下方分镜表不勾选也可新增与编辑。
                    </span>
                  </span>
                </label>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {longformEnabled ? (
                    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                      <span>目标总时长</span>
                      <select
                        value={longformTargetTotalSec}
                        onChange={(e) => onLongformTargetTotalSecChange(Number(e.target.value))}
                        disabled={busy}
                        className={fieldSelectCls}
                      >
                        {LONGFORM_TARGET_TOTAL_OPTIONS.map((sec) => (
                          <option key={sec} value={sec}>
                            {sec} 秒
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                      <span>单段时长</span>
                      <select
                        value={sdDurationSec}
                        onChange={(e) => setSdDurationSec(e.target.value as '5' | '10' | '15')}
                        disabled={busy}
                        className={fieldSelectCls}
                      >
                        <option value="5">5 秒</option>
                        <option value="10">10 秒</option>
                        <option value="15">15 秒</option>
                      </select>
                      <span className="text-[11px] font-normal text-slate-500">
                        下方分镜每段上限 = {sdDurationSec} 秒
                      </span>
                    </label>
                  )}
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    <span>画面质量</span>
                    <select
                      value={sdResolution}
                      onChange={(e) => setSdResolution(e.target.value as SeedanceQualityId)}
                      disabled={busy}
                      className={fieldSelectCls}
                    >
                      {SEEDANCE_QUALITY_OPTIONS.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    <span>画面比例</span>
                    <select
                      value={sdAspect}
                      onChange={(e) => setSdAspect(e.target.value as typeof sdAspect)}
                      disabled={busy}
                      className={fieldSelectCls}
                    >
                      <option value="9:16">竖屏 9:16</option>
                      <option value="16:9">横屏 16:9</option>
                      <option value="1:1">方屏 1:1</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    <span>帧率</span>
                    <select
                      value={sdFps}
                      onChange={(e) => setSdFps(e.target.value as '24' | '30')}
                      disabled={busy}
                      className={fieldSelectCls}
                    >
                      <option value="24">24 fps</option>
                      <option value="30">30 fps</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    <span>水印</span>
                    <select
                      value={sdWatermark}
                      onChange={(e) => setSdWatermark(e.target.value as 'off' | 'on')}
                      disabled={busy}
                      className={fieldSelectCls}
                    >
                      <option value="off">无</option>
                      <option value="on">有</option>
                    </select>
                  </label>
                </div>

                <div id="sv-script-table-anchor" className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">执导分镜脚本</span>
                    <button
                      type="button"
                      disabled={busy || auxBusy || !genPrompt.trim()}
                      onClick={() => void onOptimizeGuidancePrompt()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-900 hover:bg-cyan-100 disabled:opacity-50"
                    >
                      {auxBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                      AI 规划分镜
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    与上方 Agent 文案同屏：不勾选长视频也可「添加时间段」；填好画面/口播后直接出片。
                  </p>
                  <ShortVideoScriptTableEditor
                    rows={scriptRows}
                    disabled={busy || auxBusy}
                    onChange={setScriptRows}
                    onAddRow={() =>
                      setScriptRows((prev) => appendEmptyScriptRow(prev, activeScriptSegmentSec))
                    }
                    onRemoveRow={(index) =>
                      setScriptRows((prev) => removeScriptRowAt(prev, index))
                    }
                  />
                </div>

                {genMode === 'frames' ? (
                  <div className="space-y-2 rounded-xl border border-dashed border-slate-300 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">
                        分镜参考（图/视频）· 已选 {storyFrames.length}/{STORY_FRAME_MAX}
                      </p>
                      <div className="flex gap-2">
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
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          添加参考
                        </button>
                        {storyFrames.length > 0 ? (
                          <button
                            type="button"
                            disabled={busy || auxBusy}
                            onClick={clearStoryFrames}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            清空
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {storyFrames.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {storyFrames.map((item, idx) => (
                          <div
                            key={item.id}
                            className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                          >
                            <span className="absolute left-1 top-1 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                              {idx + 1}
                            </span>
                            <button
                              type="button"
                              disabled={busy || auxBusy}
                              onClick={() => removeStoryFrame(item.id)}
                              className="absolute right-1 top-1 z-10 rounded-full bg-black/55 p-0.5 text-white opacity-0 group-hover:opacity-100 disabled:opacity-40"
                              aria-label={`移除第 ${idx + 1} 个参考`}
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
                                alt={`参考 ${idx + 1}`}
                                className="aspect-video w-full object-cover"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">可上传多张图/视频作镜头参考。</p>
                    )}
                  </div>
                ) : null}

                {(hint || err) && (
                  <div
                    className={cn(
                      'rounded-lg px-3 py-2.5 text-sm',
                      err
                        ? 'border border-red-200 bg-red-50 text-red-900'
                        : 'border border-amber-200 bg-amber-50 text-amber-950',
                    )}
                    role={err ? 'alert' : undefined}
                  >
                    {err ?? hint}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!!generateGateReason}
                      onClick={() => void submitGenerate()}
                      title={generateGateReason ?? undefined}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-700 to-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-cyan-900/15 hover:from-cyan-600 hover:to-sky-500 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {busy ? (progress ?? '处理中……') : '开始生成短片'}
                    </button>
                    <button
                      type="button"
                      disabled={!resultUrl || busy}
                      onClick={() => setResultPreviewOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-white px-4 py-2.5 text-sm font-semibold text-cyan-800 hover:bg-cyan-50 disabled:pointer-events-none disabled:opacity-45"
                    >
                      <Eye className="h-4 w-4" aria-hidden />
                      预览结果
                    </button>
                    {busy ? (
                      <button
                        type="button"
                        onClick={cancelWait}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                      >
                        <PauseCircle className="h-4 w-4" /> 停止等待
                      </button>
                    ) : null}
                  </div>
                  {generateGateReason && !err ? (
                    <p className="text-xs leading-relaxed text-amber-900">{generateGateReason}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </ShortVideoAgentCabin>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {studioQuickEntries.map((e) => {
          const Ico = e.icon
          const active = mainPane === e.id
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => goPane(e.id)}
              className={cn(
                'group flex items-center gap-3 rounded-2xl border bg-white/95 p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
                active ? 'border-cyan-300 ring-2 ring-cyan-500/20' : 'border-slate-200/90',
              )}
            >
              <span
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm',
                  e.tone,
                )}
              >
                <Ico className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{e.title}</span>
                <span className="block text-xs text-slate-500">{e.sub}</span>
              </span>
            </button>
          )
        })}
      </div>

      {mainPane === 'cases' ? (
        <ShortVideoCaseGallery onApplyCase={applyStudioCase} className="mb-8" />
      ) : null}

      {mainPane === 'music' ? (
        <ShortVideoMusicStudio
          className="mb-8"
          promptHint={genPrompt}
          disabled={busy || auxBusy}
          selectedTrackId={selectedMusicTrackId}
          onSelectTrack={onSelectMusicTrack}
        />
      ) : null}

      {mainPane === 'canvas' ? (
        <div className="mb-8 w-full space-y-4">
          <ShortVideoInfiniteCanvas
            scriptRows={scriptRows}
            media={storyFrames.map((f) => ({
              id: f.id,
              previewUrl: f.previewUrl,
              kind: f.kind,
              label: f.file.name,
            }))}
            flowEpoch={canvasFlowEpoch}
            disabled={busy || auxBusy}
            onAddMediaClick={() => {
              syncGenerateWorkspaceFromCanvas(scriptRows)
              setGenMode('frames')
              setMainPane('generate')
              setHint('已切到短片生成 · 分镜参考，请上传素材；也可再回「无限画布」查看节点')
              queueMicrotask(() => storyFrameInputRef.current?.click())
            }}
            onEditRow={(index) => {
              syncGenerateWorkspaceFromCanvas(scriptRows)
              setGenMode('text')
              setMainPane('generate')
              setHint(`正在编辑分镜 ${index + 1}：已同步到短片生成区的执导分镜脚本，请完善画面与口播`)
              queueMicrotask(() => {
                document
                  .getElementById('sv-script-table-anchor')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              })
            }}
            onApplyFlowOrder={(orderedIndices) => {
              if (orderedIndices.length < 2) return
              const orderLabel = orderedIndices.map((i) => i + 1).join('→')
              const seg = activeScriptSegmentSec
              setScriptRows((prev) => {
                const next = orderedIndices.map((i) => prev[i]).filter(Boolean) as typeof prev
                if (next.length < 2) return prev
                const resized = retimeScriptRowsBySegmentSec(next, seg)
                syncGenerateWorkspaceFromCanvas(resized, { fillPrompt: true })
                return resized
              })
              setCanvasFlowEpoch((v) => v + 1)
              setHint(
                `已按画布自由连线应用流程（${orderLabel}），分镜顺序已同步到短片生成区；可直接完善口播后生成`,
              )
              setMainPane('generate')
              queueMicrotask(() => {
                document
                  .getElementById('sv-script-table-anchor')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              })
            }}
            onRemoveScriptRow={(index) => {
              setScriptRows((prev) => removeScriptRowAt(prev, index))
              setHint(`已删除分镜 ${index + 1}`)
            }}
            onRemoveMedia={(id) => {
              removeStoryFrame(id)
              setHint('已删除画布参考素材')
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                syncGenerateWorkspaceFromCanvas(scriptRows, { fillPrompt: true })
                setMainPane('generate')
                setHint('已进入短片生成工作区：分镜表与画布节点已对齐（无需勾选长视频也可编辑分镜）')
                queueMicrotask(() => {
                  document
                    .getElementById('sv-generate-workspace')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                })
              }}
              className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-medium text-cyan-900 hover:bg-cyan-100"
            >
              去短片生成工作区
            </button>
            <button
              type="button"
              onClick={() => setMainPane('cases')}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              浏览案例做同款
            </button>
          </div>
        </div>
      ) : null}

      <div className={mainPane === 'cloud_batch' ? undefined : 'hidden'} aria-hidden={mainPane !== 'cloud_batch'}>
        <ShortVideoIceBatchPanel lastResultUrl={resultUrl} />
      </div>

      {mainPane === 'generate' ? (
        <div className="mt-10">
          <h2 className="mb-4 text-center text-lg font-semibold text-slate-900">灵感与案例</h2>
          <ShortVideoCaseGallery onApplyCase={applyStudioCase} />
        </div>
      ) : null}

      {resultPreviewOpen && resultUrl ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="预览生成结果"
          onClick={() => setResultPreviewOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3">
              <h2 className="text-base font-semibold">预览生成结果</h2>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={resultUrl}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-orange-800/60 px-3 py-1.5 text-xs text-orange-300 hover:bg-orange-950/50"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  下载成片
                </a>
                <button
                  type="button"
                  onClick={() => setResultPreviewOpen(false)}
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800"
                  aria-label="关闭预览"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video controls autoPlay src={resultUrl} className="max-h-[70vh] w-full bg-black" />
            <p className="px-5 py-3 text-[12px] leading-relaxed text-zinc-400">
              下载链接可能有时效，请尽快保存到本地。
            </p>
          </div>
        </div>
      ) : null}

      {!embed ? (
      <footer className="mt-12 border-t border-dashed border-zinc-200 pt-8 text-[13px] text-zinc-500">
        生成内容由 AI 提供，请合规使用并自行备份成片。
      </footer>
      ) : null}
        </>
      )}
    </div>
  )
}