import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Download,
  ExternalLink,
  Film,
  ImagePlus,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '../cn'
import {
  fetchIceExportPreviewUrl,
  iceJobDownloadProxyPath,
  downloadIceExportFile,
  fetchAliyunIceCloudConfig,
  fetchIceJobStatus,
  ICE_ASPECT_PRESETS,
  postIcePipeline,
  uploadIceLocalMediaFile,
  type IceBatchJob,
  type AliyunIceCloudConfig,
} from '../services/aliyunIceCloudApi'
import { ICE_EFFECT_PRESETS } from '../lib/iceEffectPresets'
import { dispatchIceBatchToRecruitmentOps } from '../lib/iceRecruitmentDispatch'
import {
  readIceDispatchTrack,
  writeIceDispatchTrack,
} from '../lib/iceDispatchSlotProgress'
import { IceDispatchProgressPanel } from './IceDispatchProgressPanel'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { composeIceEditBrief, splitIceEditBrief } from '../lib/iceEditBriefCompose'
import { generateIceEditBriefAi } from '../services/iceEditBriefAi'
import { compressIceImageForUpload, ICE_LOCAL_IMAGE_MAX_BYTES } from '../lib/iceImageUploadCompress'
import { findInvalidIcePipelineImageUrl } from '../lib/icePipelineImageUrl'
import { snapshotUploadFiles, isUploadImageFile } from '../lib/iceUploadFileSnapshot'
import { MpAddonPointsRateBadge } from './MpAddonPointsRateBadge'
import { readMpSessionToken } from '../lib/merchantApiAuth'
import {
  checkMpAddonPointsAffordable,
  formatMpAddonPointsSpendHint,
  spendMpAddonPoints,
} from '../services/mpAddonPointsSpendClient'

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

