/** 同源 /api/merchant/ai/video：由 Vite 中间层代理可灵与方舟，浏览器不接触密钥 */

import { isValidAiVendorSlug } from '../lib/aiVendorCatalogShared'
import { readVendorKeyMap } from './merchantAiVendorKeysStorage'

export type VideoAiBackendConfig = {
  klingConfigured: boolean
  arkKeyConfigured: boolean
  arkVideoModels: { label: string; endpointId: string }[]
  longformPlanner?: { doubao: boolean; qwen: boolean }
  /** 后端返回的商户端说明（不在此页绑 Key） */
  credentialNote?: string
}

async function parseJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

function buildVideoPostBody(body: Record<string, unknown>): Record<string, unknown> {
  const keys = readVendorKeyMap()
  const vendor_keys: Record<string, string> = {}
  for (const [id, raw] of Object.entries(keys)) {
    if (!isValidAiVendorSlug(id)) continue
    const t = raw?.trim()
    if (t) vendor_keys[id] = t
  }
  const out: Record<string, unknown> = { ...body }
  if (Object.keys(vendor_keys).length > 0) out.vendor_keys = vendor_keys
  return out
}

export async function fetchVideoAiConfig(): Promise<VideoAiBackendConfig | null> {
  const res = await fetch('/api/merchant/ai/video/config')
  const j = await parseJsonSafe<VideoAiBackendConfig>(res)
  return j ?? null
}

export type LongformPlanMode = 'optimize' | 'generate_text' | 'generate_frames'

export async function postLongformVideoPlan(body: {
  plannerModel: 'doubao' | 'qwen'
  overallPrompt: string
  segmentCount: number
  mode: LongformPlanMode
  negativeHint?: string
}): Promise<{ ok: true; prompts: string[] } | { ok: false; message: string }> {
  const res = await fetch('/api/merchant/ai/video/longform/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(buildVideoPostBody({ ...body })),
  })
  const j = (await parseJsonSafe<Record<string, unknown>>(res)) ?? {}
  if (!res.ok || !j.ok) {
    const msg =
      typeof j.message === 'string' ? j.message : `长片策划失败 HTTP ${res.status}`
    return { ok: false, message: msg }
  }
  const raw = j.prompts
  if (!Array.isArray(raw)) return { ok: false, message: '服务端未返回 prompts' }
  const prompts = raw.map((x) => String(x).trim()).filter(Boolean)
  if (prompts.length === 0) return { ok: false, message: '分段提示词为空' }
  return { ok: true, prompts }
}

/** 经 dev 网关拉取成片，避免跨域导致无法截尾帧或拼接 */
export async function downloadVideoUrlAsBlob(url: string): Promise<Blob> {
  const res = await fetch('/api/merchant/ai/video/download-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) {
    const j = await parseJsonSafe<{ message?: string }>(res)
    throw new Error(j?.message || `下载视频失败 HTTP ${res.status}`)
  }
  return res.blob()
}

export type KlingStartKind = 'text2video' | 'image2video'

export async function postKlingVideoStart(body: {
  kind: KlingStartKind
  prompt?: string
  model_name?: string
  duration?: number
  aspect_ratio?: string
  mode?: string
  negative_prompt?: string
  image_base64?: string
  image_url?: string
}): Promise<
  | { ok: true; taskId: string; pollKind: KlingStartKind }
  | { ok: false; message: string; upstream?: unknown }
