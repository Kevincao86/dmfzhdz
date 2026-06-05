/** 同源 /api/merchant/ai/video：由 Vite 中间层代理可灵与方舟，密钥仅服务端环境变量 */

import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'

export type VideoAiBackendConfig = {
  klingConfigured: boolean
  arkKeyConfigured: boolean
  arkVideoModels: { label: string; endpointId: string }[]
  iceConfigured?: boolean
  /** @deprecated 使用 iceConfigured */
  openshotConfigured?: boolean
  longformPlanner?: { doubao: boolean; qwen: boolean }
  /** 后端返回的商户端说明（不在此页绑 Key） */
  credentialNote?: string
  /** 方舟 Key 已有但无可用 ep 时的具体原因 */
  arkVideoSetupIssue?: string | null
  /** 配置接口网络失败（如 fetch failed） */
  configLoadError?: string
}

async function parseJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

function responseLooksLikeHtml(text: string, contentType: string): boolean {
  const t = text.trimStart()
  return t.startsWith('<') || /text\/html/i.test(contentType)
}

/** 404 且为 JSON 业务错误时勿换路径（方舟无效 ep 也会 404，易被误判为「未部署」） */
function isLikelyVercelApiRouteMiss(text: string, contentType: string, status: number): boolean {
  if (status !== 404) return false
  if (responseLooksLikeHtml(text, contentType)) return true
  const t = text.trim()
  if (!t || !t.startsWith('{')) return true
  try {
    const j = JSON.parse(t) as Record<string, unknown>
    if (j.ok === false && typeof j.message === 'string' && j.message.trim()) return false
  } catch {
    return true
  }
  return true
}

function buildVideoPostBody(body: Record<string, unknown>): Record<string, unknown> {
  return { ...body }
}

async function fetchVideoGet(pathWithQuery: string): Promise<Response | null> {
  for (const url of merchantApiFetchUrls(pathWithQuery)) {
    try {
      const res = await fetch(url)
      const text = await res.text()
      const ct = res.headers.get('content-type') ?? ''
      if (res.status === 404) continue
      if (res.ok && responseLooksLikeHtml(text, ct)) continue
      return new Response(text, {
        status: res.status,
        statusText: res.statusText,
        headers: { 'Content-Type': ct || 'application/json; charset=utf-8' },
      })
    } catch {
      /* try next candidate */
    }
  }
  return null
}

async function fetchVideoPost(path: string, body: Record<string, unknown>): Promise<Response | null> {
  const bodyStr = JSON.stringify(body)
  for (const url of merchantApiFetchUrls(path)) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: bodyStr,
      })
      const text = await res.text()
      const ct = res.headers.get('content-type') ?? ''
      if (isLikelyVercelApiRouteMiss(text, ct, res.status)) continue
      if (res.ok && responseLooksLikeHtml(text, ct)) continue
      return new Response(text, {
        status: res.status,
        statusText: res.statusText,
        headers: { 'Content-Type': ct || 'application/json; charset=utf-8' },
      })
    } catch {
      /* try next candidate */
    }
  }
  return null
}

export async function fetchVideoAiConfig(): Promise<VideoAiBackendConfig | null> {
  const paths = ['/api/meoo-merchant-ai-video-config', '/api/merchant/ai/video/config'] as const
  let lastNetworkErr = ''
  for (const p of paths) {
    for (const url of merchantApiFetchUrls(p)) {
      try {
        const res = await fetch(url)
        const text = await res.text()
        const ct = res.headers.get('content-type') ?? ''
        if (res.status === 404) continue
        if (res.ok && responseLooksLikeHtml(text, ct)) continue
        let j: VideoAiBackendConfig | null = null
        try {
          j = JSON.parse(text) as VideoAiBackendConfig
        } catch {
          j = null
        }
        if (res.ok && j && typeof j.klingConfigured === 'boolean') return j
      } catch (e) {
        lastNetworkErr = e instanceof Error ? e.message : String(e)
      }
    }
  }
  if (lastNetworkErr) {
    return {
      klingConfigured: false,
      arkKeyConfigured: false,
      arkVideoModels: [],
      configLoadError: lastNetworkErr,
    }
  }
  return null
}

export type LongformPlanMode = 'optimize' | 'generate_text' | 'generate_frames'

export async function postLongformVideoPlan(body: {
  plannerModel: 'doubao' | 'qwen'
  overallPrompt: string
  segmentCount: number
  mode: LongformPlanMode
  negativeHint?: string
}): Promise<{ ok: true; prompts: string[] } | { ok: false; message: string }> {
  const paths = [
    '/api/meoo-merchant-ai-video-longform-plan',
    '/api/merchant/ai/video/longform/plan',
  ] as const
  for (const p of paths) {
    const res = await fetchVideoPost(p, buildVideoPostBody({ ...body }))
    if (!res) continue
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
  return { ok: false, message: '长片策划失败：视频 AI 接口未部署或不可达' }
}

/** 经 dev 网关拉取成片，避免跨域导致无法截尾帧或拼接 */
export async function downloadVideoUrlAsBlob(url: string): Promise<Blob> {
  const paths = [
    '/api/meoo-merchant-ai-video-download-url',
    '/api/merchant/ai/video/download-url',
  ] as const
  for (const p of paths) {
    const res = await fetchVideoPost(p, { url })
    if (!res) continue
    if (!res.ok) {
      const j = await parseJsonSafe<{ message?: string }>(res)
      throw new Error(j?.message || `下载视频失败 HTTP ${res.status}`)
    }
    return res.blob()
  }
  throw new Error('下载视频失败：视频 AI 接口未部署或不可达')
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
  const paths = ['/api/meoo-merchant-ai-video-kling-start', '/api/merchant/ai/video/kling/start'] as const
  for (const p of paths) {
    const res = await fetchVideoPost(p, body)
    if (!res) continue
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
  return {
    ok: false,
    message:
      '可灵发起失败 HTTP 404（已尝试 meoo 顶路径与 merchant 路径）。请部署 api/meoo-merchant-ai-video-kling-start.ts。',
  }
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
  const sp = new URLSearchParams({ taskId, kind })
  const qs = `?${sp}`
  const paths = [
    `/api/meoo-merchant-ai-video-kling-status${qs}`,
    `/api/merchant/ai/video/kling/status${qs}`,
  ] as const
  for (const p of paths) {
    const res = await fetchVideoGet(p)
    if (!res) continue
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
    return { ok: true, phase: safePhase, videoUrl, taskStatus }
  }
  return { ok: false, message: '可灵查询失败 HTTP 404' }
}

export async function postSeedanceVideoStart(body: {
  model?: string
  prompt?: string
  flags?: string
  images_base64?: string[]
}): Promise<{ ok: true; taskId: string } | { ok: false; message: string }> {
  const paths = [
    '/api/meoo-merchant-ai-video-seedance-start',
    '/api/merchant/ai/video/seedance/start',
  ] as const
  for (const p of paths) {
    const res = await fetchVideoPost(p, body)
    if (!res) continue
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
  return {
    ok: false,
    message:
      'Seedance/方舟发起失败 HTTP 404（已尝试 meoo 顶路径与 merchant 路径）。请部署 api/meoo-merchant-ai-video-seedance-start.ts。',
  }
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
  const qs = `?${sp}`
  const paths = [
    `/api/meoo-merchant-ai-video-seedance-status${qs}`,
    `/api/merchant/ai/video/seedance/status${qs}`,
  ] as const
  for (const p of paths) {
    const res = await fetchVideoGet(p)
    if (!res) continue
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
  return { ok: false, message: 'Seedance/方舟查询失败 HTTP 404' }
}