export function ShortVideoIceBatchPanel({ lastResultUrl }: Props) {
  const [cfg, setCfg] = useState<AliyunIceCloudConfig | null>(null)
  const [urlText, setUrlText] = useState('')
  const [imageUrlText, setImageUrlText] = useState('')
  const [imageItems, setImageItems] = useState<IceImageItem[]>([])
  const [editCopy, setEditCopy] = useState('')
  const [editInstruction, setEditInstruction] = useState('')
  const [jobs, setJobs] = useState<IceBatchJob[]>([])
  const [oneClickBusy, setOneClickBusy] = useState(false)
  const [batchBusy, setBatchBusy] = useState(false)
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [videoUploading, setVideoUploading] = useState(false)
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
  const [briefAiLoading, setBriefAiLoading] = useState(false)
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
  const [preset, setPreset] = useState('无附加特效')
  const [batchGenerateEnabled, setBatchGenerateEnabled] = useState(false)
  const [batchGenerateCount, setBatchGenerateCount] = useState<IceBatchGenerateCount>(10)
  const [dispatchTalent, setDispatchTalent] = useState(false)
  const [dispatchBusy, setDispatchBusy] = useState(false)
  const [dispatchedOrderId, setDispatchedOrderId] = useState<string | null>(null)

  const aspect = useMemo(
    () => ICE_ASPECT_PRESETS.find((a) => a.id === aspectId) ?? ICE_ASPECT_PRESETS[0],
    [aspectId],
  )

  const presetOptions = cfg?.effectOptions?.map((o) => o.label) ??
    cfg?.presets ??
    ICE_EFFECT_PRESETS.map((p) => p.label)

  const pendingCount = jobs.filter((j) => j.phase === 'pending' || j.phase === 'failed').length
  const effectiveBatchCount = batchGenerateEnabled ? batchGenerateCount : 1
  const imageBatchRuns =
    batchGenerateEnabled && imageItems.length > 0 ? batchGenerateCount : 0
  const totalBatchRuns = pendingCount * effectiveBatchCount + imageBatchRuns
  const doneJobs = jobs.filter((j) => j.phase === 'done')
  const latestDone = doneJobs.length > 0 ? doneJobs[doneJobs.length - 1] : null
  const composedBrief = composeIceEditBrief(editCopy, editInstruction)

  const ensureCloudEditAffordable = useCallback(async (): Promise<boolean> => {
    const afford = await checkMpAddonPointsAffordable('cloud_edit', clipEndSec)
    if (afford.ok || afford.skipped) return true
    setErr(afford.message)
    return false
  }, [clipEndSec])

  const appendIcePointsCharge = useCallback(
    async (iceJobId: string, baseMessage: string): Promise<string> => {
      try {
        const charge = await spendMpAddonPoints({
          kind: 'cloud_edit',
          durationSec: clipEndSec,
          idempotencyKey: `cloud_edit:${iceJobId}`,
          note: `cloud_edit:${iceJobId}`,
        })
        if (charge) {
          return baseMessage + formatMpAddonPointsSpendHint('cloud_edit', charge, clipEndSec)
        }
      } catch {
        /* ignore charge errors */
      }
      return baseMessage
    },
    [clipEndSec],
  )
  const briefOk = editCopy.trim().length >= 2 || editInstruction.trim().length >= 4
  const mediaBusy = videoUploading || imageUploading
  const anyBusy = oneClickBusy || batchBusy
  const canSubmit =
    cfg?.configured &&
    briefOk &&
    !batchBusy &&
    !mediaBusy &&
    (pendingCount > 0 || imageBatchRuns > 0)
  const canOneClickImages =
    cfg?.configured && imageItems.length > 0 && briefOk && !oneClickBusy && !batchBusy && !mediaBusy
  const canAiBrief =
    !anyBusy &&
    !mediaBusy &&
    !briefAiLoading &&
    (imageItems.length > 0 || jobs.some((j) => !j.imageUrls?.length))

  useEffect(() => {
    void fetchAliyunIceCloudConfig().then((c) => {
      setCfg(c)
      if (c?.presets?.[0]) setPreset(c.presets[0])
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

  const addUrlsFromText = useCallback(() => {
    const urls = parseUrlLines(urlText)
    if (urls.length === 0) {
      setErr('请粘贴至少一条公网可访问的 https 音视频地址')
      return
    }
    setErr(null)
    setJobs((prev) => [
      ...prev,
      ...urls.map((mediaUrl, i) => ({
        id: newJobId(),
        label: `素材 ${prev.length + i + 1}`,
        mediaUrl,
        phase: 'pending' as const,
      })),
    ])
    setUrlText('')
    setHint(`已加入 ${urls.length} 条素材，填写剪辑指令后即可提交`)
  }, [urlText])

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
      setVideoUploading(true)
      setErr(null)
      let added = 0
      try {
        for (const file of list) {
          if (!isVideoFile(file)) {
            setErr(`「${file.name}」不是支持的视频格式（mp4/mov 等）`)
            continue
          }
          const r = await uploadIceLocalMediaFile(file)
          if (!r.ok) {
            setErr(r.message)
            continue
          }
          setJobs((prev) => [
            ...prev,
            {
              id: newJobId(),
              label: r.label.slice(0, 40),
              mediaUrl: r.mediaUrl,
              phase: 'pending' as const,
            },
          ])
          added += 1
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : '视频上传失败')
      } finally {
        setVideoUploading(false)
      }
      if (added > 0) {
        setHint(`已上传 ${added} 个文件到 OSS 并加入队列，请填写剪辑指令后提交。`)
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
      let added = 0
      let lastFail: string | null = null
      try {
        for (let i = 0; i < snapList.length; i++) {
          const raw = snapList[i]!
          if (raw.size > ICE_LOCAL_IMAGE_MAX_BYTES) {
            lastFail = `「${raw.name}」超过 4MB，请压缩后重试`
            setImageUploadError(lastFail)
            setErr(lastFail)
            break
          }
          setImageUploadProgress({
            index: i + 1,
            total: snapList.length,
            percent: 8,
            fileName: raw.name,
            phase: 'encode',
          })
          const file = await compressIceImageForUpload(raw)
          if (file.size > ICE_LOCAL_IMAGE_MAX_BYTES) {
            lastFail = `「${raw.name}」压缩后仍超过 4MB，请换更小图片`
            setImageUploadError(lastFail)
            setErr(lastFail)
            break
          }
          setImageUploadProgress({
            index: i + 1,
            total: snapList.length,
            percent: 10,
            fileName: raw.name,
            phase: 'server',
          })
          const r = await uploadIceLocalMediaFile(file, {
            onProgress: (p) => {
              setImageUploadProgress({
                index: i + 1,
                total: snapList.length,
                percent: p.percent,
                fileName: raw.name,
                phase: p.phase,
              })
            },
          })
          if (!r.ok) {
            lastFail = r.message
            setImageUploadError(r.message)
            setErr(r.message)
            break
          }
          setImageItems((prev) => [
            ...prev,
            {
              id: newJobId(),
              label: r.label.slice(0, 32),
              mediaUrl: r.mediaUrl,
              pipelineUrl: r.timelineUrl,
              previewUrl: r.mediaUrl,
            },
          ])
          added += 1
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '图片上传失败'
        lastFail = msg
        setImageUploadError(msg)
        setErr(msg)
      } finally {
        setImageUploadProgress(null)
        setImageUploading(false)
      }
      if (added > 0) {
        setImageUploadError(null)
        setHint(`已上传 ${added} 张图片，可点「AI 生成文案」或填写剪辑指令后一键成片。`)
      } else if (lastFail) {
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

  const runAiEditBrief = useCallback(async () => {
    if (!canAiBrief) return
    const imageUrls = imageItems.map((x) => icePipelineImageUrl(x))
    const videoUrls = jobs
      .filter((j) => !j.imageUrls?.length)
      .map((j) => j.mediaUrl)
      .filter((u) => /^https?:\/\//i.test(u))
    setBriefAiLoading(true)
    setErr(null)
    setHint('正在根据素材分析发布意图并生成剪辑文案…')
    const r = await generateIceEditBriefAi({
      imageUrls,
      videoUrls,
      imageLabels: imageItems.map((x) => x.label),
      aspectLabel: aspect.label,
      clipEndSec,
      preset,
      userHint: composedBrief.trim() || undefined,
    })
    setBriefAiLoading(false)
    if (!r.ok) {
      setErr(r.message)
      return
    }
    setEditCopy(r.copy || splitIceEditBrief(r.brief).copy)
    setEditInstruction(r.instruction || splitIceEditBrief(r.brief).instruction)
    setHint('已生成文案框与指令框，请核对后提交云剪。')
  }, [canAiBrief, imageItems, jobs, aspect.label, clipEndSec, preset, composedBrief])

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

  const appendLastResult = useCallback(() => {
    const u = lastResultUrl?.trim()
    if (!u || !/^https?:\/\//i.test(u)) {
      setErr('当前没有可用的 HTTPS 成片链接')
      return
    }
    setJobs((prev) => [
      ...prev,
      { id: newJobId(), label: '上一段 AI 成片', mediaUrl: u, phase: 'pending' },
    ])
    setHint('已加入上一段生成结果')
    setErr(null)
  }, [lastResultUrl])

  const removeJob = (id: string) => setJobs((prev) => prev.filter((j) => j.id !== id))

  const patchJob = (id: string, patch: Partial<IceBatchJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)))
  }

  const resumePollJob = async (localJobId: string, iceJobId: string) => {
    patchJob(localJobId, { phase: 'polling', message: '继续查询云端剪辑状态…' })
    setErr(null)
    const ok = await pollJob(localJobId, iceJobId)
    if (ok) setHint('成片已就绪，可在右侧下载。')
  }

  const pollJob = async (localJobId: string, iceJobId: string): Promise<boolean> => {
    for (let i = 0; i < POLL_MAX; i++) {
      const st = await fetchIceJobStatus(iceJobId)
      if (!st.ok) {
        const transient =
          /connecttimeout|超时|继续查询|network error/i.test(st.message ?? '') ||
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
        const message = await appendIcePointsCharge(iceJobId, baseMessage)
        patchJob(localJobId, {
          phase: 'done',
          downloadUrl: iceJobDownloadProxyPath(iceJobId),
          message,
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

  const runOneClickImages = async () => {
    if (!cfg?.configured) {
      setErr('灵祺AI云剪服务未就绪')
      return
    }
    if (!briefOk) {
      setErr('请填写文案框或指令框（文案≥2字 或 指令≥4字）')
      return
    }
    if (imageItems.length === 0) {
      setErr('请先上传或粘贴至少一张图片')
      return
    }
    const imageUrls = imageItems.map((x) => icePipelineImageUrl(x))
    const invalidUrls = findInvalidIcePipelineImageUrl(imageUrls)
    if (invalidUrls) {
      setErr(invalidUrls)
      return
    }
    const localId = newJobId()
    const label = `多图合成 · ${imageItems.length} 张`
    setOneClickBusy(true)
    setErr(null)
    setHint(`正在将 ${imageItems.length} 张图片合成为一条成片…`)
    setJobs((prev) => [
      ...prev,
      {
        id: localId,
        label,
        mediaUrl: imageUrls[0]!,
        imageUrls,
        phase: 'pipeline',
        message: '多图合成 · 提交云端…',
      },
    ])
    if (!(await ensureCloudEditAffordable())) {
      patchJob(localId, { phase: 'failed', message: '积分不足，无法提交云剪' })
      setOneClickBusy(false)
      return
    }
    const pipe = await postIcePipeline({
      imageUrls,
      projectName: `灵祺AI云剪-${label}`.slice(0, 120),
      editBrief: composedBrief.trim(),
      width: aspect.width,
      height: aspect.height,
      clipEndSec,
      preset,
    })
    if (!pipe.ok) {
      patchJob(localId, { phase: 'failed', message: pipe.message })
      setOneClickBusy(false)
      return
    }
    patchJob(localId, {
      exportId: pipe.jobId,
      phase: 'polling',
      message: '多图合成 · 云端剪辑中…',
    })
    await pollJob(localId, pipe.jobId)
    setOneClickBusy(false)
    setHint('多图一键成片已提交，请在右侧下载 MP4。')
  }

  const downloadJob = async (job: IceBatchJob) => {
    if (!job.exportId) {
      setErr('缺少剪辑任务编号，请重新提交云剪')
      return
    }
    setDownloadBusy(true)
    setErr(null)
    setHint('正在从云端拉取成片…')
    try {
      await downloadIceExportFile(job.exportId, job.label)
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
    void fetchIceExportPreviewUrl(exportId)
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
  }, [latestDone?.exportId])

  const runBatch = async () => {
    if (!cfg?.configured) {
      setErr('灵祺AI云剪服务未就绪，请联系运营在管控台配置 AppId 与 AccessKey。')
      return
    }
    if (!briefOk) {
      setErr('请填写文案框（上屏字幕）或指令框（节奏/BGM/音效）。')
      return
    }
    const pending = jobs.filter((j) => j.phase === 'pending' || j.phase === 'failed')
    const imageUrls = imageItems.map((x) => icePipelineImageUrl(x))
    const invalidUrls = findInvalidIcePipelineImageUrl(imageUrls)
    if (invalidUrls) {
      setErr(invalidUrls)
      return
    }
    const runImageBatch = batchGenerateEnabled && imageUrls.length > 0
    if (pending.length === 0 && !runImageBatch) {
      setErr('请先添加视频素材到队列，或上传多图并启用批量生成')
      return
    }
    setBatchBusy(true)
    setErr(null)
    setHint(
      runImageBatch && pending.length === 0
        ? `正在批量生成 ${batchGenerateCount} 条多图成片…`
        : batchGenerateEnabled
          ? `正在批量生成 ${totalBatchRuns} 条成片…`
          : `正在提交 ${pending.length} 条单条剪辑任务…`,
    )

    const brief = composedBrief.trim()
    let runIndex = 0

    if (runImageBatch) {
      for (let copy = 0; copy < batchGenerateCount; copy++) {
        runIndex += 1
        const runLabel = `多图合成 · ${imageUrls.length} 张 · 第 ${copy + 1}/${batchGenerateCount} 条`
        const localId = newJobId()
        setJobs((prev) => [
          ...prev,
          {
            id: localId,
            label: runLabel,
            mediaUrl: imageUrls[0]!,
            imageUrls,
            phase: 'pipeline',
            message: `批量 ${runIndex}/${totalBatchRuns} · 多图提交云端…`,
          },
        ])
        if (!(await ensureCloudEditAffordable())) {
          patchJob(localId, { phase: 'failed', message: '积分不足，已停止批量提交' })
          setBatchBusy(false)
          return
        }
        const pipe = await postIcePipeline({
          imageUrls,
          projectName: `灵祺AI云剪-${runLabel}`.slice(0, 120),
          editBrief: brief,
          width: aspect.width,
          height: aspect.height,
          clipEndSec,
          preset,
        })
        if (!pipe.ok) {
          patchJob(localId, { phase: 'failed', message: pipe.message })
          continue
        }
        patchJob(localId, {
          exportId: pipe.jobId,
          phase: 'polling',
          message: `批量 ${runIndex}/${totalBatchRuns} · 云端剪辑中…`,
        })
        await pollJob(localId, pipe.jobId)
      }
    }

    for (const job of pending) {
      if (batchGenerateEnabled) {
        for (let copy = 0; copy < batchGenerateCount; copy++) {
          runIndex += 1
          const runLabel = `${job.label} · 第 ${copy + 1}/${batchGenerateCount} 条`
          const localId = newJobId()
          setJobs((prev) => [
            ...prev,
            {
              id: localId,
              label: runLabel,
              mediaUrl: job.mediaUrl,
              phase: 'pipeline',
              message: `批量 ${runIndex}/${totalBatchRuns} · 提交云端剪辑…`,
            },
          ])
          if (!(await ensureCloudEditAffordable())) {
            patchJob(localId, { phase: 'failed', message: '积分不足，已停止批量提交' })
            setBatchBusy(false)
            return
          }
          const pipe = await postIcePipeline({
            mediaUrl: job.mediaUrl,
            projectName: `灵祺AI云剪-${runLabel}`.slice(0, 120),
            editBrief: brief,
            width: aspect.width,
            height: aspect.height,
            clipEndSec,
            preset,
          })
          if (!pipe.ok) {
            patchJob(localId, { phase: 'failed', message: pipe.message })
            continue
          }
          patchJob(localId, {
            exportId: pipe.jobId,
            phase: 'polling',
            message: `批量 ${runIndex}/${totalBatchRuns} · 云端剪辑中…`,
          })
          await pollJob(localId, pipe.jobId)
        }
        patchJob(job.id, {
          phase: 'done',
          message: `已按批量设置生成 ${batchGenerateCount} 条，见右侧成片列表`,
        })
      } else {
        runIndex += 1
        patchJob(job.id, {
          phase: 'pipeline',
          message:
            pending.length > 1
              ? `单条剪辑 ${runIndex}/${pending.length} · 提交云端…`
              : '提交云端剪辑…',
        })
        if (!(await ensureCloudEditAffordable())) {
          patchJob(job.id, { phase: 'failed', message: '积分不足，无法提交云剪' })
          setBatchBusy(false)
          return
        }
        const pipe = await postIcePipeline({
          mediaUrl: job.mediaUrl,
          projectName: `灵祺AI云剪-${job.label}`.slice(0, 120),
          editBrief: brief,
          width: aspect.width,
          height: aspect.height,
          clipEndSec,
          preset,
        })
        if (!pipe.ok) {
          patchJob(job.id, { phase: 'failed', message: pipe.message })
          continue
        }
        patchJob(job.id, {
          exportId: pipe.jobId,
          phase: 'polling',
          message:
            pending.length > 1
              ? `单条剪辑 ${runIndex}/${pending.length} · 云端剪辑中…`
              : '云端剪辑中…',
        })
        await pollJob(job.id, pipe.jobId)
      }
    }

    setBatchBusy(false)
    setHint(
      batchGenerateEnabled
        ? `批量任务已处理完毕（共 ${totalBatchRuns} 条），请在右侧「成片输出」下载 MP4。`
        : `剪辑任务已提交完毕（共 ${pending.length} 条），请在右侧「成片输出」下载 MP4。`,
    )
  }

  return (
    <div className="space-y-6">
      {/* 顶栏 */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600 text-white">
              <Cloud className="h-5 w-5" />
            </span>
            灵祺AI云剪
          </h2>
          <MpAddonPointsRateBadge kind="cloud_edit" className="mt-2" />
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
            批量包装探店/带货短片：左侧填写<strong className="font-medium text-zinc-800">素材</strong>与
            <strong className="font-medium text-zinc-800">剪辑指令</strong>，提交后在右侧
            <strong className="font-medium text-zinc-800">成片输出</strong>区下载 MP4。
            {readMpSessionToken() ? (
              <span className="mt-1 block text-xs text-violet-700">
                星选账号：每条成片成功后按秒扣积分；套餐 ai_video_quota 次数优先，用尽后扣积分余额。
              </span>
            ) : null}
          </p>
        </div>
        <ServiceBadge cfg={cfg} />
      </header>

      {/* 流程指引 */}
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          { n: 1, title: '添加素材', sub: '视频队列或「多图一键成片」' },
          { n: 2, title: '填写剪辑指令', sub: '必填 · 描述风格与包装要求' },
          { n: 3, title: '提交并下载', sub: '成片出现在右侧输出区' },
        ].map((s) => (
          <li
            key={s.n}
            className="flex gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-3"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">
              {s.n}
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-900">{s.title}</p>
              <p className="text-xs text-zinc-500">{s.sub}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 xl:grid-cols-12">
        {/* 左侧：输入区 */}
        <div className="space-y-5 xl:col-span-7">
          {/* ① 素材 */}
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <SectionHead
              step={1}
              title="素材来源"
              required
              hint="视频走任务队列批量云剪；多图按顺序合成一条竖屏成片"
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
                label="多图成片"
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
                    需在运营管理后台「AI模型 → 短视频 API → 灵祺AI云剪」填写 OSS 成片 URL 前缀并保存，然后刷新本页。仍可粘贴下方
                    HTTPS 链接作为素材。
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
                    <span className="text-sm font-medium text-zinc-800">视频上传中…</span>
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

              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <span className="h-px flex-1 bg-zinc-200" />
                <span className="flex items-center gap-1">
                  <Link2 className="h-3.5 w-3.5" />
                  或使用链接
                </span>
                <span className="h-px flex-1 bg-zinc-200" />
              </div>

              <textarea
                value={urlText}
                disabled={anyBusy || mediaBusy}
                onChange={(e) => setUrlText(e.target.value)}
                placeholder={'https://your-cdn.com/shop-tour-01.mp4\nhttps://your-cdn.com/shop-tour-02.mp4'}
                className="min-h-[88px] w-full rounded-lg border border-zinc-300 px-3 py-2.5 font-mono text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={anyBusy || mediaBusy}
                  onClick={addUrlsFromText}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  加入任务队列
                </button>
                {lastResultUrl ? (
                  <button
                    type="button"
                    disabled={anyBusy || mediaBusy}
                    onClick={appendLastResult}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    使用上一段 AI 成片
                  </button>
                ) : null}
              </div>

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
                      <PhasePill phase={j.phase} />
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
                <p className="text-xs text-zinc-500">队列为空 — 添加视频素材后才能提交云剪。</p>
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
                      JPG / PNG / WebP / GIF / BMP · 单张 ≤ 4MB · 多张合成一条竖屏短视频
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
                  上传多张图片后，在下方「剪辑文案指令」中生成文案，再点「一键成片」。
                </p>
              )}
                </>
              ) : null}
            </div>
          </section>

          {/* ② 剪辑指令 */}
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
              <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-zinc-900 text-[11px] font-bold text-white">
                    2
                  </span>
                  剪辑文案与指令
                  <RequiredMark />
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                  文案框内容上屏展示；指令框控制节奏、转场、BGM 与背景音效。AI 生成会分别填入两框。
                </p>
              </div>
              <button
                type="button"
                disabled={!canAiBrief}
                onClick={() => void runAiEditBrief()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {briefAiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                AI 生成文案与指令
              </button>
            </div>
            <div className="space-y-4 px-5 pb-5 pt-4">
              <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/40 px-4 py-3">
                <p className="mb-3 text-xs font-medium text-violet-900">输出参数</p>
                <p className="mb-3 text-[11px] leading-relaxed text-violet-800/90">
                  请先确认画幅、时长与特效，再点「AI 生成文案与指令」；结果将分别填入下方两框。
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="画幅">
                    <select
                      value={aspectId}
                      disabled={anyBusy}
                      onChange={(e) => setAspectId(e.target.value as typeof aspectId)}
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm"
                    >
                      {ICE_ASPECT_PRESETS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={imageItems.length > 0 ? '生成视频时长（秒）' : '取用时长（秒）'}>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={clipEndSec}
                      disabled={anyBusy}
                      onChange={(e) => setClipEndSec(Number(e.target.value) || 10)}
                      className="w-full rounded-md border border-zinc-300 px-2 py-2 text-sm"
                    />
                  </Field>
                  <Field label="画面特效">
                    <select
                      value={preset}
                      disabled={anyBusy}
                      onChange={(e) => setPreset(e.target.value)}
                      className="w-full rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm"
                    >
                      {presetOptions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block rounded-xl border-2 border-orange-200 bg-orange-50/30 p-3 text-xs font-medium text-orange-950">
                  <span className="text-sm font-semibold">文案框</span>
                  <span className="mt-0.5 block font-normal text-orange-800/90">
                    上屏字幕 / 口播展示（观众看得见）
                  </span>
                  <textarea
                    value={editCopy}
                    disabled={anyBusy || briefAiLoading}
                    onChange={(e) => setEditCopy(e.target.value)}
                    placeholder={
                      '示例：\n「江南味道」\n「传承三十年的手工面」\n「一碗面，一座城的记忆」'
                    }
                    className="mt-2 min-h-[120px] w-full rounded-lg border border-orange-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-zinc-800 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </label>
                <label className="block rounded-xl border-2 border-violet-200 bg-violet-50/30 p-3 text-xs font-medium text-violet-950">
                  <span className="text-sm font-semibold">指令框</span>
                  <span className="mt-0.5 block font-normal text-violet-800/90">
                    剪辑节奏 / 转场 / BGM / 背景音效（不上屏）
                  </span>
                  <textarea
                    value={editInstruction}
                    disabled={anyBusy || briefAiLoading}
                    onChange={(e) => setEditInstruction(e.target.value)}
                    placeholder={
                      '示例：整体基调温暖祥和，节奏舒适；前 3 秒快切吸睛；BGM 轻快铺底；加入碗碟碰撞与市井吆喝环境音效；图片间淡入淡出转场。'
                    }
                    className={cn(
                      'mt-2 min-h-[120px] w-full rounded-lg border bg-white px-3 py-2.5 text-sm leading-relaxed text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2',
                      briefOk || !editInstruction
                        ? 'border-violet-200 focus:border-violet-500 focus:ring-violet-500/20'
                        : 'border-amber-400 focus:border-amber-500 focus:ring-amber-500/20',
                    )}
                  />
                </label>
              </div>
              {!briefOk && (editCopy.length > 0 || editInstruction.length > 0) ? (
                <p className="flex items-center gap-1 text-xs text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" />
                  请至少在文案框写 2 字，或在指令框写 4 字
                </p>
              ) : null}

              {imageItems.length > 0 ? (
                <div className="space-y-3 border-t border-violet-100 pt-4">
                  <p className="text-xs text-violet-900">
                    已选 <strong>{imageItems.length}</strong> 张图片，文案就绪后可合成一条约{' '}
                    <strong>{clipEndSec}</strong> 秒的竖屏 MP4。
                  </p>
                  <button
                    type="button"
                    disabled={!canOneClickImages}
                    onClick={() => void runOneClickImages()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300 disabled:opacity-70 sm:w-auto"
                  >
                    {oneClickBusy ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Zap className="h-5 w-5" />
                    )}
                    一键成片（{imageItems.length} 张图）
                  </button>
                  {!briefOk ? (
                    <p className="flex items-start gap-1.5 text-xs text-amber-800">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      请先填写上方剪辑文案（至少 4 字），或点击右上角「AI 生成文案」。
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>

          {/* 批量生成（可选） */}
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 px-5 py-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={batchGenerateEnabled}
                  disabled={anyBusy || mediaBusy}
                  onChange={(e) => setBatchGenerateEnabled(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
                />
                <span>
                  <span className="text-sm font-semibold text-zinc-900">启用批量生成</span>
                  <p className="mt-1 text-xs font-normal text-zinc-500">
                    未勾选时每个素材仅生成 1 条成片；勾选后按所选条数依次提交（耗时与条数成正比）。
                  </p>
                </span>
              </label>
            </div>
            <div
              className={cn(
                'flex flex-wrap gap-2 px-5 py-4 transition-opacity',
                !batchGenerateEnabled && 'pointer-events-none opacity-40',
              )}
            >
              {ICE_BATCH_GENERATE_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={anyBusy || mediaBusy || !batchGenerateEnabled}
                  onClick={() => setBatchGenerateCount(n)}
                  className={cn(
                    'rounded-lg border px-4 py-2 text-sm font-medium transition',
                    batchGenerateCount === n
                      ? 'border-orange-500 bg-orange-600 text-white shadow-sm'
                      : 'border-zinc-300 bg-white text-zinc-800 hover:border-orange-300 hover:bg-orange-50',
                    (anyBusy || mediaBusy) && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {n} 条
                </button>
              ))}
            </div>
            {totalBatchRuns > 0 ? (
              <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-600">
                {batchGenerateEnabled ? (
                  <>
                    {pendingCount > 0 ? (
                      <>
                        视频队列 {pendingCount} 个 × {batchGenerateCount} 条
                        {imageBatchRuns > 0 ? '；' : ''}
                      </>
                    ) : null}
                    {imageBatchRuns > 0 ? (
                      <>
                        多图 {imageItems.length} 张 × {batchGenerateCount} 条
                      </>
                    ) : null}
                    {' '}
                    ≈ 共提交 <strong className="text-zinc-900">{totalBatchRuns}</strong> 次云剪
                  </>
                ) : (
                  <>
                    当前队列 {pendingCount} 个素材，单条剪辑 ≈ 共提交{' '}
                    <strong className="text-zinc-900">{totalBatchRuns}</strong> 次云剪任务
                  </>
                )}
              </p>
            ) : batchGenerateEnabled && imageItems.length > 0 ? (
              <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-600">
                已上传 {imageItems.length} 张多图，勾选批量后可点下方「提交灵祺AI云剪」
              </p>
            ) : null}
          </section>

          {/* 提交 */}
          <div className="sticky bottom-4 z-10 rounded-xl border border-orange-200 bg-orange-50/90 p-4 shadow-lg backdrop-blur-sm">
            {(err || hint) && (
              <div
                className={cn(
                  'mb-3 rounded-lg px-3 py-2 text-sm',
                  err ? 'bg-red-100 text-red-900' : 'bg-white/80 text-zinc-700',
                )}
              >
                {err ?? hint}
              </div>
            )}
            <button
              type="button"
              disabled={!canSubmit || downloadBusy}
              onClick={() => void runBatch()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {batchBusy ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  灵祺AI云剪进行中…
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  提交灵祺AI云剪
                  {totalBatchRuns > 0
                    ? batchGenerateEnabled
                      ? `（约 ${totalBatchRuns} 条成片）`
                      : `（${pendingCount} 条单条剪辑）`
                    : imageItems.length > 0
                      ? '（请先勾选批量或添加视频队列）'
                      : ''}
                </>
              )}
            </button>
            <p className="mt-2 text-center text-[11px] text-zinc-600">
              提交后请在右侧「成片输出」查看进度并下载；单条任务约需数分钟。
            </p>
          </div>
        </div>

        {/* 右侧：成片输出 */}
        <aside className="xl:col-span-5">
          <section className="sticky top-4 rounded-xl border-2 border-orange-200 bg-gradient-to-b from-orange-50/80 to-white shadow-sm">
            <div className="border-b border-orange-100 px-5 py-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
                <Download className="h-5 w-5 text-orange-600" />
                成片输出
                <span className="text-xs font-normal text-zinc-500">（步骤 3）</span>
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
                      href={iceJobDownloadProxyPath(latestDone.exportId, true)}
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
                    完成左侧「素材 + 剪辑指令」后点击提交，成片将显示在此处。
                  </p>
                </div>
              )}

              {jobs.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    任务列表
                  </p>
                  <ul className="max-h-[320px] space-y-2 overflow-y-auto">
                    {jobs.map((j) => (
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
                          <PhasePill phase={j.phase} />
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
                                href={iceJobDownloadProxyPath(j.exportId, true)}
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
                              onClick={() => void resumePollJob(j.id, j.exportId!)}
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

          {batchGenerateEnabled && doneJobs.length > 0 ? (
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
                    将 {doneJobs.length} 条批量云剪成片推送至运营「商家达人招募订单」，由运营下发云剪单至达人小程序。
                  </span>
                </span>
              </label>
              {dispatchTalent ? (
                <button
                  type="button"
                  disabled={dispatchBusy || !briefOk}
                  onClick={() => {
                    void (async () => {
                      setDispatchBusy(true)
                      setErr(null)
                      try {
                        const { orderId } = await dispatchIceBatchToRecruitmentOps({
                          doneJobs,
                          editBrief: composedBrief,
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-600">
      <span>{label}</span>
      {children}
    </label>
  )
}

function PhasePill({ phase }: { phase: IceBatchJob['phase'] }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
        phase === 'done' && 'bg-emerald-100 text-emerald-800',
        phase === 'failed' && 'bg-red-100 text-red-800',
        phase === 'pending' && 'bg-zinc-100 text-zinc-700',
        (phase === 'pipeline' || phase === 'polling') && 'bg-amber-100 text-amber-900',
      )}
    >
      {PHASE_LABEL[phase]}
    </span>
  )
}

function ConfigFootnote({ cfg }: { cfg: AliyunIceCloudConfig | null }) {
  if (!cfg) return null
  return (
    <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
      灵祺AI云剪由智能媒体服务提供算力；凭据由运营在管控台维护。
      {cfg.regionId ? ` 地域 ${cfg.regionId}。` : ''}
      {cfg.localUploadEnabled ? (
        <span className="mt-1 block text-zinc-600">
          本地上传写入 OSS 的 source/ 目录，云剪完成后在右侧下载成片。
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
