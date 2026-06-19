/**
 * 数字人口播高清 MP4：千问 wan2.2-s2v 口型驱动（人像 + TTS 音频）。
 */
import type { DigitalHumanDraft, DigitalHumanWork } from './digitalHumanBroadcast'
import { findPresetAvatarForDraft, loadWorkProductImageDataUrl, s2vResolutionFromDraft } from './digitalHumanBroadcast'
import { assertBlobLooksLikeVideo, concatAudioMp3Blobs, concatVideoSegmentsToMp4, muxAudioWithVideoBlob } from './concatVideoSegments'
import {
  chunkScriptForS2vVideo,
  narrationBlobToBase64,
  resolveUploadedNarrationSegments,
  synthesizeDigitalHumanNarration,
} from './digitalHumanRenderAudio'
import { imageUrlToPureBase64, normalizePortraitBase64ForS2v } from './videoFrameUtils'
import {
  concatVideoBlobsOnServer,
  concatVideoUrlsOnServer,
  downloadVideoUrlAsBlob,
  fetchVideoAiConfig,
  muxVideoAudioOnServer,
  postProcessVideoOnServer,
} from '../services/videoAiApi'
import { buildSrtContent, probeVideoDurationSec, splitSubtitleLines } from './digitalHumanSubtitle'
import { compositePortraitWithBackground } from './digitalHumanBackgroundComposite'
import { fetchDhQwenS2vStatus, postDhQwenS2vStart } from './dhQwenS2vVideoApi'
import { isArkQuotaHopableError } from './arkModelCatalog'
import {
  blobUrlIsReadable,
  loadWorkMp4Blob,
  saveWorkMp4Blob,
} from './digitalHumanWorkBlobStore'

const POLL_MS = 4500
const POLL_MAX = 200
/** 旧 estimateDhSegmentCount 兼容 smoke 脚本 */
const CHARS_PER_SEGMENT = 35
const MAX_DH_SEGMENTS = 20
const MAX_S2V_SEGMENTS = 12

export type DhVideoEngine = 'qwen_s2v'
export type DhVideoProvider = 'qwen'

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
      plannerModel: 'qwen'
    }
  | { ok: false; message: string }

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
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

function canUseQwenS2v(cfg: Awaited<ReturnType<typeof fetchVideoAiConfig>> | null): boolean {
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
    const preset = findPresetAvatarForDraft(draft)
    const frameMode =
      draft.customAvatarDataUrl?.trim()
        ? draft.frameMode === 'full'
          ? 'full'
          : 'half'
        : preset?.bodyFrame ?? (draft.frameMode === 'full' ? 'full' : 'half')
    return await compositePortraitWithBackground(
      await normalizePortraitBase64ForS2v(raw, frameMode),
      draft.background,
      frameMode,
    )
  } catch (e) {
    throw new Error(
      e instanceof Error ? e.message : '人像图片无法用于口型驱动，请换一张更清晰的正面照片',
    )
  }
}

async function waitQwenS2vVideo(taskId: string): Promise<string> {
  let transientErrors = 0
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL_MS)
    const st = await fetchDhQwenS2vStatus(taskId)
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

/** 将 TTS 口播音轨混入无声视频 MP4（优先 ECS ffmpeg，浏览器 wasm 兜底） */
async function muxNarrationIntoVideo(videoBlob: Blob, audioBlob: Blob): Promise<Blob> {
  try {
    return await muxVideoAudioOnServer(videoBlob, audioBlob)
  } catch (serverErr) {
    try {
      return await muxAudioWithVideoBlob(videoBlob, audioBlob)
    } catch (browserErr) {
      const s = serverErr instanceof Error ? serverErr.message : String(serverErr)
      const b = browserErr instanceof Error ? browserErr.message : String(browserErr)
      throw new Error(`云端合成：${s}；浏览器合成：${b}`)
    }
  }
}

