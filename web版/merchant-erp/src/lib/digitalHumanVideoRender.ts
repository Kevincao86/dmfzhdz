/**
 * 数字人口播高清 MP4：千问 wan2.2-s2v 口型驱动（图+TTS 音频），可灵兜底。
 */
import type { DigitalHumanDraft, DigitalHumanWork, PresetAvatar } from './digitalHumanBroadcast'
import {
  backgroundPromptForDraft,
  findPresetAvatarForDraft,
  GESTURE_PRESETS,
  useAvatarReferenceForFirstSegment,
} from './digitalHumanBroadcast'
import { assertBlobLooksLikeVideo, concatVideoSegmentsToMp4 } from './concatVideoSegments'
import {
  chunkScriptForS2vVideo,
  synthesizeDigitalHumanNarration,
} from './digitalHumanRenderAudio'
import { extractVideoLastFramePureBase64, imageUrlToPureBase64 } from './videoFrameUtils'
import {
  concatVideoBlobsOnServer,
  concatVideoUrlsOnServer,
  downloadVideoUrlAsBlob,
  fetchSeedanceVideoStatus,
  fetchVideoAiConfig,
  postSeedanceVideoStart,
  type VideoAiBackendConfig,
} from '../services/videoAiApi'
import { isArkQuotaHopableError, isQwenVideoModelHopableError } from './arkModelCatalog'
import { KLING_DEFAULT_MODEL_ID } from './shortVideoUiLabels'

/** Seedance 1.5 Pro API 限制 duration ∈ [3, 4.5]；10 秒会在图生续段时报错 */
const SEEDANCE_SEGMENT_DURATION_SEC = 4
/** 可灵 std 常用 5/10 秒；与 Seedance 段长接近便于多段拼接 */
const KLING_SEGMENT_DURATION_SEC = 5
const POLL_MS = 4500
const POLL_MAX = 200
/** 约 8.8 字/秒 × Seedance 段长 */
const CHARS_PER_SEGMENT = 35
const MAX_DH_SEGMENTS = 20

function isSeedanceModelHopableError(msg: string): boolean {
  return (
    isArkQuotaHopableError(msg) ||
    isQwenVideoModelHopableError(msg) ||
    /duration customization is not supported|duration must be in/i.test(msg)
  )
}

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

const MAX_S2V_SEGMENTS = 12

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}

export function estimateDhSegmentCount(script: string): number {
  const len = script.trim().length
  if (len <= CHARS_PER_SEGMENT) return 1
  return Math.min(MAX_DH_SEGMENTS, Math.max(2, Math.ceil(len / CHARS_PER_SEGMENT)))
}

function pickEngine(cfg: VideoAiBackendConfig | null): DhVideoEngine | null {
  if (cfg?.qwenVideoConfigured) return 'seedance'
  if (cfg?.klingConfigured) return 'kling'
  if (cfg?.arkKeyConfigured && cfg.arkVideoModels.length > 0) return 'seedance'
  return null
}

function canUseQwenS2v(cfg: VideoAiBackendConfig | null): boolean {
  return Boolean(cfg?.qwenVideoConfigured || cfg?.longformPlanner?.qwen)
}

function useQwenVideoOnly(cfg: VideoAiBackendConfig | null): boolean {
  return canUseQwenS2v(cfg)
}

function pickPlanner(cfg: VideoAiBackendConfig | null): 'doubao' | 'qwen' | 'auto' {
  if (cfg?.qwenVideoConfigured) return 'qwen'
  const lp = cfg?.longformPlanner
  if (lp?.doubao && lp?.qwen) return 'auto'
  if (lp?.doubao) return 'doubao'
  if (lp?.qwen) return 'qwen'
  return 'auto'
}

const SEEDANCE_SERVER_AUTO = '__server_auto__'

/** 千问-only 时仅走服务端千问；否则方舟 ep 列表 + 服务端自动轮询 */
function listSeedanceModelCandidates(cfg: VideoAiBackendConfig | null): string[] {
  if (useQwenVideoOnly(cfg)) return [SEEDANCE_SERVER_AUTO]
  const out: string[] = []
  for (const m of cfg?.arkVideoModels ?? []) {
    const id = m.endpointId?.trim()
    if (id && !out.includes(id)) out.push(id)
  }
  out.push(SEEDANCE_SERVER_AUTO)
  return out
}

