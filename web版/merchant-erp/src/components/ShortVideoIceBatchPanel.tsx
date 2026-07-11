import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Download,
  ExternalLink,
  FileText,
  Film,
  ImagePlus,
  Loader2,
  ScanEye,
  Trash2,
  Upload,
  Wand2,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import {
  fetchIceExportPreviewUrl,
  iceExportDownloadPaths,
  iceJobDownloadProxyPath,
  downloadIceExportFile,
  fetchAliyunIceCloudConfig,
  fetchIceJobStatus,
  fetchIceSmartBatchJobStatus,
  ICE_ASPECT_PRESETS,
  postIcePipeline,
  postIceSmartBatch,
  uploadIceLocalMediaFile,
  type IceBatchJob,
  type AliyunIceCloudConfig,
} from '../services/aliyunIceCloudApi'
import { dispatchIceBatchToRecruitmentOps } from '../lib/iceRecruitmentDispatch'
import {
  readIceDispatchTrack,
  writeIceDispatchTrack,
} from '../lib/iceDispatchSlotProgress'
import { IceDispatchProgressPanel } from './IceDispatchProgressPanel'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { compressIceImageForUpload, ICE_LOCAL_IMAGE_MAX_BYTES } from '../lib/iceImageUploadCompress'
import { findInvalidIcePipelineImageUrl } from '../lib/icePipelineImageUrl'
import { snapshotUploadFiles, isUploadImageFile } from '../lib/iceUploadFileSnapshot'
import {
  ICE_IMAGE_UPLOAD_CONCURRENCY,
  ICE_VIDEO_UPLOAD_CONCURRENCY,
  runIceUploadPool,
} from '../lib/iceUploadPool'
import { MpAddonPointsRateBadge } from './MpAddonPointsRateBadge'
import { readMpSessionToken } from '../lib/merchantApiAuth'
import {
  checkMpAddonPointsAffordable,
  formatMpAddonPointsSpendHint,
  spendMpAddonPoints,
  type MpAddonGenerationKind,
} from '../services/mpAddonPointsSpendClient'
import { checkMixMaterialAnalyzeAffordable, spendMixMaterialAnalyzePoints } from '../services/mpAiPointsSpendClient'
import { validateIceMixMaterialUrl, sanitizeIceMixMaterialUrlForPipeline, prepareIceMixSegmentForPost } from '../lib/icePipelineImageUrl'
import { isIceTransientNetworkError } from '../lib/iceTransientNetworkError'
import ShortVideoScriptTableEditor from './ShortVideoScriptTableEditor'
import { parseGuidanceDocumentFile } from '../lib/shortVideoGuidanceDoc'
import { planShortVideoScriptFromGuidance } from '../services/shortVideoGuidanceAi'
import { analyzeIceMixMaterialsToGuidance } from '../services/iceMixGuidanceAi'
import { produceIceMixPackage, composeMixProductionBrief, type IceMixProduceOutput } from '../services/iceMixProduceEngine'
import type { IceMixMaterialProfile } from '../services/iceMixEditPlanAi'
import {
  assignFullMaterialCoverageSlots,
  expandMixRowsForMaterialPool,
  syncMixCoverageForAllMaterials,
  inferIceEffectIdFromMixContent,
  mixStoryboardBriefReady,
  MIX_TARGET_TOTAL_OPTIONS,
  normalizeMixMaterialSlots,
  resolveMixTotalDurationSec,
  type IceMixMaterialSlot,
} from '../lib/iceMixPlan'
import { resolveIceEffectPreset, ICE_MIX_TRANSITION_PRESETS } from '../lib/iceEffectPresets'
import {
  ICE_SUBTITLE_STYLE_DEFAULT_ID,
  ICE_SUBTITLE_STYLE_PRESETS,
  resolveIceSubtitleStylePreset,
} from '../lib/iceSubtitleStylePresets'
import {
  defaultScriptRows,
  maxScriptTimeRangeEndSec,
  parseScriptRowsFromPlainText,
  resizeScriptRows,
  segmentCountFromTargetTotalSec,
  type ShortVideoScriptRow,
} from '../lib/shortVideoScriptTable'

const MIX_DEFAULT_SEGMENT_SEC = 5
const POLL_MS = 5000
const POLL_MAX = 120

/** 每条素材批量生成的成片数量 */
export const ICE_BATCH_GENERATE_COUNTS = [10, 20, 50, 100] as const
export type IceBatchGenerateCount = (typeof ICE_BATCH_GENERATE_COUNTS)[number]

const PHASE_LABEL: Record<IceBatchJob['phase'], string> = {
  pending: '待提交',
  pipeline: '上传合成',
  polling: '云端剪辑',
  done: '可下载',
  failed: '失败',
}

/** 已上传 OSS、尚未点「一键混剪」的素材行 */
function isIceSourceMaterialJob(job: IceBatchJob): boolean {
  return job.phase === 'pending' && !job.exportId
}

function jobPhaseLabel(job: IceBatchJob): string {
  if (isIceSourceMaterialJob(job)) return '素材就绪'
  return PHASE_LABEL[job.phase]
}