async function renderWithQwenS2v(
  work: DigitalHumanWork,
  onProgress?: (p: DhRenderProgress) => void,
): Promise<DhRenderResult> {
  const draft = work.draft
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

  const resolution = s2vResolutionFromDraft(draft)
  const videoBlobs: Blob[] = []
  const audioBlobs: Blob[] = []
  const sourceUrls: string[] = []

  let segmentTotal = 0
  let audioSegments: Blob[] = []
  let scriptChunks: string[] = []

  if (draft.driveMode === 'audio') {
    const uploaded = await resolveUploadedNarrationSegments(work)
    if (!uploaded.ok) return { ok: false, message: uploaded.message }
    audioSegments = uploaded.audioBlobs
    segmentTotal = audioSegments.length
  } else {
    if (script.length < 8) {
      return { ok: false, message: '口播文案过短，请先填写至少 8 个字' }
    }
    scriptChunks = chunkScriptForS2vVideo(script)
    segmentTotal = scriptChunks.length
  }

  for (let i = 0; i < segmentTotal; i++) {
    let narrationBlob: Blob

    if (draft.driveMode === 'audio') {
      onProgress?.({
        phase: 'audio',
        segmentIndex: i + 1,
        segmentTotal,
        progress: 10 + Math.round((i / segmentTotal) * 20),
      })
      narrationBlob = audioSegments[i]!
    } else {
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
      narrationBlob = narration.audioBlob
    }

    onProgress?.({
      phase: 'generating',
      segmentIndex: i + 1,
      segmentTotal,
      progress: 32 + Math.round((i / segmentTotal) * 52),
    })

    const audioB64 = await narrationBlobToBase64(narrationBlob)
    const r = await postDhQwenS2vStart({
      image_base64: avatarB64,
      audio_base64: audioB64,
      resolution,
      frame_mode: draft.frameMode === 'full' ? 'full' : 'half',
    })
    if (!r.ok) {
      return { ok: false, message: `第 ${i + 1}/${segmentTotal} 段口型驱动失败：${r.message}` }
    }

    try {
      const url = await waitQwenS2vVideo(r.taskId)
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
      videoBlobs.push(blob)
      audioBlobs.push(narrationBlob)
      sourceUrls.push(url)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, message: `第 ${i + 1}/${segmentTotal} 段口型驱动失败：${msg}` }
    }
  }

  onProgress?.({ phase: 'merging', segmentIndex: segmentTotal, segmentTotal, progress: 88 })

  let mergedVideo: Blob
  try {
    mergedVideo = await mergeSegmentVideos(videoBlobs, sourceUrls)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `多段合并失败：${msg}` }
  }

  let narrationAudio: Blob
  try {
    narrationAudio =
      audioBlobs.length === 1 ? audioBlobs[0]! : await concatAudioMp3Blobs(audioBlobs)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `口播音频拼接失败：${msg}` }
  }

  let finalBlob: Blob
  try {
    finalBlob = await muxNarrationIntoVideo(mergedVideo, narrationAudio)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `成片音视频合成失败：${msg}` }
  }

  const wantsSubtitle = draft.subtitleEnabled && script.length >= 2
  const wantsProduct = draft.productOverlayEnabled
  const wantsMotion = draft.gesturePreset !== 'none'
  if (wantsSubtitle || wantsProduct || wantsMotion) {
    onProgress?.({ phase: 'merging', segmentIndex: segmentTotal, segmentTotal, progress: 94 })
    let srtContent: string | undefined
    if (wantsSubtitle) {
      const dur = await probeVideoDurationSec(finalBlob)
      if (dur > 0) {
        srtContent = buildSrtContent(splitSubtitleLines(script), dur)
      }
    }
    let productImageBase64: string | undefined
    if (wantsProduct) {
      try {
        const img = await loadWorkProductImageDataUrl(work)
        if (img) productImageBase64 = await imageUrlToPureBase64(img)
      } catch {
        /* 产品图可选，失败则跳过叠加 */
      }
    }
    if (srtContent?.trim() || productImageBase64 || wantsMotion) {
      try {
        finalBlob = await postProcessVideoOnServer(finalBlob, {
          srtContent,
          subtitleStyle: draft.subtitleStyle,
          productImageBase64,
          subtleMotion: wantsMotion,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, message: `成片后处理失败（字幕/产品图）：${msg}` }
      }
    } else if (wantsProduct && !productImageBase64) {
      return { ok: false, message: '已开启产品展示但未找到产品图，请返回步骤 3 上传 PNG/JPG 后重试' }
    }
  }

  const outputMp4Url = URL.createObjectURL(finalBlob)
  onProgress?.({ phase: 'merging', segmentIndex: segmentTotal, segmentTotal, progress: 100 })

  return {
    ok: true,
    outputMp4Url,
    outputBlob: finalBlob,
    segmentCount: segmentTotal,
    engine: 'qwen_s2v',
    videoProvider: 'qwen',
    plannerModel: 'qwen',
  }
}

