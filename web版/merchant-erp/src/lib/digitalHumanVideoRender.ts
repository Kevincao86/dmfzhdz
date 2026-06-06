/**
 * 数字人口播高清 MP4：豆包 Seedance / 可灵生成，千问或豆包策划分镜，超长口播自动分段后拼接。
 */
import type { DigitalHumanDraft, DigitalHumanWork, PresetAvatar } from './digitalHumanBroadcast'
import { findPresetAvatarForDraft } from './digitalHumanBroadcast'
import { concatVideoSegmentsToMp4 } from './concatVideoSegments'
import { extractVideoLastFramePureBase64, imageUrlToPureBase64 } from './videoFrameUtils'
import {
  downloadVideoUrlAsBlob,
  fetchKlingVideoStatus,
  fetchSeedanceVideoStatus,
  fetchVideoAiConfig,
  postKlingVideoStart,
  postLongformVideoPlan,
  postSeedanceVideoStart,
  type VideoAiBackendConfig,
} from '../services/videoAiApi'
import { KLING_DEFAULT_MODEL_ID } from './shortVideoUiLabels'

const SEGMENT_DURATION_SEC = 10
const POLL_MS = 4500
const POLL_MAX = 200
const CHARS_PER_SEGMENT = 88

export type DhVideoEngine = 'seedance' | 'kling'

export type DhRenderProgress = {
  phase: 'planning' | 'generating' | 'merging'
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
      plannerModel: 'doubao' | 'qwen'
    }
  | { ok: false; message: string }

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}

export function estimateDhSegmentCount(script: string): number {
  const len = script.trim().length
  if (len <= CHARS_PER_SEGMENT) return 1
  return Math.min(12, Math.max(2, Math.ceil(len / CHARS_PER_SEGMENT)))
}

function pickEngine(cfg: VideoAiBackendConfig | null): DhVideoEngine | null {
  if (cfg?.arkKeyConfigured && cfg.arkVideoModels.length > 0) return 'seedance'
  if (cfg?.klingConfigured) return 'kling'
  return null
}

function pickPlanner(cfg: VideoAiBackendConfig | null): 'doubao' | 'qwen' {
  const lp = cfg?.longformPlanner
  if (lp?.doubao) return 'doubao'
  if (lp?.qwen) return 'qwen'
  return 'doubao'
}

function pickSeedanceModel(cfg: VideoAiBackendConfig | null): string {
  const models = cfg?.arkVideoModels ?? []
  const preferred = models.find((m) => /^doubao-seedance/i.test(m.endpointId)) ?? models[0]
  return preferred?.endpointId?.trim() ?? ''
}

function buildOverallPrompt(draft: DigitalHumanDraft, avatar: PresetAvatar | null): string {
  const script = draft.script.trim()
  const who = avatar ? `${avatar.name}（${avatar.tag}）` : '数字人主播'
  const frame = draft.frameMode === 'full' ? '全身' : '半身'
  const motion =
    draft.motionInstructions.trim() ||
    (draft.gesturePreset ? `手势：${draft.gesturePreset}` : '自然讲解手势')
  return [
    `竖屏 9:16 高清数字人口播短视频，主播 ${who}，${draft.outfit}，${frame}出镜，背景风格 ${draft.background}。`,
    motion,
    `完整口播文案：\n${script}`,
    `请按约 ${SEGMENT_DURATION_SEC} 秒/段拆成连贯分镜提示词，同一主播稳定出镜，口型与当段口播匹配，镜头连贯。`,
  ].join('\n')
}

function buildSingleSegmentPrompt(draft: DigitalHumanDraft, avatar: PresetAvatar | null): string {
  const who = avatar ? `${avatar.name}数字人主播` : '数字人主播'
  return `${who}竖屏口播讲解，${draft.outfit}，${draft.script.trim().slice(0, 500)}`
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
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL_MS)
    const st = await fetchSeedanceVideoStatus(taskId)
    if (!st.ok) throw new Error(st.message)
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

