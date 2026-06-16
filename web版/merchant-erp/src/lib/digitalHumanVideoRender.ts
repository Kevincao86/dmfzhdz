/**
 * 数字人口播高清 MP4：千问 wan2.2-s2v 口型驱动（人像 + TTS 音频）。
 */
import type { DigitalHumanDraft, DigitalHumanWork } from './digitalHumanBroadcast'
import { findPresetAvatarForDraft } from './digitalHumanBroadcast'
import { assertBlobLooksLikeVideo, concatVideoSegmentsToMp4 } from './concatVideoSegments'
import {
  chunkScriptForS2vVideo,
  synthesizeDigitalHumanNarration,
} from './digitalHumanRenderAudio'
import { imageUrlToPureBase64, normalizePortraitBase64ForS2v } from './videoFrameUtils'
import {
  concatVideoBlobsOnServer,
  concatVideoUrlsOnServer,
  downloadVideoUrlAsBlob,
  fetchSeedanceVideoStatus,
  fetchVideoAiConfig,
  postSeedanceVideoStart,
  type VideoAiBackendConfig,
} from '../services/videoAiApi'
import { isArkQuotaHopableError } from './arkModelCatalog'

const POLL_MS = 4500
const POLL_MAX = 200
/** 旧 estimateDhSegmentCount 兼容 smoke 脚本 */
const CHARS_PER_SEGMENT = 35
const MAX_DH_SEGMENTS = 20
const MAX_S2V_SEGMENTS = 12

export type DhVideoEngine = 'seedance' | 'kling'
export type DhVideoProvider = 'qwen' | 'ark' | 'kling'

export type DhRenderProgress = {
  phase: 'planning' | 'generating' | 'merging' | 'audio'
  segmentIndex: number
  segmentTotal: number
  progress: number
}

export type DhRenderResult =
  | {
      ok: true
      outputMp4Url: string
      outputBlob: Blob
      segmentCount: number
      engine: DhVideoEngine
      videoProvider: DhVideoProvider
      plannerModel: 'doubao' | 'qwen'
    }
  | { ok: false; message: string }

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}

async function blobToPureBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function estimateDhS2vSegmentCount(script: string): number {
  const chunks = chunkScriptForS2vVideo(script.trim())
  return Math.min(MAX_S2V_SEGMENTS, Math.max(1, chunks.length))
}

export function estimateDhSegmentCount(script: string): number {
  const len = script.trim().length
  if (len <= CHARS_PER_SEGMENT) return 1
  return Math.min(MAX_DH_SEGMENTS, Math.max(2, Math.ceil(len / CHARS_PER_SEGMENT)))
}

function canUseQwenS2v(cfg: VideoAiBackendConfig | null): boolean {
  return Boolean(cfg?.qwenVideoConfigured || cfg?.longformPlanner?.qwen)
}

async function resolveAvatarBase64(draft: DigitalHumanDraft): Promise<string | null> {
  let raw: string | null = null
  if (draft.customAvatarDataUrl?.trim()) {
    try {
      raw = await imageUrlToPureBase64(draft.customAvatarDataUrl)
    } catch {
      return null
    }
  } else {
    const avatar = findPresetAvatarForDraft(draft)
    if (!avatar?.previewUrl) return null
    try {
      raw = await imageUrlToPureBase64(avatar.previewUrl)
    } catch {
      return null
    }
  }
  if (!raw) return null
  try {
    return await normalizePortraitBase64ForS2v(raw)
  } catch (e) {
    throw new Error(
      e instanceof Error ? e.message : '人像图片无法用于口型驱动，请换一张更清晰的正面照片',
    )
  }
}

async function waitSeedanceVideo(taskId: string): Promise<string> {
  let transientErrors = 0
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL_MS)
    const st = await fetchSeedanceVideoStatus(taskId)
    if (!st.ok) {
      if (isArkQuotaHopableError(st.message) && transientErrors < 15) {
        transientErrors++
        continue
      }
      throw new Error(st.message)
    }
    transientErrors = 0
    if (st.phase === 'succeeded' && st.videoUrl) return st.videoUrl
    if (st.phase === 'failed') throw new Error(st.failReason ?? '千问口型视频生成失败')
  }
  throw new Error('千问口型视频生成超时，请稍后重试')
}

function assertSegmentBlob(blob: Blob, index: number): void {
  if (blob.size < 1024) {
    throw new Error(`第 ${index + 1} 段视频过小（${blob.size} 字节），请重新生成`)
  }
}