function seedanceStartPayload(
  prompt: string,
  frameB64: string | null,
  seedanceFlags: string,
  model?: string,
  preferQwen?: boolean,
) {
  const images =
    frameB64 != null ? [`data:image/jpeg;base64,${frameB64.replace(/\s/g, '')}`] : undefined
  return {
    ...(model ? { model } : {}),
    ...(preferQwen ? { prefer_provider: 'qwen' as const } : {}),
    prompt,
    flags: seedanceFlags,
    images_base64: images,
  }
}

function gesturePrompt(draft: DigitalHumanDraft): string {
  if (draft.motionInstructions.trim()) return draft.motionInstructions.trim()
  const g = GESTURE_PRESETS.find((x) => x.id === draft.gesturePreset)
  return g && g.id !== 'none' ? `手势：${g.label}` : '自然讲解手势'
}

function buildOverallPrompt(draft: DigitalHumanDraft, avatar: PresetAvatar | null): string {
  const script = draft.script.trim()
  const who = avatar ? `${avatar.name}（${avatar.tag}）` : '数字人主播'
  const frame = draft.frameMode === 'full' ? '全身' : '半身'
  const bg = backgroundPromptForDraft(draft)
  return [
    `竖屏 9:16 高清数字人口播短视频，主播 ${who}，${draft.outfit}，${frame}出镜，${bg}。`,
    gesturePrompt(draft),
    `完整口播文案：\n${script}`,
    `请按约 ${SEEDANCE_SEGMENT_DURATION_SEC} 秒/段拆成连贯分镜提示词，同一主播稳定出镜，口型与当段口播匹配，镜头连贯。`,
  ].join('\n')
}

function buildSingleSegmentPrompt(draft: DigitalHumanDraft, avatar: PresetAvatar | null): string {
  const who = avatar ? `${avatar.name}数字人主播` : '数字人主播'
  const frame = draft.frameMode === 'full' ? '全身' : '半身'
  const bg = backgroundPromptForDraft(draft)
  return [
    `竖屏 9:16 高清数字人口播，${who}，${draft.outfit}，${frame}出镜，${bg}。`,
    gesturePrompt(draft),
    `口播内容：${draft.script.trim().slice(0, 500)}`,
    '口型与讲解内容匹配，稳定正面镜头，自然手势。',
  ].join('\n')
}

async function resolveAvatarBase64(draft: DigitalHumanDraft): Promise<string | null> {
  if (draft.customAvatarDataUrl?.trim()) {
    try {
      return await imageUrlToPureBase64(draft.customAvatarDataUrl)
    } catch {
      return null
    }
  }
  const avatar = findPresetAvatarForDraft(draft)
  if (!avatar?.previewUrl) return null
  try {
    return await imageUrlToPureBase64(avatar.previewUrl)
  } catch {
    return null
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
    if (st.phase === 'failed') throw new Error(st.failReason ?? '豆包视频生成失败')
  }
  throw new Error('豆包视频生成超时，请稍后重试')
}

async function waitKlingVideo(taskId: string, kind: 'text2video' | 'image2video'): Promise<string> {
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL_MS)
    const st = await fetchKlingVideoStatus(taskId, kind)
    if (!st.ok) throw new Error(st.message)
    if (st.phase === 'succeeded' && st.videoUrl) return st.videoUrl
    if (st.phase === 'failed') throw new Error(st.taskStatus ?? '可灵视频生成失败')
  }
  throw new Error('可灵视频生成超时，请稍后重试')
}

type SegmentVideo = { blob: Blob; sourceUrl: string }