async function generateOneSegment(opts: {
  engine: DhVideoEngine
  prompt: string
  frameB64: string | null
  seedanceModel: string
  seedanceFlags: string
}): Promise<Blob> {
  const { engine, prompt, frameB64, seedanceModel, seedanceFlags } = opts

  if (engine === 'seedance') {
    const images =
      frameB64 != null ? [`data:image/jpeg;base64,${frameB64.replace(/\s/g, '')}`] : undefined
    const r = await postSeedanceVideoStart({
      model: seedanceModel,
      prompt,
      flags: seedanceFlags,
      images_base64: images,
    })
    if (!r.ok) throw new Error(r.message)
    const url = await waitSeedanceVideo(r.taskId)
    return downloadVideoUrlAsBlob(url)
  }

  if (frameB64) {
    const r = await postKlingVideoStart({
      kind: 'image2video',
      prompt,
      duration: SEGMENT_DURATION_SEC,
      aspect_ratio: '9:16',
      mode: 'std',
      image_base64: frameB64.replace(/\s/g, ''),
      model_name: KLING_DEFAULT_MODEL_ID,
    })
    if (!r.ok) throw new Error(r.message)
    const url = await waitKlingVideo(r.taskId, r.pollKind)
    return downloadVideoUrlAsBlob(url)
  }

  const r = await postKlingVideoStart({
    kind: 'text2video',
    prompt,
    duration: SEGMENT_DURATION_SEC,
    aspect_ratio: '9:16',
    mode: 'std',
    model_name: KLING_DEFAULT_MODEL_ID,
  })
  if (!r.ok) throw new Error(r.message)
  const url = await waitKlingVideo(r.taskId, r.pollKind)
  return downloadVideoUrlAsBlob(url)
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
  const engine = pickEngine(cfg)
  if (!engine) {
    return {
      ok: false,
      message:
        '未配置视频生成：请在系统设置绑定豆包（方舟 Seedance）或可灵 API，或联系管理员在运营台配置。',
    }
  }

  const plannerModel = pickPlanner(cfg)
  const avatar = findPresetAvatarForDraft(draft)
  const segmentTotal = estimateDhSegmentCount(script)
  const seedanceModel = pickSeedanceModel(cfg)
  const seedanceFlags = `--dur ${SEGMENT_DURATION_SEC} --fps 24 --ratio 9:16 --wm false`
  if (engine === 'seedance' && !seedanceModel) {
    const hint = cfg?.arkVideoSetupIssue?.trim()
    return {
      ok: false,
      message:
        hint ||
        '豆包 Seedance 未配置可用 ep 接入点：请在运营台「AI模型 → 短视频 API」填写方舟视频 ep- 模型。',
    }
  }

  onProgress?.({ phase: 'planning', segmentIndex: 0, segmentTotal, progress: 8 })

  let prompts: string[]
  if (segmentTotal <= 1) {
    prompts = [buildSingleSegmentPrompt(draft, avatar)]
  } else {
    const plan = await postLongformVideoPlan({
      plannerModel,
      overallPrompt: buildOverallPrompt(draft, avatar),
      segmentCount: segmentTotal,
      mode: 'generate_text',
    })
    if (!plan.ok) {
      return {
        ok: false,
        message: `${plannerModel === 'qwen' ? '千问' : '豆包'}分镜策划失败：${plan.message}`,
      }
    }
    prompts = plan.prompts
  }

  const avatarB64 = await resolveAvatarBase64(draft)
  const blobs: Blob[] = []
  let prevBlob: Blob | null = null

  for (let i = 0; i < prompts.length; i++) {
    const pctBase = 15 + Math.round((i / prompts.length) * 70)
    onProgress?.({
      phase: 'generating',
      segmentIndex: i + 1,
      segmentTotal: prompts.length,
      progress: pctBase,
    })

    let frameB64: string | null = avatarB64
    if (i > 0 && prevBlob) {
      try {
        frameB64 = await extractVideoLastFramePureBase64(prevBlob)
      } catch {
        frameB64 = avatarB64
      }
    }

    try {
      const blob = await generateOneSegment({
        engine,
        prompt: prompts[i]!,
        frameB64,
        seedanceModel,
        seedanceFlags,
      })
      blobs.push(blob)
      prevBlob = blob
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, message: `第 ${i + 1}/${prompts.length} 段生成失败：${msg}` }
    }
  }

  onProgress?.({ phase: 'merging', segmentIndex: prompts.length, segmentTotal: prompts.length, progress: 92 })

  let finalBlob: Blob
  try {
    finalBlob = blobs.length === 1 ? blobs[0]! : await concatVideoSegmentsToMp4(blobs)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `多段合并失败：${msg}` }
  }

  const outputMp4Url = URL.createObjectURL(finalBlob)

  onProgress?.({ phase: 'merging', segmentIndex: prompts.length, segmentTotal: prompts.length, progress: 100 })

  return {
    ok: true,
    outputMp4Url,
    outputBlob: finalBlob,
    segmentCount: prompts.length,
    engine,
    plannerModel,
  }
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