function newJobId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function parseUrlLines(text: string): string[] {
  return text
    .split(/\n|,|;/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
}

const IMAGE_URL_RE = /\.(jpe?g|png|webp|gif|bmp|heic)(\?|#|$)/i

function parseImageUrlLines(text: string): string[] {
  return parseUrlLines(text).filter((s) => IMAGE_URL_RE.test(s) || /\/image\//i.test(s))
}

function isImageFile(file: File): boolean {
  return isUploadImageFile(file)
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name)
}

type IceImageItem = {
  id: string
  label: string
  /** 带签名，用于预览 */
  mediaUrl: string
  /** 无签名 OSS 直链，提交 ICE 合成用 */
  pipelineUrl?: string
  previewUrl?: string
}

function icePipelineImageUrl(item: IceImageItem): string {
  return item.pipelineUrl?.trim() || item.mediaUrl
}

function formatProgress(p?: number): string {
  if (p == null || Number.isNaN(p)) return ''
  const n = p <= 1 ? Math.round(p * 100) : Math.round(p)
  return ` ${n}%`
}

type Props = {
  lastResultUrl?: string | null
}

export function ShortVideoIceBatchPanel(_props: Props) {
  const [cfg, setCfg] = useState<AliyunIceCloudConfig | null>(null)
  const [imageUrlText, setImageUrlText] = useState('')
  const [imageItems, setImageItems] = useState<IceImageItem[]>([])
  const [jobs, setJobs] = useState<IceBatchJob[]>([])
  const [oneClickBusy, setOneClickBusy] = useState(false)
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoUploadProgress, setVideoUploadProgress] = useState<{
    done: number
    total: number
    fileName?: string
    percent?: number
    phase?: 'direct' | 'server' | 'encode'
  } | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageUploadProgress, setImageUploadProgress] = useState<{
    index: number
    total: number
    percent: number
    fileName: string
    phase?: 'direct' | 'server' | 'encode'
  } | null>(null)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const [materialTab, setMaterialTab] = useState<'video' | 'images'>('video')
  const [err, setErr] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageFileInputRef = useRef<HTMLInputElement>(null)
  const imagePreviewUrlsRef = useRef<string[]>([])
  const previewBlobRef = useRef<string | null>(null)

  const [aspectId, setAspectId] = useState<(typeof ICE_ASPECT_PRESETS)[number]['id']>('9:16')
  const [clipEndSec, setClipEndSec] = useState(10)
  const [dispatchTalent, setDispatchTalent] = useState(false)
  const [dispatchBusy, setDispatchBusy] = useState(false)
  const [dispatchedOrderId, setDispatchedOrderId] = useState<string | null>(null)

  const [mixGuidance, setMixGuidance] = useState('')
  const [mixTargetSec, setMixTargetSec] = useState<number>(20)
  const [scriptRows, setScriptRows] = useState<ShortVideoScriptRow[]>(() =>
    defaultScriptRows(
      segmentCountFromTargetTotalSec(20, MIX_DEFAULT_SEGMENT_SEC),
      MIX_DEFAULT_SEGMENT_SEC,
    ),
  )
  const [materialSlots, setMaterialSlots] = useState<number[]>([])
  const [mixMaterialProfiles, setMixMaterialProfiles] = useState<IceMixMaterialProfile[]>([])
  const [planBusy, setPlanBusy] = useState(false)
  const [analyzeBusy, setAnalyzeBusy] = useState(false)
  const [mixTransitionMode, setMixTransitionMode] = useState<'auto' | string>('auto')
  const [mixSubtitleStyleId, setMixSubtitleStyleId] = useState(ICE_SUBTITLE_STYLE_DEFAULT_ID)
  const mixDocInputRef = useRef<HTMLInputElement>(null)

  const aspect = useMemo(
    () => ICE_ASPECT_PRESETS.find((a) => a.id === aspectId) ?? ICE_ASPECT_PRESETS[0],
    [aspectId],
  )

  const mixEditBrief = useMemo(
    () => composeMixProductionBrief(mixGuidance, scriptRows),
    [mixGuidance, scriptRows],
  )

  const inferredMixEffect = useMemo(() => {
    const id = inferIceEffectIdFromMixContent(mixGuidance, scriptRows)
    return resolveIceEffectPreset(id)
  }, [mixGuidance, scriptRows])

  const resolvedMixEffect = useMemo(() => {
    if (mixTransitionMode === 'auto') return inferredMixEffect
    return resolveIceEffectPreset(mixTransitionMode)
  }, [mixTransitionMode, inferredMixEffect])

  const resolvedMixSubtitleStyle = useMemo(
    () => resolveIceSubtitleStylePreset(mixSubtitleStyleId),
    [mixSubtitleStyleId],
  )

  const doneJobs = jobs.filter((j) => j.phase === 'done')
  const latestDone = doneJobs.length > 0 ? doneJobs[doneJobs.length - 1] : null

  const ensureCloudEditAffordable = useCallback(async (): Promise<boolean> => {
    const afford = await checkMpAddonPointsAffordable('cloud_edit', clipEndSec)
    if (afford.ok) return true
    setErr(afford.message)
    return false
  }, [clipEndSec])

  const ensureCloudEditSmartAffordable = useCallback(async (): Promise<boolean> => {
    const afford = await checkMpAddonPointsAffordable('cloud_edit_smart', mixTargetSec)
    if (afford.ok) return true
    setErr(afford.message)
    return false
  }, [mixTargetSec])

  const appendIcePointsCharge = useCallback(
    async (
      iceJobId: string,
      baseMessage: string,
      kind: MpAddonGenerationKind = 'cloud_edit',
      durationSec?: number,
    ): Promise<string> => {
      const sec = durationSec ?? clipEndSec
      try {
        const charge = await spendMpAddonPoints({
          kind,
          durationSec: sec,
          idempotencyKey: `${kind}:${iceJobId}`,
          note: `${kind}:${iceJobId}`,
        })
        if (charge) {
          return baseMessage + formatMpAddonPointsSpendHint(kind, charge, sec)
        }
      } catch {
        /* ignore charge errors */
      }
      return baseMessage
    },
    [clipEndSec],
  )
  const mediaBusy = videoUploading || imageUploading
  const guidanceBusy = planBusy || analyzeBusy
  const anyBusy = oneClickBusy

  const mixMaterialPool = useMemo((): IceMixMaterialSlot[] => {
    const videos: IceMixMaterialSlot[] = jobs
      .filter((j) => isIceSourceMaterialJob(j) && !j.imageUrls?.length)
      .map((j) => ({
        kind: 'video' as const,
        mediaUrl: j.timelineUrl?.trim() || sanitizeIceMixMaterialUrlForPipeline(j.mediaUrl),
        signedMediaUrl: j.signedMediaUrl,
        label: j.label,
      }))
    const images: IceMixMaterialSlot[] = imageItems.map((x) => ({
      kind: 'image' as const,
      mediaUrl: icePipelineImageUrl(x),
      label: x.label,
    }))
    return [...videos, ...images]
  }, [jobs, imageItems])

  const mixReady =
    scriptRows.length >= 2 &&
    mixMaterialPool.length >= 2 &&
    mixStoryboardBriefReady(mixGuidance, scriptRows)

  const smartBatchReady =
    mixMaterialPool.length >= 2 &&
    (mixGuidance.trim().length >= 20 ||
      scriptRows.some((r) => String(r.dialogue ?? '').trim().length >= 4))

  const smartBatchBlockers = useMemo((): string[] => {
    const items: string[] = []
    if (mixMaterialPool.length < 2) items.push('上传至少 2 条不同视频/图片')
    if (
      mixGuidance.trim().length < 20 &&
      !scriptRows.some((r) => String(r.dialogue ?? '').trim().length >= 4)
    ) {
      items.push('填写至少 20 字指导文案，或在分镜表中填写口播')
    }
    for (let i = 0; i < mixMaterialPool.length; i++) {
      const m = mixMaterialPool[i]!
      const urlErr = validateIceMixMaterialUrl(m.mediaUrl || m.signedMediaUrl || '')
      if (urlErr) items.push(`素材${i + 1}（${m.label}）：${urlErr}`)
    }
    return items
  }, [mixMaterialPool, mixGuidance, scriptRows])

  const mixBlockers = useMemo((): string[] => {
    const items: string[] = []
    if (mixMaterialPool.length < 2) items.push('上传至少 2 条不同视频/图片（混剪须多素材拼接）')
    for (let i = 0; i < mixMaterialPool.length; i++) {
      const m = mixMaterialPool[i]!
      const urlErr = validateIceMixMaterialUrl(m.mediaUrl || m.signedMediaUrl || '')
      if (urlErr) items.push(`素材${i + 1}（${m.label}）：${urlErr}`)
    }
    if (scriptRows.length < 2) items.push('分镜至少 2 段（点「AI 规划分镜」）')
    else if (!mixStoryboardBriefReady(mixGuidance, scriptRows)) {
      items.push('填写指导文案，或在分镜表中填写口播/画面指令')
    }
    return items
  }, [mixMaterialPool, scriptRows.length, mixGuidance, scriptRows])

  const mixPoolLenRef = useRef(0)

  useEffect(() => {
    const poolLen = mixMaterialPool.length
    if (poolLen < 2) {
      setMaterialSlots([])
      mixPoolLenRef.current = 0
      return
    }
    const prevLen = mixPoolLenRef.current
    mixPoolLenRef.current = poolLen
    const canCover =
      scriptRows.length >= 2 ||
      mixGuidance.trim().length >= 4 ||
      mixMaterialProfiles.length > 0
    if (!canCover) return

    if (scriptRows.length !== poolLen || poolLen > prevLen) {
      const synced = syncMixCoverageForAllMaterials(
        mixMaterialPool,
        mixTargetSec,
        scriptRows.length >= 2 ? scriptRows : [],
        mixGuidance.trim(),
      )
      setScriptRows(synced.rows)
      setMaterialSlots(synced.slots)
      return
    }

    setMaterialSlots((prev) =>
      prev.length === poolLen
        ? normalizeMixMaterialSlots(prev, poolLen, poolLen)
        : assignFullMaterialCoverageSlots(poolLen),
    )
  }, [scriptRows.length, mixMaterialPool.length, mixTargetSec, mixGuidance, mixMaterialProfiles.length])

  useEffect(() => {
    const maxEnd = maxScriptTimeRangeEndSec(scriptRows)
    if (maxEnd > 0 && maxEnd !== clipEndSec) setClipEndSec(maxEnd)
  }, [scriptRows])

  useEffect(() => {
    void fetchAliyunIceCloudConfig().then((c) => {
      setCfg(c)
    })
  }, [])

  useEffect(() => {
    const track = readIceDispatchTrack()
    if (track?.merchantOrderId) setDispatchedOrderId(track.merchantOrderId)
  }, [])

  useEffect(() => {
    return () => {
      for (const u of imagePreviewUrlsRef.current) {
        try {
          URL.revokeObjectURL(u)
        } catch {
          /* ignore */
        }
      }
      imagePreviewUrlsRef.current = []
    }
  }, [])

  const openLocalFilePicker = useCallback(() => {
    if (anyBusy || mediaBusy) return
    if (!cfg?.localUploadEnabled) {
      setErr(
        '本地上传尚未开启：请运营在「商家管理后台 → AI模型 → 短视频 API → 灵祺AI云剪」填写 OSS 成片 URL 前缀（格式如 https://bucket.oss-cn-shanghai.aliyuncs.com/meoo-out/），保存后刷新本页。',
      )
      return
    }
    fileInputRef.current?.click()
  }, [anyBusy, mediaBusy, cfg?.localUploadEnabled])

  const handleLocalFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files?.length || videoUploading || imageUploading || anyBusy) return
      if (!cfg?.localUploadEnabled) {
        setErr(
          '本地上传尚未开启：请运营在「商家管理后台 → AI模型 → 短视频 API → 灵祺AI云剪」填写 OSS 成片 URL 前缀后保存，并刷新本页。',
        )
        return
      }
      const list = Array.from(files)
      const videos = list.filter(isVideoFile)
      const invalid = list.filter((file) => !isVideoFile(file))
      setVideoUploading(true)
      setVideoUploadProgress(
        videos.length > 0 ? { done: 0, total: videos.length } : null,
      )
      setErr(null)
      let added = 0
      let failed = invalid.length
      const failSamples: string[] = invalid.map(
        (file) => `「${file.name}」不是支持的视频格式（mp4/mov 等）`,
      )
      try {
        let completed = 0
        await runIceUploadPool(videos, ICE_VIDEO_UPLOAD_CONCURRENCY, async (file) => {
          const r = await uploadIceLocalMediaFile(file, {
            onProgress: (p) => {
              setVideoUploadProgress({
                done: completed,
                total: videos.length,
                fileName: file.name,
                percent: p.percent,
                phase: p.phase,
              })
            },
          })
          completed += 1
          setVideoUploadProgress({
            done: completed,
            total: videos.length,
            fileName: file.name,
            percent: r.ok ? 100 : undefined,
          })
          return { file, r }
        }).then((outcomes) => {
          for (const { file, r } of outcomes) {
            if (!r.ok) {
              failed += 1
              failSamples.push(`「${file.name}」：${r.message}`)
              continue
            }
            setJobs((prev) => [
              ...prev,
              {
                id: newJobId(),
                label: r.label.slice(0, 40),
                mediaUrl: r.mediaUrl,
                timelineUrl: r.timelineUrl,
                signedMediaUrl: r.signedMediaUrl,
                phase: 'pending' as const,
              },
            ])
            added += 1
          }
        })
      } catch (e) {
        setErr(e instanceof Error ? e.message : '视频上传失败')
      } finally {
        setVideoUploadProgress(null)
        setVideoUploading(false)
      }
      if (added > 0) {
        setHint(
          failed > 0
            ? `已上传 ${added} 个文件加入素材列表；${failed} 个失败（${failSamples.slice(0, 2).join('；')}${failSamples.length > 2 ? '…' : ''}）`
            : `已上传 ${added} 个文件到 OSS（素材就绪），请填写指导文案 → AI 规划分镜 → 一键混剪。`,
        )
      } else if (failed > 0) {
        setErr(failSamples.slice(0, 3).join('；') + (failSamples.length > 3 ? '…' : ''))
      }
    },
    [videoUploading, imageUploading, anyBusy, cfg?.localUploadEnabled],
  )

  const openImageFilePicker = useCallback(() => {
    if (anyBusy || mediaBusy) return
    if (!cfg?.localUploadEnabled) {
      setErr(
        '本地上传尚未开启：请运营在「商家管理后台 → AI模型 → 短视频 API → 灵祺AI云剪」填写 OSS 成片 URL 前缀后保存，并刷新本页。',
      )
      return
    }
    imageFileInputRef.current?.click()
  }, [anyBusy, mediaBusy, cfg?.localUploadEnabled])

  const handleLocalImages = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files?.length || videoUploading || imageUploading || anyBusy) return
      if (!cfg?.localUploadEnabled) {
        setErr('本地上传尚未开启，请先配置 OSS 前缀。')
        return
      }
      const snapList = Array.from(files).filter(isImageFile)
      if (snapList.length === 0) {
        setErr('请选择 JPG / PNG / WebP / GIF / BMP 等图片文件')
        return
      }
      setImageUploading(true)
      setMaterialTab('images')
      setErr(null)
      setImageUploadError(null)
      setImageUploadProgress({ index: 0, total: snapList.length, percent: 0, fileName: '', phase: 'encode' })
      let added = 0
      const failSamples: string[] = []
      let completed = 0
      try {
        await runIceUploadPool(snapList, ICE_IMAGE_UPLOAD_CONCURRENCY, async (raw, i) => {
          if (raw.size > ICE_LOCAL_IMAGE_MAX_BYTES) {
            return {
              ok: false as const,
              message: `「${raw.name}」超过 4MB，请压缩后重试`,
            }
          }
          setImageUploadProgress({
            index: completed + 1,
            total: snapList.length,
            percent: 8,
            fileName: raw.name,
            phase: 'encode',
          })
          const file = await compressIceImageForUpload(raw)
          if (file.size > ICE_LOCAL_IMAGE_MAX_BYTES) {
            return {
              ok: false as const,
              message: `「${raw.name}」压缩后仍超过 4MB，请换更小图片`,
            }
          }
          const r = await uploadIceLocalMediaFile(file, {
            onProgress: (p) => {
              setImageUploadProgress({
                index: completed + 1,
                total: snapList.length,
                percent: p.percent,
                fileName: raw.name,
                phase: p.phase,
              })
            },
          })
          completed += 1
          setImageUploadProgress({
            index: completed,
            total: snapList.length,
            percent: r.ok ? 100 : 0,
            fileName: raw.name,
            phase: 'server',
          })
          if (!r.ok) {
            return { ok: false as const, message: r.message, index: i }
          }
          return {
            ok: true as const,
            item: {
              id: newJobId(),
              label: r.label.slice(0, 32),
              mediaUrl: r.mediaUrl,
              pipelineUrl: r.timelineUrl,
              previewUrl: r.mediaUrl,
            },
          }
        }).then((outcomes) => {
          for (const outcome of outcomes) {
            if (!outcome.ok) {
              failSamples.push(outcome.message)
              continue
            }
            setImageItems((prev) => [...prev, outcome.item])
            added += 1
          }
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : '图片上传失败'
        failSamples.push(msg)
        setImageUploadError(msg)
        setErr(msg)
      } finally {
        setImageUploadProgress(null)
        setImageUploading(false)
      }
      if (added > 0) {
        setImageUploadError(failSamples.length > 0 ? failSamples[0]! : null)
        setHint(
          failSamples.length > 0
            ? `已上传 ${added} 张图片；${failSamples.length} 张失败（${failSamples.slice(0, 2).join('；')}${failSamples.length > 2 ? '…' : ''}）`
            : `已上传 ${added} 张图片（素材就绪），请填写指导文案并 AI 规划分镜后一键混剪。`,
        )
      } else if (failSamples.length > 0) {
        const msg = failSamples.slice(0, 3).join('；') + (failSamples.length > 3 ? '…' : '')
        setImageUploadError(msg)
        setErr(msg)
        setHint(null)
      }
    },
    [videoUploading, imageUploading, anyBusy, cfg?.localUploadEnabled],
  )

  /** 选图后立刻读入内存再清空 input，避免 Chrome FileList 失效 */
  const ingestLocalImageFiles = useCallback(
    async (picked: FileList | File[] | null, input?: HTMLInputElement | null) => {
      if (!picked?.length) return
      try {
        const snap = await snapshotUploadFiles(picked)
        if (input) input.value = ''
        await handleLocalImages(snap)
      } catch (err) {
        if (input) input.value = ''
        const msg =
          err instanceof Error ? err.message : '无法读取图片文件，请重新选择'
        setImageUploadError(msg)
        setErr(msg)
      }
    },
    [handleLocalImages],
  )

  const ingestLocalVideoFiles = useCallback(
    async (picked: FileList | null, input?: HTMLInputElement | null) => {
      if (!picked?.length) return
      try {
        const snap = await snapshotUploadFiles(picked)
        if (input) input.value = ''
        await handleLocalFiles(snap)
      } catch (err) {
        if (input) input.value = ''
        setErr(
          err instanceof Error
            ? err.message
            : '无法读取视频文件，请重新选择（与 StorageLocation 无关，多为浏览器未读完文件）',
        )
      }
    },
    [handleLocalFiles],
  )

  const onPickMixGuidanceDoc = useCallback(async (files: FileList | null) => {
    const f = files?.[0] ?? null
    if (!f) return
    setPlanBusy(true)
    setErr(null)
    try {
      const text = await parseGuidanceDocumentFile(f)
      const parsedRows = parseScriptRowsFromPlainText(text)
      setMixGuidance(text)
      if (parsedRows.length >= 2) {
        setScriptRows(resizeScriptRows(parsedRows, parsedRows.length, MIX_DEFAULT_SEGMENT_SEC))
        setHint(`已从「${f.name}」解析 ${parsedRows.length} 段分镜，可继续 AI 规划或编辑素材映射。`)
      } else {
        setHint(`已从「${f.name}」载入指导文案，点击「AI 规划分镜」自动填入表格。`)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '文档解析失败')
    } finally {
      setPlanBusy(false)
      if (mixDocInputRef.current) mixDocInputRef.current.value = ''
    }
  }, [])

  const runAnalyzeMixMaterials = useCallback(async () => {
    if (mixMaterialPool.length === 0) {
      setErr('请先上传至少一条视频或一张图片素材。')
      return
    }
    setErr(null)
    setHint('正在校验积分…')
    const afford = await checkMixMaterialAnalyzeAffordable()
    if (!afford.ok) {
      setHint(null)
      setErr(afford.message)
      return
    }
    const genKey = `mix-analyze-${Date.now()}`
    setAnalyzeBusy(true)
    setHint('AI 正在分析素材画面…')
    try {
      const r = await analyzeIceMixMaterialsToGuidance({
        materials: mixMaterialPool,
        targetTotalSec: mixTargetSec,
        aspectLabel: aspect.label,
        userHint: mixGuidance.trim() || undefined,
        onProgress: (msg) => setHint(msg),
      })
      if (!r.ok) {
        setHint(null)
        setErr(r.message)
        return
      }
      setErr(null)
      setMixGuidance(r.guidance)
      setMixMaterialProfiles(r.materialProfiles)
      setHint('分析完成，正在扣减积分…')
      try {
        const spend = await spendMixMaterialAnalyzePoints({
          idempotencyKey: genKey,
          note: `mix_material_analyze:${mixMaterialPool.length}素材`,
        })
        if (spend && spend.pointsCharged > 0) {
          setHint(
            `AI 已生成指导文案（已扣 ${spend.pointsCharged} 积分，余额 ${spend.balance.toLocaleString('zh-CN')}），可继续点击「AI 规划分镜」。`,
          )
        } else if (spend?.already) {
          setHint('AI 已生成指导文案（积分已扣减），可继续点击「AI 规划分镜」。')
        } else {
          setHint('AI 已根据素材生成指导文案，可继续点击「AI 规划分镜」自动填入分镜表。')
        }
      } catch (spendErr) {
        const msg = spendErr instanceof Error ? spendErr.message : String(spendErr)
        setHint(`AI 已生成指导文案，但积分扣减失败：${msg}`)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'AI 分析素材失败，请稍后重试')
    } finally {
      setAnalyzeBusy(false)
    }
  }, [mixMaterialPool, mixTargetSec, aspect.label, mixGuidance])

  const runPlanMixScript = useCallback(async () => {
    const draft = mixGuidance.trim()
    if (draft.length < 4) {
      setErr('请先输入或上传指导文案，再点击 AI 规划分镜。')
      return
    }
    if (mixMaterialPool.length === 0) {
      setErr('请先上传至少一条视频或一张图片素材。')
      return
    }
    const poolLen = mixMaterialPool.length
    const materialHint = mixMaterialPool
      .map((m, i) => `素材${i + 1}：${m.label}（${m.kind === 'video' ? '视频' : '图片'}）`)
      .join('\n')
    const plannerInput = `${draft}\n\n【混剪素材 ${poolLen} 条】\n${materialHint}\n\n规划要求：\n- 理解指导文案叙事，输出 6～12 段代表性分镜即可（后续系统会自动扩展为 ${poolLen} 段并逐条映射素材）\n- 每段 visual、dialogue 均须非空；口播可从指导文案拆句改写\n- 时间段从 0 连续覆盖至 ${mixTargetSec} 秒`
    setPlanBusy(true)
    setErr(null)
    setHint('AI 正在通读指导文案并规划混剪分镜…')
    try {
      const r = await planShortVideoScriptFromGuidance(plannerInput, {
        targetTotalSec: mixTargetSec,
        segmentSec: MIX_DEFAULT_SEGMENT_SEC,
        plannerModel: 'auto',
        mode: 'generate_text',
        skipReviewPasses: true,
        mixAutoExpandSegments: true,
        onProgress: (msg) => setHint(msg),
      })
      if (!r.ok) {
        setErr(r.message)
        return
      }
      if (r.usedRuleBasedFallback) {
        setHint('AI 分镜 JSON 解析失败，已按指导文案自动生成代表性分镜…')
      }
      const expandedRows = expandMixRowsForMaterialPool(
        r.rows,
        mixTargetSec,
        poolLen,
        MIX_DEFAULT_SEGMENT_SEC,
        mixMaterialPool,
        mixGuidance.trim(),
      )
      const synced = syncMixCoverageForAllMaterials(
        mixMaterialPool,
        mixTargetSec,
        expandedRows,
        mixGuidance.trim(),
      )
      setScriptRows(synced.rows)
      setMaterialSlots(synced.slots)
      const covered = maxScriptTimeRangeEndSec(synced.rows)
      setHint(
        `AI 已规划 ${synced.rows.length} 段混剪分镜（${poolLen} 条素材逐条映射，约 0–${covered || mixTargetSec} 秒），请核对后一键混剪。`,
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'AI 规划分镜失败，请稍后重试')
    } finally {
      setPlanBusy(false)
    }
  }, [mixGuidance, mixMaterialPool.length, mixTargetSec])

  const addImageUrlsFromText = useCallback(() => {
    const urls = parseImageUrlLines(imageUrlText)
    if (urls.length === 0) {
      setErr('请粘贴至少一条图片 https 链接（.jpg / .png / .webp 等）')
      return
    }
    const invalid = findInvalidIcePipelineImageUrl(urls)
    if (invalid) {
      setErr(invalid)
      return
    }
    setErr(null)
    setMaterialTab('images')
    setImageItems((prev) => [
      ...prev,
      ...urls.map((mediaUrl, i) => ({
        id: newJobId(),
        label: `图片 ${prev.length + i + 1}`,
        mediaUrl,
        pipelineUrl: mediaUrl,
        previewUrl: mediaUrl,
      })),
    ])
    setImageUrlText('')
    setHint(`已加入 ${urls.length} 张图片链接`)
  }, [imageUrlText])

  const removeImageItem = useCallback((id: string) => {
    setImageItems((prev) => {
      const hit = prev.find((x) => x.id === id)
      if (hit?.previewUrl?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(hit.previewUrl)
        } catch {
          /* ignore */
        }
        imagePreviewUrlsRef.current = imagePreviewUrlsRef.current.filter((u) => u !== hit.previewUrl)
      }
      return prev.filter((x) => x.id !== id)
    })
  }, [])

  const removeJob = (id: string) => setJobs((prev) => prev.filter((j) => j.id !== id))

  const patchJob = (id: string, patch: Partial<IceBatchJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)))
  }

  const resumePollJob = async (localJobId: string, iceJobId: string, mode: 'timeline' | 'smart_batch' = 'timeline') => {
    patchJob(localJobId, { phase: 'polling', message: '继续查询云端剪辑状态…' })
    setErr(null)
    const ok = await pollJob(localJobId, iceJobId, mode)
    if (ok) setHint('成片已就绪，可在右侧下载。')
  }

  const pollJob = async (
    localJobId: string,
    iceJobId: string,
    mode: 'timeline' | 'smart_batch' = 'timeline',
  ): Promise<boolean> => {
    const fetchStatus = mode === 'smart_batch' ? fetchIceSmartBatchJobStatus : fetchIceJobStatus
    const chargeKind: MpAddonGenerationKind = mode === 'smart_batch' ? 'cloud_edit_smart' : 'cloud_edit'
    const chargeSec = mode === 'smart_batch' ? mixTargetSec : clipEndSec
    for (let i = 0; i < POLL_MAX; i++) {
      const st = await fetchStatus(iceJobId)
      if (!st.ok) {
        const transient =
          isIceTransientNetworkError(st.message ?? '') ||
          /超时|继续查询/i.test(st.message ?? '') ||
          /查询失败 HTTP 502/i.test(st.message ?? '')
        patchJob(localJobId, {
          phase: transient ? 'polling' : 'failed',
          message: transient
            ? `${st.message ?? '查询超时'}（将自动重试）`
            : st.message,
        })
        if (transient) {
          await new Promise((r) => setTimeout(r, POLL_MS))
          continue
        }
        return false
      }
      if (st.failed) {
        patchJob(localJobId, {
          phase: 'failed',
          message: st.message ? `剪辑失败：${st.message}` : `剪辑失败：${st.status}`,
        })
        return false
      }
      if (st.outputPending) {
        patchJob(localJobId, {
          phase: 'polling',
          message: st.message ?? '成片写入 OSS 中，请稍候…',
        })
        await new Promise((r) => setTimeout(r, POLL_MS))
        continue
      }
      if (st.done) {
        const baseMessage =
          st.outputBytes && st.outputBytes > 0
            ? `剪辑完成（约 ${Math.round(st.outputBytes / 1024)} KB），可下载成片`
            : '剪辑完成，可在右侧下载成片'
        const message = await appendIcePointsCharge(iceJobId, baseMessage, chargeKind, chargeSec)
        patchJob(localJobId, {
          phase: 'done',
          downloadUrl:
            mode === 'smart_batch'
              ? iceExportDownloadPaths(iceJobId, 'smart_batch')[0]
              : iceJobDownloadProxyPath(iceJobId),
          message,
          mixProduceMode: mode,
        })
        return true
      }
      patchJob(localJobId, {
        phase: 'polling',
        message: `剪辑中 ${st.status}${formatProgress(st.progress)}`,
      })
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
    patchJob(localJobId, { phase: 'failed', message: '剪辑超时，请稍后重试或联系运营' })
    return false
  }

  const runMixOneClick = async () => {
    if (!cfg?.configured) {
      setErr('AI混剪服务未就绪')
      return
    }
    if (mixMaterialPool.length < 2) {
      setErr('混剪须至少 2 条不同素材，请继续上传视频或图片')
      return
    }
    if (scriptRows.length < 2) {
      setErr('请先规划至少 2 段分镜（指导文案 → AI 规划分镜）')
      return
    }
    if (!mixStoryboardBriefReady(mixGuidance, scriptRows)) {
      setErr('请填写指导文案或在分镜表中填写画面/口播')
      return
    }
    if (mixBlockers.length > 0) {
      setErr(`暂不可混剪：${mixBlockers.join('；')}`)
      return
    }

    setOneClickBusy(true)
    setErr(null)
    setHint('ICE 剪辑引擎：多素材拼接 + 截取 + 转场 + TTS…')

    const profiles = mixMaterialPool.map((m, i) => {
      const hit = mixMaterialProfiles.find((p) => p.index === i)
      return (
        hit ?? {
          index: i,
          label: m.label || `素材${i + 1}`,
          kind: m.kind,
          description: m.label || `实拍${m.kind === 'video' ? '视频' : '图片'}`,
          estimatedDurationSec: m.kind === 'video' ? 6 : undefined,
        }
      )
    })

    const coverage = syncMixCoverageForAllMaterials(
      mixMaterialPool,
      mixTargetSec,
      scriptRows,
      mixGuidance.trim(),
    )

    const produced = await produceIceMixPackage({
      rows: coverage.rows,
      materials: mixMaterialPool,
      materialSlots: coverage.slots,
      materialProfiles: profiles,
      targetTotalSec: mixTargetSec,
      guidance: mixGuidance.trim(),
      mixInstruction: mixGuidance.trim(),
      effectId: resolvedMixEffect.id,
      subtitleStyleId: mixSubtitleStyleId,
      onProgress: (msg) => setHint(msg),
    })
    if (!produced.ok) {
      setErr(produced.message)
      setOneClickBusy(false)
      return
    }

    const pack: IceMixProduceOutput = produced.output
    const segments = pack.segments
    if (segments.length < 2) {
      setErr('剪辑时间线无效，请检查分镜与素材映射')
      setOneClickBusy(false)
      return
    }

    setMaterialSlots(pack.materialSlots)
    setHint(`剪辑方案：${pack.summary}`)
    const mixNarrationText = pack.narrationText

    const localId = newJobId()
    const label = `AI混剪 · ${segments.length} 段`
    setHint(`正在提交 ICE 多轨剪辑（${segments.length} 段拼接）…`)
    setJobs((prev) => [
      ...prev,
      {
        id: localId,
        label,
        mediaUrl: segments[0]!.mediaUrl,
        phase: 'pipeline',
        message: '混剪 · 提交云端…',
      },
    ])
    if (!(await ensureCloudEditAffordable())) {
      patchJob(localId, { phase: 'failed', message: '积分不足，无法提交混剪' })
      setOneClickBusy(false)
      return
    }
    const totalSec = resolveMixTotalDurationSec(scriptRows, mixTargetSec)
    const pipe = await postIcePipeline({
      mixSegments: segments.map((s) =>
        prepareIceMixSegmentForPost({
          kind: s.kind,
          mediaUrl: s.mediaUrl,
          signedMediaUrl: s.signedMediaUrl,
          timelineStartSec: s.timelineStartSec,
          timelineEndSec: s.timelineEndSec,
          caption: s.caption,
          materialIndex: s.materialIndex,
          sourceInSec: s.sourceInSec,
          sourceOutSec: s.sourceOutSec,
        }),
      ),
      mixNarrationText: mixNarrationText.length >= 4 ? mixNarrationText : undefined,
      projectName: `AI混剪-${label}`.slice(0, 120),
      editBrief: pack.editBrief,
      width: aspect.width,
      height: aspect.height,
      clipEndSec: totalSec,
      effectId: pack.effectId,
      subtitleStyleId: pack.subtitleStyleId,
    })
    if (!pipe.ok) {
      patchJob(localId, { phase: 'failed', message: pipe.message })
      setOneClickBusy(false)
      return
    }
    patchJob(localId, {
      exportId: pipe.jobId,
      phase: 'polling',
      message: '混剪 · 云端合成中…',
      mixProduceMode: 'timeline',
    })
    await pollJob(localId, pipe.jobId, 'timeline')
    setOneClickBusy(false)
    setHint('AI混剪已提交，请在右侧下载 MP4。')
  }

  const runSmartBatchOneClick = async () => {
    if (!cfg?.configured) {
      setErr('AI混剪服务未就绪')
      return
    }
    if (!cfg?.smartBatchEnabled) {
      setErr('智能一键成片未启用：请确认 IMS 订阅已在运营台开通')
      return
    }
    if (smartBatchBlockers.length > 0) {
      setErr(`暂不可智能成片：${smartBatchBlockers.join('；')}`)
      return
    }

    setOneClickBusy(true)
    setErr(null)
    setHint('IMS 智能一键成片：AI 拆条 + 转场 + 口播合成…')

    const localId = newJobId()
    const label = `智能成片 · ${mixMaterialPool.length} 素材`
    setJobs((prev) => [
      ...prev,
      {
        id: localId,
        label,
        mediaUrl: mixMaterialPool[0]!.mediaUrl,
        phase: 'pipeline',
        message: '智能成片 · 提交云端…',
        mixProduceMode: 'smart_batch',
      },
    ])

    if (!(await ensureCloudEditSmartAffordable())) {
      patchJob(localId, { phase: 'failed', message: '积分不足，无法提交智能成片' })
      setOneClickBusy(false)
      return
    }

    const totalSec = mixTargetSec
    const pipe = await postIceSmartBatch({
      materials: mixMaterialPool.map((m) => ({
        kind: m.kind,
        mediaUrl: m.mediaUrl,
        label: m.label,
      })),
      scriptRows: scriptRows
        .filter((r) => r.dialogue.trim().length >= 4)
        .slice(0, 4)
        .map((r) => ({
          timeRange: r.timeRange,
          visual: r.visual,
          dialogue: r.dialogue,
        })),
      guidance: mixGuidance.trim(),
      targetTotalSec: totalSec,
      width: aspect.width,
      height: aspect.height,
      projectName: `智能成片-${label}`.slice(0, 120),
      templateIds: cfg.smartBatchTemplateIds,
      subtitleStyleId: mixSubtitleStyleId,
    })

    if (!pipe.ok) {
      patchJob(localId, { phase: 'failed', message: pipe.message })
      setOneClickBusy(false)
      return
    }

    patchJob(localId, {
      exportId: pipe.jobId,
      phase: 'polling',
      message: '智能成片 · 云端合成中…',
      mixProduceMode: 'smart_batch',
    })
    await pollJob(localId, pipe.jobId, 'smart_batch')
    setOneClickBusy(false)
    setHint('智能一键成片已提交，请在右侧下载 MP4。')
  }

  const downloadJob = async (job: IceBatchJob) => {
    if (!job.exportId) {
      setErr('缺少混剪任务编号，请重新一键混剪')
      return
    }
    setDownloadBusy(true)
    setErr(null)
    setHint('正在从云端拉取成片…')
    try {
      await downloadIceExportFile(job.exportId, job.label, {
        mixProduceMode: job.mixProduceMode ?? 'timeline',
      })
      setHint('下载已开始，请查看浏览器下载栏')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDownloadBusy(false)
    }
  }

  useEffect(() => {
    const exportId = latestDone?.exportId
    if (!exportId) {
      if (previewBlobRef.current) {
        URL.revokeObjectURL(previewBlobRef.current)
        previewBlobRef.current = null
      }
      setPreviewBlobUrl(null)
      setPreviewLoading(false)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    setErr(null)
    void fetchIceExportPreviewUrl(exportId, {
      mixProduceMode: latestDone?.mixProduceMode ?? 'timeline',
    })
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        if (previewBlobRef.current) URL.revokeObjectURL(previewBlobRef.current)
        previewBlobRef.current = url
        setPreviewBlobUrl(url)
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e)
          setErr(msg)
          setPreviewBlobUrl(null)
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [latestDone?.exportId, latestDone?.mixProduceMode])

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/80 via-white to-cyan-50/40 px-5 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-3 text-xl font-semibold tracking-tight text-zinc-900">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-md">
                <Cloud className="h-5 w-5" />
              </span>
              灵祺 AI 混剪
            </h2>
            <MpAddonPointsRateBadge kind="cloud_edit" className="mt-2" />
            {cfg?.smartBatchEnabled ? (
              <MpAddonPointsRateBadge kind="cloud_edit_smart" className="mt-2 ml-2" />
            ) : null}
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
              上传探店/带货实拍，填写<strong className="font-medium text-zinc-800">指导文案</strong>并
              <strong className="font-medium text-zinc-800"> AI 规划分镜</strong>，可选
              <strong className="font-medium text-zinc-800">普通混剪</strong>或
              <strong className="font-medium text-zinc-800">智能一键成片</strong>下载成片。
            {readMpSessionToken() ? (
              <span className="mt-1 block text-xs text-violet-700">
                星选账号：每条成片成功后按秒扣积分；套餐 ai_video_quota 次数优先，用尽后扣积分余额。
              </span>
            ) : null}
          </p>
        </div>
        <ServiceBadge cfg={cfg} />
        </div>
      </header>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { n: 1, title: '上传素材', sub: '视频 / 图片，可多段' },
          { n: 2, title: '指导文案', sub: '写卖点或上传 doc/txt' },
          { n: 3, title: 'AI 规划分镜', sub: '时间段 · 画面 · 口播' },
          { n: 4, title: '生成成片', sub: '普通混剪 / 智能一键成片' },
        ].map((s) => (
          <li
            key={s.n}
            className="flex gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-rose-500 text-xs font-bold text-white shadow-sm">
              {s.n}
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-900">{s.title}</p>
              <p className="text-xs text-zinc-500">{s.sub}</p>
            </div>
          </li>
        ))}
      </ol>

      {(err || hint) && (
        <div
          className={cn(
            'rounded-lg px-4 py-3 text-sm',
            err ? 'border border-red-200 bg-red-50 text-red-900' : 'border border-zinc-200 bg-zinc-50 text-zinc-700',
          )}
        >
          {err ?? hint}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-12">
        {/* 左侧：输入区 */}
        <div className="space-y-5 xl:col-span-7">
          {/* ① 素材 */}
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <SectionHead
              step={1}
              title="素材来源"
              required
              hint="上传素材供下方分镜映射；完成第 2 步后点击「一键混剪」"
            />
            <div className="flex gap-1 border-b border-zinc-100 px-5">
              <MaterialTabBtn
                active={materialTab === 'video'}
                onClick={() => setMaterialTab('video')}
                label="视频素材"
                count={jobs.filter((j) => !j.imageUrls?.length).length}
              />
              <MaterialTabBtn
                active={materialTab === 'images'}
                onClick={() => setMaterialTab('images')}
                label="图片素材"
                count={imageItems.length}
                accent="violet"
              />
            </div>
            <div className="space-y-4 px-5 py-5">
              {materialTab === 'video' ? (
                <>
              <input
                id="ice-local-video-input"
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/*,.mp4,.mov,.m4v,.webm"
                multiple
                className="sr-only"
                disabled={anyBusy || mediaBusy}
                onChange={(e) => {
                  const input = e.target
                  void ingestLocalVideoFiles(input.files, input)
                }}
              />
              {!cfg?.localUploadEnabled ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
                  <p className="font-medium">本地上传未开启</p>
                  <p className="mt-1 text-amber-900/90">
                    需在运营管理后台「AI模型 → 短视频 API → 灵祺AI云剪」填写 OSS 成片 URL 前缀并保存，然后刷新本页。
                  </p>
                </div>
              ) : null}
              <label
                htmlFor="ice-local-video-input"
                role="button"
                tabIndex={anyBusy || mediaBusy ? -1 : 0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openLocalFilePicker()
                  }
                }}
                onClick={(e) => {
                  if (!cfg?.localUploadEnabled) {
                    e.preventDefault()
                    openLocalFilePicker()
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (anyBusy || mediaBusy) return
                  void handleLocalFiles(e.dataTransfer.files)
                }}
                className={cn(
                  'flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 transition',
                  anyBusy || mediaBusy ? 'pointer-events-none opacity-60' : '',
                  cfg?.localUploadEnabled
                    ? 'border-orange-300 bg-orange-50/50 hover:border-orange-400 hover:bg-orange-50'
                    : 'border-zinc-300 bg-zinc-50 hover:border-amber-400 hover:bg-amber-50/40',
                )}
              >
                {videoUploading ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
                    <span className="text-sm font-medium text-zinc-800">
                      {videoUploadProgress
                        ? `视频上传中 ${videoUploadProgress.done}/${videoUploadProgress.total}（${ICE_VIDEO_UPLOAD_CONCURRENCY} 路并行${
                            videoUploadProgress.phase === 'direct'
                              ? ' · OSS 直传'
                              : videoUploadProgress.phase === 'server'
                                ? ' · 服务端写入'
                                : ''
                          }${videoUploadProgress.percent != null ? ` · ${videoUploadProgress.percent}%` : ''}）`
                        : '视频上传中…'}
                    </span>
                    {videoUploadProgress?.fileName ? (
                      <span className="max-w-full truncate text-xs text-zinc-500">
                        {videoUploadProgress.fileName}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Upload
                      className={cn(
                        'h-8 w-8',
                        cfg?.localUploadEnabled ? 'text-orange-600' : 'text-amber-600',
                      )}
                    />
                    <span className="text-sm font-semibold text-zinc-900">本地上传视频</span>
                    <span className="text-center text-xs text-zinc-500">
                      点击或拖拽到此处 · MP4 / MOV 等 · 单文件 ≤ 500MB
                      {!cfg?.localUploadEnabled ? (
                        <span className="mt-1 block text-amber-800">未配置 OSS 时点击可查看说明</span>
                      ) : null}
                    </span>
                  </>
                )}
              </label>

              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                混剪须使用<strong>本地上传</strong>写入 OSS 的无签名直链；勿粘贴示例 CDN 或带 <code className="font-mono">?Signature=</code> 的地址。若列表中有旧素材，请先删除再重新上传。
              </p>

              {jobs.length > 0 ? (
                <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                  {jobs.map((j) => (
                    <li key={j.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      {j.imageUrls?.length ? (
                        <ImagePlus className="h-4 w-4 shrink-0 text-violet-500" />
                      ) : (
                        <Film className="h-4 w-4 shrink-0 text-zinc-400" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{j.label}</span>
                      <PhasePill job={j} />
                      <button
                        type="button"
                        disabled={anyBusy}
                        onClick={() => removeJob(j.id)}
                        className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="移除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-zinc-500">暂无视频 — 请本地上传至少 2 条 MP4/MOV，上传后在第 2 步分镜中映射使用。</p>
              )}
                </>
              ) : null}

              {materialTab === 'images' ? (
                <>
              {imageUploadError && !imageUploading ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">图片上传失败</p>
                    <p className="mt-1">{imageUploadError}</p>
                  </div>
                </div>
              ) : null}
              <input
                id="ice-local-image-input"
                ref={imageFileInputRef}
                type="file"
                accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.heic,.avif"
                multiple
                className="sr-only"
                disabled={anyBusy || mediaBusy}
                onChange={(e) => {
                  const input = e.target
                  const picked = input.files
                  void ingestLocalImageFiles(picked, input)
                }}
              />
              <label
                htmlFor="ice-local-image-input"
                role="button"
                tabIndex={anyBusy || mediaBusy ? -1 : 0}
                onClick={(e) => {
                  if (!cfg?.localUploadEnabled) {
                    e.preventDefault()
                    openImageFilePicker()
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (anyBusy || mediaBusy) return
                  const imgs = Array.from(e.dataTransfer.files).filter(isImageFile)
                  if (imgs.length === 0) {
                    setErr('请拖入 JPG / PNG / WebP / GIF / BMP 等图片文件')
                    return
                  }
                  void ingestLocalImageFiles(imgs)
                }}
                className={cn(
                  'flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 transition',
                  anyBusy || mediaBusy ? 'pointer-events-none opacity-60' : '',
                  'border-violet-200 bg-violet-50/40 hover:border-violet-400 hover:bg-violet-50/70',
                )}
              >
                {imageUploading ? (
                  <>
                    <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
                    <span className="text-sm font-medium text-zinc-800">
                      {imageUploadProgress
                        ? `上传中 ${imageUploadProgress.index}/${imageUploadProgress.total} · ${imageUploadProgress.percent}%${
                            imageUploadProgress.phase === 'server'
                              ? ' · 服务端写入'
                              : imageUploadProgress.phase === 'encode'
                                ? ' · 准备中'
                                : imageUploadProgress.phase === 'direct'
                                  ? ' · 直传 OSS'
                                  : ''
                          }`
                        : '图片上传中…'}
                    </span>
                    {imageUploadProgress ? (
                      <span className="max-w-full truncate text-center text-[11px] text-zinc-500">
                        {imageUploadProgress.fileName}
                      </span>
                    ) : null}
                    {imageUploadProgress ? (
                      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-violet-100">
                        <div
                          className="h-full rounded-full bg-violet-600 transition-all duration-200"
                          style={{ width: `${imageUploadProgress.percent}%` }}
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-7 w-7 text-violet-600" />
                    <span className="text-sm font-semibold text-zinc-900">本地上传图片（可多选）</span>
                    <span className="text-center text-xs text-zinc-500">
                      JPG / PNG / WebP / GIF / BMP · 单张 ≤ 4MB · 可多张参与分镜混剪
                    </span>
                  </>
                )}
              </label>

              <textarea
                value={imageUrlText}
                disabled={anyBusy || mediaBusy}
                onChange={(e) => setImageUrlText(e.target.value)}
                placeholder={'请点上方「本地上传图片」添加素材（勿粘贴 bucket.oss…/photo-01.jpg 等示例链接）'}
                className="min-h-[72px] w-full rounded-lg border border-violet-200 px-3 py-2.5 font-mono text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={anyBusy || mediaBusy}
                  onClick={addImageUrlsFromText}
                  className="rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm text-violet-900 hover:bg-violet-50 disabled:opacity-50"
                >
                  加入图片列表
                </button>
              </div>

              {imageItems.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-violet-900">
                    已选 {imageItems.length} 张（上传后保留在列表，切换 Tab 不会丢失）
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {imageItems.map((img) => (
                      <div
                        key={img.id}
                        className="group relative overflow-hidden rounded-lg border border-violet-200 bg-zinc-100"
                      >
                        <img
                          src={img.previewUrl || img.mediaUrl}
                          alt={img.label}
                          className="aspect-[9/16] w-full object-cover"
                        />
                        <button
                          type="button"
                          disabled={anyBusy}
                          onClick={() => removeImageItem(img.id)}
                          className="absolute right-1 top-1 rounded bg-black/50 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                          aria-label="移除图片"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <p className="truncate px-1 py-0.5 text-[10px] text-zinc-600">{img.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-violet-800/80">
                  上传图片后，在第 2 步填写指导文案、AI 规划分镜，再点「一键混剪」。
                </p>
              )}
                </>
              ) : null}
            </div>
          </section>

          {/* ② 指导文案与分镜 */}
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
              <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-zinc-900 text-[11px] font-bold text-white">
                    2
                  </span>
                  AI 混剪生成
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                  分析素材 → 规划分镜 → 生成成片。引擎使用阿里云 ICE 多轨时间线：多素材截取拼接、叠化转场、AI_TTS 口播、动效字幕（非单条视频轮播）。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={mixDocInputRef}
                  type="file"
                  accept=".txt,.md,.doc,.docx,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => void onPickMixGuidanceDoc(e.target.files)}
                />
                <button
                  type="button"
                  disabled={anyBusy || guidanceBusy || mixMaterialPool.length < 1}
                  onClick={() => void runAnalyzeMixMaterials()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50"
                >
                  {analyzeBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ScanEye className="h-3.5 w-3.5" />
                  )}
                  AI 分析素材
                </button>
                <button
                  type="button"
                  disabled={anyBusy || guidanceBusy}
                  onClick={() => mixDocInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  <FileText className="h-3.5 w-3.5" />
                  上传 doc/txt
                </button>
                <button
                  type="button"
                  disabled={anyBusy || guidanceBusy || mixGuidance.trim().length < 4}
                  onClick={() => void runPlanMixScript()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900 hover:bg-orange-100 disabled:opacity-50"
                >
                  {planBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  AI 规划分镜
                </button>
              </div>
            </div>
            <div className="space-y-4 px-5 pb-5 pt-4">
              {(analyzeBusy || (hint && guidanceBusy)) && hint ? (
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                  {hint}
                </div>
              ) : null}
              {err && !analyzeBusy ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                  {err}
                </div>
              ) : null}
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1 text-xs text-zinc-600">
                  <span>目标总时长</span>
                  <select
                    value={mixTargetSec}
                    disabled={anyBusy || guidanceBusy}
                    onChange={(e) => {
                      const sec = Number(e.target.value)
                      setMixTargetSec(sec)
                      setScriptRows(
                        defaultScriptRows(
                          segmentCountFromTargetTotalSec(sec, MIX_DEFAULT_SEGMENT_SEC),
                          MIX_DEFAULT_SEGMENT_SEC,
                        ),
                      )
                    }}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                  >
                    {MIX_TARGET_TOTAL_OPTIONS.map((sec) => (
                      <option key={sec} value={sec}>
                        {sec} 秒
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-600">
                  <span>画幅</span>
                  <select
                    value={aspectId}
                    disabled={anyBusy || guidanceBusy}
                    onChange={(e) => setAspectId(e.target.value as typeof aspectId)}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                  >
                    {ICE_ASPECT_PRESETS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-zinc-600">
                  <span>字幕样式</span>
                  <select
                    value={mixSubtitleStyleId}
                    disabled={anyBusy || guidanceBusy}
                    onChange={(e) => setMixSubtitleStyleId(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                  >
                    {ICE_SUBTITLE_STYLE_PRESETS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.tag ? `【${s.tag}】` : ''}
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-zinc-600">
                  <span>场景转场</span>
                  <select
                    value={mixTransitionMode}
                    disabled={anyBusy || guidanceBusy}
                    onChange={(e) => setMixTransitionMode(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
                  >
                    <option value="auto">
                      智能推断
                      {mixTransitionMode === 'auto' ? `（${inferredMixEffect.label}）` : ''}
                    </option>
                    {ICE_MIX_TRANSITION_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="w-full text-[11px] leading-snug text-zinc-500">
                  已上传素材 {mixMaterialPool.length} 个（视频 {jobs.filter((j) => !j.imageUrls?.length).length} · 图片{' '}
                  {imageItems.length}）
                  <span className="mt-1 block text-zinc-600">
                    字幕：{resolvedMixSubtitleStyle.label}
                    {resolvedMixSubtitleStyle.description ? ` — ${resolvedMixSubtitleStyle.description}` : ''}
                    {' · '}
                    转场：{resolvedMixEffect.label}
                    {mixTransitionMode === 'auto' ? '（由文案推断）' : ''}
                  </span>
                </p>
              </div>
              <textarea
                spellCheck={false}
                value={mixGuidance}
                disabled={anyBusy || guidanceBusy}
                onChange={(e) => setMixGuidance(e.target.value)}
                placeholder="商业创意、卖点与叙事；可「AI 分析素材」自动填写。生成时将按分镜拼接多条素材并加转场与 TTS 口播。"
                className="min-h-[96px] w-full resize-y rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none ring-orange-600/30 focus-visible:ring-2"
              />
              <div>
                <span className="text-sm font-medium text-zinc-800">分镜表（剪辑时间轴）</span>
                <p className="mt-1 text-xs text-zinc-500">
                  每段对应成片时间轴上的一镜：自动轮询分配不同素材并截取片段；口播合成 TTS，字幕带弹入动效。
                </p>
                <div className="mt-2">
                  <ShortVideoScriptTableEditor
                    rows={scriptRows}
                    disabled={anyBusy || guidanceBusy}
                    onChange={setScriptRows}
                  />
                </div>
                {mixMaterialPool.length > 0 && scriptRows.length > 0 ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/80 p-3">
                    <p className="text-xs font-medium text-zinc-700">
                      素材映射（默认轮询不同素材；可手动调整每段用哪条）
                    </p>
                    {scriptRows.map((row, i) => (
                      <label key={i} className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                        <span className="w-24 shrink-0 truncate">{row.timeRange || `段 ${i + 1}`}</span>
                        <select
                          value={materialSlots[i] ?? i % mixMaterialPool.length}
                          disabled={anyBusy || guidanceBusy}
                          onChange={(e) => {
                            const idx = Number(e.target.value)
                            setMaterialSlots((prev) => {
                              const next = [...prev]
                              next[i] = idx
                              return next
                            })
                          }}
                          className="min-w-[10rem] flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs"
                        >
                          {mixMaterialPool.map((m, mi) => (
                            <option key={mi} value={mi}>
                              {m.kind === 'video' ? '视频' : '图片'} · {m.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  disabled={!mixReady || oneClickBusy || mediaBusy || guidanceBusy}
                  onClick={() => void runMixOneClick()}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-300 min-w-[12rem]"
                >
                  {oneClickBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
                  普通混剪（{scriptRows.length} 段）
                </button>
                <button
                  type="button"
                  disabled={
                    !cfg?.smartBatchEnabled ||
                    !smartBatchReady ||
                    oneClickBusy ||
                    mediaBusy ||
                    guidanceBusy
                  }
                  title={
                    cfg?.smartBatchEnabled
                      ? undefined
                      : '需在阿里云开通 IMS 智能一键成片订阅，请联系运营开通'
                  }
                  onClick={() => void runSmartBatchOneClick()}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300 min-w-[12rem]"
                >
                  {oneClickBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
                  智能一键成片
                </button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                <span>普通混剪：分镜精细拼接 · 8 积分/秒</span>
                {cfg?.smartBatchEnabled ? (
                  <span>智能成片：阿里云 AI 拆条+转场 · 22 积分/秒 · 仅用分镜「口播」、不含标题/执行文稿</span>
                ) : (
                  <span className="text-amber-700">智能成片未开通（IMS 订阅）</span>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                普通混剪：多素材截取拼接 · TTS 口播 · 动效字幕；智能成片：IMS 自动拆条、随机转场与口播
              </p>
              {!mixReady && mixBlockers.length > 0 && !oneClickBusy && !guidanceBusy ? (
                <p className="flex items-start gap-1.5 text-xs text-amber-800">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  普通混剪暂不可用：{mixBlockers.join('；')}
                </p>
              ) : null}
              {cfg?.smartBatchEnabled &&
              !smartBatchReady &&
              smartBatchBlockers.length > 0 &&
              !oneClickBusy &&
              !guidanceBusy ? (
                <p className="flex items-start gap-1.5 text-xs text-amber-800">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  智能成片暂不可用：{smartBatchBlockers.join('；')}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        {/* 右侧：成片输出 */}
        <aside className="xl:col-span-5">
          <section className="sticky top-4 rounded-xl border-2 border-orange-200 bg-gradient-to-b from-orange-50/80 to-white shadow-sm">
            <div className="border-b border-orange-100 px-5 py-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
                <Download className="h-5 w-5 text-orange-600" />
                成片输出
                <span className="text-xs font-normal text-zinc-500">（下载区）</span>
              </h3>
              <p className="mt-1 text-xs text-zinc-600">剪辑完成后，在此下载 MP4 或打开云端链接。</p>
            </div>

            <div className="p-5">
              {latestDone ? (
                <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-emerald-900">
                    <CheckCircle2 className="h-5 w-5" />
                    最新成片已就绪
                  </div>
                  <p className="mb-3 truncate text-xs text-emerald-800">{latestDone.label}</p>
                  {latestDone.exportId ? (
                    <div className="relative mb-3">
                      {previewLoading ? (
                        <div className="flex h-40 items-center justify-center rounded-lg border border-emerald-200 bg-black/90">
                          <Loader2 className="h-8 w-8 animate-spin text-emerald-200" />
                        </div>
                      ) : previewBlobUrl ? (
                        <video
                          key={previewBlobUrl}
                          src={previewBlobUrl}
                          controls
                          playsInline
                          preload="auto"
                          className="max-h-48 w-full rounded-lg border border-emerald-200 bg-black object-contain"
                          onError={() =>
                            setErr(
                              '预览解码失败：成片可能不是浏览器可播的 MP4（H.264），请尝试下载后用本地播放器打开。',
                            )
                          }
                        />
                      ) : (
                        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 text-xs text-emerald-800">
                          预览未加载，请点下载或下方链接
                        </div>
                      )}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={downloadBusy}
                    onClick={() => void downloadJob(latestDone)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {downloadBusy ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Download className="h-5 w-5" />
                    )}
                    {downloadBusy ? '正在拉取成片…' : '下载 MP4'}
                  </button>
                  {latestDone.exportId ? (
                    <a
                      href={
                        (latestDone.mixProduceMode === 'smart_batch'
                          ? iceExportDownloadPaths(latestDone.exportId, 'smart_batch', true)
                          : [iceJobDownloadProxyPath(latestDone.exportId, true)]
                        )[0]
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 flex items-center justify-center gap-1 text-xs text-emerald-800 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      在浏览器中预览成片
                    </a>
                  ) : null}
                </div>
              ) : anyBusy ? (
                <div className="mb-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-orange-200 bg-white py-10 text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
                  <p className="mt-3 text-sm font-medium text-zinc-800">云端剪辑中…</p>
                  <p className="mt-1 text-xs text-zinc-500">完成后下载按钮将出现在此区域</p>
                </div>
              ) : (
                <div className="mb-5 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 py-10 text-center">
                  <Download className="mx-auto h-10 w-10 text-zinc-300" />
                  <p className="mt-3 text-sm text-zinc-600">暂无成片</p>
                  <p className="mt-1 px-6 text-xs text-zinc-500">
                    完成左侧流程并点击「一键混剪」后，成片将显示在此处。
                  </p>
                </div>
              )}

              {jobs.some((j) => !isIceSourceMaterialJob(j)) ? (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    混剪任务
                  </p>
                  <ul className="max-h-[320px] space-y-2 overflow-y-auto">
                    {jobs.filter((j) => !isIceSourceMaterialJob(j)).map((j) => (
                      <li
                        key={j.id}
                        className={cn(
                          'rounded-lg border px-3 py-2.5 text-sm',
                          j.phase === 'done' && 'border-emerald-200 bg-emerald-50/50',
                          j.phase === 'failed' && 'border-red-200 bg-red-50/50',
                          j.phase !== 'done' &&
                            j.phase !== 'failed' &&
                            'border-zinc-200 bg-white',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-zinc-800">{j.label}</span>
                          <PhasePill job={j} />
                        </div>
                        {j.message ? (
                          <p className="mt-1 text-xs text-zinc-600">{j.message}</p>
                        ) : null}
                        {j.phase === 'done' ? (
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void downloadJob(j)}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-orange-600 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
                            >
                              <Download className="h-3.5 w-3.5" />
                              下载
                            </button>
                            {j.exportId ? (
                              <a
                                href={
                                  (j.mixProduceMode === 'smart_batch'
                                    ? iceExportDownloadPaths(j.exportId, 'smart_batch', true)
                                    : [iceJobDownloadProxyPath(j.exportId, true)]
                                  )[0]
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center rounded-md border border-zinc-300 px-2 py-1.5 text-zinc-700 hover:bg-zinc-50"
                                title="预览成片"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                        {j.phase === 'failed' && j.exportId ? (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => void resumePollJob(j.id, j.exportId!, j.mixProduceMode ?? 'timeline')}
                              className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-orange-300 bg-orange-50 py-1.5 text-xs font-medium text-orange-900 hover:bg-orange-100"
                            >
                              <Loader2 className="h-3.5 w-3.5" />
                              继续查询（任务可能仍在云端）
                            </button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>

          {doneJobs.length > 0 ? (
            <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={dispatchTalent}
                  onChange={(e) => setDispatchTalent(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-violet-300 text-violet-600"
                />
                <span className="text-sm text-violet-950">
                  <span className="font-semibold">派发达人投放</span>
                  <span className="mt-1 block text-xs font-normal text-violet-800/90">
                    将 {doneJobs.length} 条混剪成片推送至运营「商家达人招募订单」，由运营下发云剪单至达人小程序。
                  </span>
                </span>
              </label>
              {dispatchTalent ? (
                <button
                  type="button"
                  disabled={dispatchBusy || mixEditBrief.trim().length < 4}
                  onClick={() => {
                    void (async () => {
                      setDispatchBusy(true)
                      setErr(null)
                      try {
                        const { orderId } = await dispatchIceBatchToRecruitmentOps({
                          doneJobs,
                          editBrief: mixEditBrief,
                          supabase: supabaseConfigured ? supabase : null,
                        })
                        writeIceDispatchTrack(orderId)
                        setDispatchedOrderId(orderId)
                        setHint(
                          `已派发达人投放，订单 ${orderId} 已写入运营台；下方可查看每条成片的达人接单与完成进度。`,
                        )
                        setDispatchTalent(false)
                      } catch (e) {
                        setErr(e instanceof Error ? e.message : String(e))
                      } finally {
                        setDispatchBusy(false)
                      }
                    })()
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {dispatchBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      提交中…
                    </>
                  ) : (
                    '确认派发达人投放'
                  )}
                </button>
              ) : null}
            </div>
          ) : null}

          {dispatchedOrderId ? (
            <IceDispatchProgressPanel merchantOrderId={dispatchedOrderId} />
          ) : null}

          <ConfigFootnote cfg={cfg} />
        </aside>
      </div>
    </div>
  )
}

function ServiceBadge({ cfg }: { cfg: AliyunIceCloudConfig | null }) {
  const ready = cfg?.configured && (cfg.hasOssOutput || cfg.hasVodOutput)
  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={cn(
          'rounded-full px-3 py-1.5 text-xs font-medium',
          ready
            ? 'bg-emerald-100 text-emerald-900'
            : cfg?.configured
              ? 'bg-amber-100 text-amber-900'
              : 'bg-red-100 text-red-900',
        )}
      >
        {ready ? '服务就绪' : cfg?.configured ? '待配置输出存储' : '未配置凭据'}
      </span>
      {cfg?.localUploadEnabled ? (
        <span className="text-[11px] text-emerald-700">本地上传已开启</span>
      ) : cfg?.configured ? (
        <span className="text-[11px] text-zinc-500">本地上传需 OSS 前缀</span>
      ) : null}
    </div>
  )
}

function MaterialTabBtn({
  active,
  onClick,
  label,
  count,
  accent,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  accent?: 'violet'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative -mb-px rounded-t-lg px-4 py-2.5 text-sm font-medium transition',
        active
          ? accent === 'violet'
            ? 'border border-b-white border-violet-200 bg-white text-violet-900'
            : 'border border-b-white border-zinc-200 bg-white text-zinc-900'
          : 'text-zinc-500 hover:text-zinc-800',
      )}
    >
      {label}
      {count > 0 ? (
        <span
          className={cn(
            'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
            active
              ? accent === 'violet'
                ? 'bg-violet-100 text-violet-800'
                : 'bg-orange-100 text-orange-800'
              : 'bg-zinc-100 text-zinc-600',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  )
}

function SectionHead({
  step,
  title,
  required,
  hint,
}: {
  step: number
  title: string
  required?: boolean
  hint?: string
}) {
  return (
    <div className="border-b border-zinc-100 px-5 py-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-zinc-900 text-[11px] font-bold text-white">
          {step}
        </span>
        {title}
        {required ? <RequiredMark /> : null}
      </h3>
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{hint}</p> : null}
    </div>
  )
}

function RequiredMark() {
  return (
    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
      必填
    </span>
  )
}

function PhasePill({ job }: { job: IceBatchJob }) {
  const phase = job.phase
  const label = jobPhaseLabel(job)
  const modeTag =
    job.mixProduceMode === 'smart_batch'
      ? '智能'
      : job.exportId || phase === 'pipeline' || phase === 'polling' || phase === 'done' || phase === 'failed'
        ? '普通'
        : null
  return (
    <span className="flex shrink-0 items-center gap-1">
      {modeTag ? (
        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">
          {modeTag}
        </span>
      ) : null}
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-medium',
          phase === 'done' && 'bg-emerald-100 text-emerald-800',
          phase === 'failed' && 'bg-red-100 text-red-800',
          isIceSourceMaterialJob(job) && 'bg-sky-100 text-sky-800',
          phase === 'pending' && !isIceSourceMaterialJob(job) && 'bg-zinc-100 text-zinc-700',
          (phase === 'pipeline' || phase === 'polling') && 'bg-amber-100 text-amber-900',
        )}
      >
        {label}
      </span>
    </span>
  )
}

function ConfigFootnote({ cfg }: { cfg: AliyunIceCloudConfig | null }) {
  if (!cfg) return null
  return (
    <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
      灵祺AI混剪由智能媒体服务提供算力；凭据由运营在管控台维护。
      {cfg.regionId ? ` 地域 ${cfg.regionId}。` : ''}
      {cfg.localUploadEnabled ? (
        <span className="mt-1 block text-zinc-600">
          本地上传写入 OSS 的 source/ 目录，混剪完成后在右侧下载成片。
        </span>
      ) : null}
      {!cfg.hasOssOutput && !cfg.hasVodOutput && cfg.configured ? (
        <span className="mt-1 block text-amber-700">
          运营还需配置点播存储或 OSS 输出前缀，否则无法生成成片。
        </span>
      ) : null}
    </p>
  )
}