export async function renderDigitalHumanMp4(
  work: DigitalHumanWork,
  onProgress?: (p: DhRenderProgress) => void,
): Promise<DhRenderResult> {
  const draft = work.draft
  if (draft.driveMode !== 'audio' && draft.script.trim().length < 8) {
    return { ok: false, message: '口播文案过短，请先填写至少 8 个字' }
  }
  if (draft.driveMode === 'audio' && !work.hasLocalCustomAudio) {
    return {
      ok: false,
      message: '音频驱动模式需要先上传口播音频。请返回步骤 2 选择 MP3/WAV/M4A 后重新提交。',
    }
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
        '数字人口播需通义千问：请在运营台配置 MERCHANT_AI_QWEN_KEY 或 DASHSCOPE_API_KEY，并填写云剪 OSS 前缀（口型驱动上传人像/音频）。额度不足时将自动切换千问口型模型池。',
    }
  }

  return renderWithQwenS2v(work, onProgress)
}

/** 解析作品成片 Blob：IndexedDB → 有效 blob: URL → 远端 HTTPS */
export async function resolveWorkMp4Blob(work: DigitalHumanWork): Promise<Blob | null> {
  const fromStore = await loadWorkMp4Blob(work.id)
  if (fromStore) return fromStore

  const blobUrl = work.outputBlobUrl?.trim()
  if (blobUrl?.startsWith('blob:') && (await blobUrlIsReadable(blobUrl))) {
    try {
      const b = await fetch(blobUrl).then((r) => r.blob())
      if (b.size >= 1024) return b
    } catch {
      /* fall through */
    }
  }

  const remote = work.outputMp4Url?.trim()
  if (remote && /^https?:\/\//i.test(remote)) {
    try {
      return await downloadVideoUrlAsBlob(remote)
    } catch {
      return null
    }
  }

  return null
}

export function resolveWorkPreviewVideoUrl(work: DigitalHumanWork): string | null {
  const blobUrl = work.outputBlobUrl?.trim()
  if (blobUrl?.startsWith('blob:')) return blobUrl
  const remote = work.outputMp4Url?.trim()
  if (remote && /^https?:\/\//i.test(remote)) return remote
  return null
}

/** 预览用 object URL（调用方应在关闭预览后 revoke） */
export async function createWorkPreviewObjectUrl(work: DigitalHumanWork): Promise<string | null> {
  const existing = resolveWorkPreviewVideoUrl(work)
  if (existing?.startsWith('blob:') && (await blobUrlIsReadable(existing))) return existing
  if (existing?.startsWith('http')) return existing

  const blob = await resolveWorkMp4Blob(work)
  if (!blob) return null
  return URL.createObjectURL(blob)
}

/** 渲染完成后持久化成片（IndexedDB + 本会话 blob URL） */
export async function persistCompletedWorkMp4(
  workId: string,
  blob: Blob,
): Promise<{ blobUrl: string; hasLocalMp4: true }> {
  await saveWorkMp4Blob(workId, blob)
  return { blobUrl: URL.createObjectURL(blob), hasLocalMp4: true }
}

/** 触发浏览器下载高清 MP4 */
export async function downloadDigitalHumanMp4(work: DigitalHumanWork): Promise<{ ok: boolean; message?: string }> {
  const name = `${work.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 48)}.mp4`

  const blob = await resolveWorkMp4Blob(work)
  if (blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return { ok: true }
  }

  const staleBlob = work.outputBlobUrl?.trim()
  if (staleBlob?.startsWith('blob:')) {
    return {
      ok: false,
      message: '本地成片已过期（页面刷新后 blob 链接失效）。请点击「再编辑」重新提交渲染。',
    }
  }

  if (!work.outputMp4Url?.trim() && !work.hasLocalMp4) {
    return { ok: false, message: '暂无成片，请等待渲染完成或重新提交' }
  }

  return {
    ok: false,
    message: '找不到本地成片文件。请点击「再编辑」重新提交渲染以生成带口播音频的 MP4。',
  }
}