async function generateKlingSegment(
  prompt: string,
  frameB64: string | null,
): Promise<SegmentVideo> {
  if (frameB64) {
    const r = await postKlingVideoStart({
      kind: 'image2video',
      prompt,
      duration: KLING_SEGMENT_DURATION_SEC,
      aspect_ratio: '9:16',
      mode: 'std',
      image_base64: frameB64.replace(/\s/g, ''),
      model_name: KLING_DEFAULT_MODEL_ID,
    })
    if (!r.ok) throw new Error(r.message)
    const url = await waitKlingVideo(r.taskId, r.pollKind)
    const blob = await assertBlobLooksLikeVideo(
      await downloadVideoUrlAsBlob(url),
      '可灵第 1 段',
    )
    if (blob.size < 1024) throw new Error('可灵返回的视频为空，请重试')
    return { sourceUrl: url, blob }
  }

  const r = await postKlingVideoStart({
    kind: 'text2video',
    prompt,
    duration: KLING_SEGMENT_DURATION_SEC,
    aspect_ratio: '9:16',
    mode: 'std',
    model_name: KLING_DEFAULT_MODEL_ID,
  })
  if (!r.ok) throw new Error(r.message)
  const url = await waitKlingVideo(r.taskId, r.pollKind)
  const blob = await assertBlobLooksLikeVideo(await downloadVideoUrlAsBlob(url), '可灵成片')
  if (blob.size < 1024) throw new Error('可灵返回的视频为空，请重试')
  return { sourceUrl: url, blob }
}

async function generateSeedanceSegmentWithFailover(opts: {
  prompt: string
  frameB64: string | null
  seedanceModels: string[]
  seedanceFlags: string
  preferQwen?: boolean
}): Promise<SegmentVideo> {
  const { prompt, frameB64, seedanceModels, seedanceFlags, preferQwen } = opts
  let lastErr = preferQwen ? '千问视频生成失败' : '豆包视频生成失败'
  for (const model of seedanceModels) {
    const modelId = model === SEEDANCE_SERVER_AUTO ? undefined : model
    try {
      const r = await postSeedanceVideoStart(
        seedanceStartPayload(prompt, frameB64, seedanceFlags, modelId, preferQwen),
      )
      if (!r.ok) {
        lastErr = r.message
        if (isSeedanceModelHopableError(r.message)) continue
        throw new Error(r.message)
      }
      const url = await waitSeedanceVideo(r.taskId)
      let blob: Blob | null = null
      let lastDlErr = preferQwen ? '千问返回的视频为空，请重试' : '豆包返回的视频为空，请重试'
      for (let d = 0; d < 4; d++) {
        if (d > 0) await sleep(2000 * d)
        try {
          const candidate = await assertBlobLooksLikeVideo(
            await downloadVideoUrlAsBlob(url),
            preferQwen ? '千问成片' : '豆包成片',
          )
          if (candidate.size >= 1024) {
            blob = candidate
            break
          }
          lastDlErr = `${preferQwen ? '千问' : '豆包'}返回的视频为空（${candidate.size} 字节）`
        } catch (e) {
          lastDlErr = e instanceof Error ? e.message : String(e)
        }
      }
      if (!blob) throw new Error(lastDlErr)
      return { sourceUrl: url, blob }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastErr = msg
      if (isSeedanceModelHopableError(msg)) continue
      throw e instanceof Error ? e : new Error(msg)
    }
  }
  throw new Error(
    preferQwen
      ? `${lastErr}。请检查百炼通义千问 Key 与视频模型额度后重试。`
      : `${lastErr}。已轮询豆包/千问同类视频模型仍失败，请稍后重试或检查方舟/百炼额度。`,
  )
}

async function generateOneSegment(opts: {
  engine: DhVideoEngine
  cfg: VideoAiBackendConfig | null
  prompt: string
  frameB64: string | null
  seedanceModels: string[]
  seedanceFlags: string
  preferQwen?: boolean
}): Promise<SegmentVideo> {
  const { engine, cfg, prompt, frameB64, seedanceModels, seedanceFlags, preferQwen } = opts

  if (engine === 'seedance') {
    try {
      return await generateSeedanceSegmentWithFailover({
        prompt,
        frameB64,
        seedanceModels,
        seedanceFlags,
        preferQwen,
      })
    } catch (e) {
      if (cfg?.klingConfigured) {
        const msg = e instanceof Error ? e.message : String(e)
        if (isArkQuotaHopableError(msg) || /仍失败|额度|502|503|429/i.test(msg)) {
          return generateKlingSegment(prompt, frameB64)
        }
      }
      throw e
    }
  }

  return generateKlingSegment(prompt, frameB64)
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

/** 千问 wan2.2-s2v：先 TTS 再按音频驱动口型（成片已含音轨，无需再 mux） */
async function renderWithQwenS2v(
  draft: DigitalHumanDraft,
  onProgress?: (p: DhRenderProgress) => void,
): Promise<DhRenderResult> {
  const script = draft.script.trim()
  const avatarB64 = await resolveAvatarBase64(draft)
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