async function mergeSegmentVideos(blobs: Blob[], sourceUrls: string[]): Promise<Blob> {
  for (let i = 0; i < blobs.length; i++) {
    await assertBlobLooksLikeVideo(blobs[i]!, `第 ${i + 1} 段`)
    assertSegmentBlob(blobs[i]!, i)
  }
  if (blobs.length === 1) return blobs[0]!

  const urls = sourceUrls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u))
  const errors: string[] = []

  if (urls.length >= blobs.length) {
    try {
      return await concatVideoUrlsOnServer(urls)
    } catch (e) {
      errors.push(`URL 云端：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  try {
    return await concatVideoSegmentsToMp4(blobs)
  } catch (e) {
    errors.push(`浏览器：${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    return await concatVideoBlobsOnServer(blobs)
  } catch (e) {
    errors.push(`Blob 云端：${e instanceof Error ? e.message : String(e)}`)
  }

  throw new Error(errors.join('；') || '多段合并失败')
}

async function renderWithQwenS2v(
  draft: DigitalHumanDraft,
  onProgress?: (p: DhRenderProgress) => void,
): Promise<DhRenderResult> {
  const script = draft.script.trim()
  let avatarB64: string | null = null
  try {
    avatarB64 = await resolveAvatarBase64(draft)
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : '人像图片无法用于口型驱动',
    }
  }
  if (!avatarB64) {
    return {
      ok: false,
      message: '口型驱动需要清晰正面人像：请选择预置形象或上传正面照片后重试。',
    }
  }

  const scriptChunks = chunkScriptForS2vVideo(script)
  const segmentTotal = scriptChunks.length
  const resolution: '480P' | '720P' = '720P'
  const blobs: Blob[] = []
  const sourceUrls: string[] = []

  for (let i = 0; i < scriptChunks.length; i++) {
    const chunkText = scriptChunks[i]!

    onProgress?.({
      phase: 'audio',
      segmentIndex: i + 1,
      segmentTotal,
      progress: 10 + Math.round((i / segmentTotal) * 20),
    })

    const narration = await synthesizeDigitalHumanNarration(draft, chunkText)
    if (!narration.ok) {
      return {
        ok: false,
        message: `口播音频第 ${i + 1}/${segmentTotal} 段合成失败：${narration.message}`,
      }
    }

    onProgress?.({
      phase: 'generating',
      segmentIndex: i + 1,
      segmentTotal,
      progress: 32 + Math.round((i / segmentTotal) * 52),
    })

    const audioB64 = await blobToPureBase64(narration.audioBlob)
    const r = await postSeedanceVideoStart({
      pipeline: 'wan_s2v',
      image_base64: avatarB64,
      audio_base64: audioB64,
      resolution,
    })
    if (!r.ok) {
      return { ok: false, message: `第 ${i + 1}/${segmentTotal} 段口型驱动失败：${r.message}` }
    }

    try {
      const url = await waitSeedanceVideo(r.taskId)
      let blob: Blob | null = null
      for (let d = 0; d < 4; d++) {
        if (d > 0) await sleep(2000 * d)
        try {
          const candidate = await assertBlobLooksLikeVideo(
            await downloadVideoUrlAsBlob(url),
            `千问口型第 ${i + 1} 段`,
          )
          if (candidate.size >= 1024) {
            blob = candidate
            break
          }
        } catch {
          /* 下载重试 */
        }
      }
      if (!blob) {
        return { ok: false, message: `第 ${i + 1}/${segmentTotal} 段口型视频为空，请重试` }
      }
      blobs.push(blob)
      sourceUrls.push(url)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, message: `第 ${i + 1}/${segmentTotal} 段口型驱动失败：${msg}` }
    }
  }

  onProgress?.({ phase: 'merging', segmentIndex: segmentTotal, segmentTotal, progress: 88 })

  let finalBlob: Blob
  try {
    finalBlob = await mergeSegmentVideos(blobs, sourceUrls)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `多段合并失败：${msg}` }
  }

  const outputMp4Url = URL.createObjectURL(finalBlob)
  onProgress?.({ phase: 'merging', segmentIndex: segmentTotal, segmentTotal, progress: 100 })

  return {
    ok: true,
    outputMp4Url,
    outputBlob: finalBlob,
    segmentCount: segmentTotal,
    engine: 'seedance',
    videoProvider: 'qwen',
    plannerModel: 'qwen',
  }
}

export async function renderDigitalHumanMp4(
  work: DigitalHumanWork,
  onProgress?: (p: DhRenderProgress) => void,
): Promise<DhRenderResult> {
  const draft = work.draft
  const script = draft.script.trim()
  if (script.length < 8) {
    return { ok: false, message: '口播文案过短，请先填写至少 8 个字' }
  }

  const cfg = await fetchVideoAiConfig()
  if (cfg?.configLoadError) {
    return {
      ok: false,
      message: `视频 AI 配置拉取失败：${cfg.configLoadError}。请确认 /erp-api/meoo-merchant-ai-video-config 可达后重试。`,
    }
  }

  if (!canUseQwenS2v(cfg)) {
    return {
      ok: false,
      message:
        '数字人口播需通义千问：请在运营台配置 MERCHANT_AI_QWEN_KEY 或 DASHSCOPE_API_KEY，并填写云剪 OSS 前缀（口型驱动上传人像/音频）。',
    }
  }

  return renderWithQwenS2v(draft, onProgress)
}

/** 触发浏览器下载高清 MP4 */
export async function downloadDigitalHumanMp4(work: DigitalHumanWork): Promise<{ ok: boolean; message?: string }> {
  const name = `${work.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 48)}.mp4`

  if (work.outputBlobUrl?.startsWith('blob:')) {
    const a = document.createElement('a')
    a.href = work.outputBlobUrl
    a.download = name
    a.click()
    return { ok: true }
  }

  const remote = work.outputMp4Url?.trim()
  if (!remote) {
    return { ok: false, message: '暂无成片，请等待渲染完成或重新提交' }
  }

  if (remote.startsWith('blob:')) {
    const a = document.createElement('a')
    a.href = remote
    a.download = name
    a.click()
    return { ok: true }
  }

  try {
    const blob = await downloadVideoUrlAsBlob(remote)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '下载失败' }
  }
}

export function resolveWorkPreviewVideoUrl(work: DigitalHumanWork): string | null {
  if (work.outputBlobUrl?.trim()) return work.outputBlobUrl.trim()
  if (work.outputMp4Url?.trim()) return work.outputMp4Url.trim()
  return null
}