> {
  const res = await fetch('/api/merchant/ai/video/kling/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  })
  const j = (await parseJsonSafe<Record<string, unknown>>(res)) ?? {}
  const okFlag = Boolean(j.ok)
  if (!res.ok || !okFlag) {
    const msg =
      typeof j.message === 'string' ? j.message : `可灵发起失败 HTTP ${res.status}`
    return { ok: false, message: msg, upstream: j.upstream }
  }
  const tid = typeof j.taskId === 'string' ? j.taskId : ''
  const pollKindRaw = typeof j.pollKind === 'string' ? j.pollKind : body.kind
  const pollKind: KlingStartKind =
    pollKindRaw === 'image2video' ? 'image2video' : 'text2video'
  if (!tid) return { ok: false, message: '服务端未返回 taskId' }
  return { ok: true, taskId: tid, pollKind }
}

export type KlingPollPhase = 'queued' | 'running' | 'succeeded' | 'failed'

export async function fetchKlingVideoStatus(
  taskId: string,
  kind: KlingStartKind,
): Promise<
  | {
      ok: true
      phase: KlingPollPhase
      videoUrl: string | null
      taskStatus: string | null
    }
  | { ok: false; message: string }
> {
  const sp = new URLSearchParams({
    taskId,
    kind,
  })
  const res = await fetch(`/api/merchant/ai/video/kling/status?${sp}`)
  const j = (await parseJsonSafe<Record<string, unknown>>(res)) ?? {}
  if (!res.ok || !j.ok) {
    const msg =
      typeof j.message === 'string' ? j.message : `可灵查询失败 HTTP ${res.status}`
    return { ok: false, message: msg }
  }
  const phase = typeof j.phase === 'string' ? j.phase : 'running'
  const safePhase: KlingPollPhase =
    phase === 'queued' || phase === 'running' || phase === 'succeeded' || phase === 'failed'
      ? phase
      : 'running'
  const videoUrl = typeof j.videoUrl === 'string' ? j.videoUrl : null
  const taskStatus = typeof j.taskStatus === 'string' ? j.taskStatus : null
  return {
    ok: true,
    phase: safePhase,
    videoUrl,
    taskStatus,
  }
}

export async function postSeedanceVideoStart(body: {
  model?: string
  prompt?: string
  flags?: string
  images_base64?: string[]
}): Promise<{ ok: true; taskId: string } | { ok: false; message: string }> {
  const res = await fetch('/api/merchant/ai/video/seedance/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  })
  const j = (await parseJsonSafe<Record<string, unknown>>(res)) ?? {}
  if (!res.ok || !j.ok) {
    const msg =
      typeof j.message === 'string'
        ? j.message
        : `Seedance/方舟发起失败 HTTP ${res.status}`
    return { ok: false, message: msg }
  }
  const tid = typeof j.taskId === 'string' ? j.taskId : ''
  if (!tid) return { ok: false, message: '服务端未返回 task id' }
  return { ok: true, taskId: tid }
}

export type SeedancePollPhase = 'queued' | 'running' | 'succeeded' | 'failed'

export async function fetchSeedanceVideoStatus(
  taskId: string,
): Promise<
  | {
      ok: true
      phase: SeedancePollPhase
      statusLabel: string
      videoUrl?: string
      failReason?: string
    }
  | { ok: false; message: string }
> {
  const sp = new URLSearchParams({ taskId })
  const res = await fetch(`/api/merchant/ai/video/seedance/status?${sp}`)
  const j = (await parseJsonSafe<Record<string, unknown>>(res)) ?? {}
  if (!res.ok || !j.ok) {
    const msg =
      typeof j.message === 'string'
        ? j.message
        : `Seedance/方舟查询失败 HTTP ${res.status}`
    return { ok: false, message: msg }
  }
  const phase = typeof j.phase === 'string' ? j.phase : 'running'
  const safePhase: SeedancePollPhase =
    phase === 'queued' || phase === 'running' || phase === 'succeeded' || phase === 'failed'
      ? phase
      : 'running'
  const statusLabel = typeof j.statusLabel === 'string' ? j.statusLabel : safePhase
  const videoUrl = typeof j.videoUrl === 'string' ? j.videoUrl : undefined
  const failReason = typeof j.failReason === 'string' ? j.failReason : undefined
  return { ok: true, phase: safePhase, statusLabel, videoUrl, failReason }
}
