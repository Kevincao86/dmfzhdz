/** 同源 /api/merchant/ai/video：由 Vite 中间层代理可灵与方舟，密钥仅服务端环境变量 */

import {
  DOUBAO_VIDEO_CATALOG,
  isArkQuotaHopableError,
  isQwenVideoModelHopableError,
} from '../lib/arkModelCatalog'
import { SEEDANCE_SERVER_AUTO } from '../lib/shortVideoUiLabels'
import { normalizeArkVideoModelParam } from '../lib/arkVideoEndpointsConfig'
import { merchantApiFetchUrls, merchantBinaryApiFetchUrls } from '../lib/merchantErpApiBase'

/** 安全体验模式限额已满的模型，自动切换时放到队尾再试 */
const SEEDANCE_DEPRIORITIZE_ID = 'doubao-seedance-1-5-pro-251215'

export function formatVideoAiUserError(msg: string): string {
  const raw = String(msg ?? '').trim()
  if (!raw) return raw
  if (/inference limit|safe experience mode|model service has been paused/i.test(raw)) {
    const modelId =
      raw.match(/\*\*([^*]+)\*\*/)?.[1]?.trim() ||
      raw.match(/for the\s+\*?\*?([^\s*.]+)\*?\*?\s+model/i)?.[1]?.trim() ||
      raw.match(/模型「([^」]+)」/)?.[1]?.trim() ||
      'Seedance'
    return (
      `火山方舟模型「${modelId}」已达推理限额（安全体验模式），正在尝试其它视频模型。` +
      `若全部失败请到火山方舟控制台关闭「安全体验模式」或开通正式计费：` +
      `https://console.volcengine.com/ark/region:ark+cn-beijing/model。原始信息：${raw}`
    )
  }
  return raw
}

function catalogVideoModelIds(hasImages: boolean): string[] {
  const kinds = hasImages
    ? (['video_both', 'video_i2v'] as const)
    : (['video_both', 'video_t2v'] as const)
  return [...DOUBAO_VIDEO_CATALOG]
    .filter((e) => (kinds as readonly string[]).includes(e.kind))
    .sort((a, b) => a.priority - b.priority)
    .map((e) => e.modelId)
}

function buildSeedanceTryOrder(input: {
  preferred: string
  poolModels: string[]
  hasImages: boolean
}): string[] {
  const { preferred, poolModels, hasImages } = input
  const tryOrder: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    const t = normalizeArkVideoModelParam(raw.trim())
    if (!t || t === SEEDANCE_SERVER_AUTO || seen.has(t)) return
    seen.add(t)
    tryOrder.push(t)
  }

  const isAuto = !preferred || preferred === SEEDANCE_SERVER_AUTO
  const catalogIds = catalogVideoModelIds(hasImages)
  const deprioritized = SEEDANCE_DEPRIORITIZE_ID
  const pushRest = (ids: string[]) => {
    for (const id of ids) {
      if (normalizeArkVideoModelParam(id) === deprioritized) continue
      push(id)
    }
    for (const id of ids) {
      if (normalizeArkVideoModelParam(id) === deprioritized) push(id)
    }
  }

  if (isAuto) {
    pushRest(poolModels)
    pushRest(catalogIds)
    push(SEEDANCE_SERVER_AUTO)
    return tryOrder
  }

  push(preferred)
  pushRest(poolModels.filter((m) => normalizeArkVideoModelParam(m) !== normalizeArkVideoModelParam(preferred)))
  pushRest(
    catalogIds.filter((m) => normalizeArkVideoModelParam(m) !== normalizeArkVideoModelParam(preferred)),
  )
  push(SEEDANCE_SERVER_AUTO)
  return tryOrder
}

export type VideoAiBackendConfig = {
  klingConfigured: boolean
  arkKeyConfigured: boolean
  arkVideoModels: { label: string; endpointId: string }[]
  iceConfigured?: boolean
  /** @deprecated 使用 iceConfigured */
  openshotConfigured?: boolean
  longformPlanner?: { doubao: boolean; qwen: boolean }
  /** 百炼千问视频（豆包额度用尽时服务端自动切换） */
  qwenVideoConfigured?: boolean
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

const VIDEO_FETCH_TIMEOUT_MS = 120_000
const VIDEO_CONCAT_TIMEOUT_MS = 300_000
const VIDEO_CONFIG_TIMEOUT_MS = 25_000

function videoFetchSignal(ms: number): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(ms)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

/** 视频生成耗时长，仅走 erp-api 单跳，避免 cs 同源 /api 双跳 pending */
function videoApiFetchUrls(pathWithQuery: string): string[] {
  const all = merchantApiFetchUrls(pathWithQuery)
  const erpOnly = all.filter((u) => /\/erp-api\//i.test(u))
  return erpOnly.length ? erpOnly : all
}

async function fetchVideoGet(pathWithQuery: string): Promise<Response | null> {
  for (const url of videoApiFetchUrls(pathWithQuery)) {
    try {
      const res = await fetch(url, { signal: videoFetchSignal(VIDEO_FETCH_TIMEOUT_MS) })
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

async function fetchVideoPostBinary(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = VIDEO_CONCAT_TIMEOUT_MS,
): Promise<Response | null> {
  const bodyStr = JSON.stringify(body)
  for (const url of merchantBinaryApiFetchUrls(path)) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: bodyStr,
        signal: videoFetchSignal(timeoutMs),
      })
      const ct = res.headers.get('content-type') ?? ''
      if (res.status === 404) continue
      if (!res.ok) {
        const text = await res.text()
        if (isLikelyVercelApiRouteMiss(text, ct, res.status)) continue
        return new Response(text, {
          status: res.status,
          statusText: res.statusText,
          headers: { 'Content-Type': ct || 'application/json; charset=utf-8' },
        })
      }
      const buf = await res.arrayBuffer()
      if (responseLooksLikeHtml(new TextDecoder().decode(buf.slice(0, 256)), ct)) continue
      return new Response(buf, {
        status: res.status,
        statusText: res.statusText,
        headers: { 'Content-Type': ct || 'video/mp4' },
      })
    } catch {
      /* try next candidate */
    }
  }
  return null
}

async function fetchVideoPost(path: string, body: Record<string, unknown>): Promise<Response | null> {
  const bodyStr = JSON.stringify(body)
  for (const url of videoApiFetchUrls(path)) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: bodyStr,
        signal: videoFetchSignal(VIDEO_FETCH_TIMEOUT_MS),
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
    for (const url of videoApiFetchUrls(p)) {
      try {
        const res = await fetch(url, { signal: videoFetchSignal(VIDEO_CONFIG_TIMEOUT_MS) })
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
  plannerModel?: 'doubao' | 'qwen' | 'auto'
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

/** 服务端 ffmpeg 拼接多段远程 MP4（浏览器 wasm 失败时兜底） */
export async function concatVideoUrlsOnServer(urls: string[]): Promise<Blob> {
  const paths = [
    '/api/meoo-merchant-ai-video-concat-urls',
    '/api/merchant/ai/video/concat-urls',
  ] as const
  for (const p of paths) {
    const res = await fetchVideoPostBinary(p, { urls })
    if (!res) continue
    if (!res.ok) {
      const j = await parseJsonSafe<{ message?: string }>(new Response(await res.text()))
      throw new Error(j?.message || `云端拼接失败 HTTP ${res.status}`)
    }
    const blob = await res.blob()
    if (blob.size < 1024) throw new Error('云端拼接返回空文件')
    return blob
  }
  throw new Error('云端拼接失败：视频 AI 接口未部署或不可达')
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** 将浏览器已下载的分段 MP4 发到服务端 ffmpeg 拼接（URL 拉取失败时兜底） */
export async function concatVideoBlobsOnServer(blobs: Blob[]): Promise<Blob> {
  const segments = await Promise.all(blobs.map((b) => blobToBase64(b)))
  const paths = [
    '/api/meoo-merchant-ai-video-concat-blobs',
    '/api/merchant/ai/video/concat-blobs',
  ] as const
  for (const p of paths) {
    const res = await fetchVideoPostBinary(p, { segments }, 300_000)
    if (!res) continue
    if (!res.ok) {
      const j = await parseJsonSafe<{ message?: string }>(new Response(await res.text()))
      throw new Error(j?.message || `Blob 云端拼接失败 HTTP ${res.status}`)
    }
    const out = await res.blob()
    if (out.size < 1024) throw new Error('Blob 云端拼接返回空文件')
    return out
  }
  throw new Error('Blob 云端拼接失败：视频 AI 接口未部署或不可达')
}

/** 服务端 ffmpeg 将 TTS 口播混入无声视频（浏览器 wasm 失败时兜底） */
export async function muxVideoAudioOnServer(videoBlob: Blob, audioBlob: Blob): Promise<Blob> {
  const paths = [
    '/api/meoo-merchant-ai-video-mux-audio',
    '/api/merchant/ai/video/mux-audio',
  ] as const
  const body = {
    videoBase64: await blobToBase64(videoBlob),
    audioBase64: await blobToBase64(audioBlob),
  }
  for (const p of paths) {
    const res = await fetchVideoPostBinary(p, body, 300_000)
    if (!res) continue
    if (!res.ok) {
      const j = await parseJsonSafe<{ message?: string }>(new Response(await res.text()))
      throw new Error(j?.message || `云端音视频合成失败 HTTP ${res.status}`)
    }
    const out = await res.blob()
    if (out.size < 1024) throw new Error('云端音视频合成返回空文件')
    return out
  }
  throw new Error('云端音视频合成失败：视频 AI 接口未部署或不可达')
}

/** 豆包/可灵 CDN 偶发允许浏览器直拉；代理失败时兜底 */
async function tryDirectVideoBlob(url: string): Promise<Blob | null> {
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null
  try {
    const res = await fetch(trimmed, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: { Accept: 'video/mp4,video/*,application/octet-stream,*/*' },
      signal: videoFetchSignal(VIDEO_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const blob = await res.blob()
    return blob.size >= 1024 ? blob : null
  } catch {
    return null
  }
}

/** 经网关二进制代理拉取成片（直连 handler 写 Buffer，避免 node-mocks-http 0 字节） */
export async function downloadVideoUrlAsBlob(url: string): Promise<Blob> {
  const paths = [
    '/api/meoo-merchant-ai-video-download-url',
    '/api/merchant/ai/video/download-url',
  ] as const
  let lastErr = '视频 AI 接口未部署或不可达'
  for (const p of paths) {
    const res = await fetchVideoPostBinary(p, { url }, VIDEO_FETCH_TIMEOUT_MS)
    if (!res) continue
    if (!res.ok) {
      const j = await parseJsonSafe<{ message?: string }>(new Response(await res.text()))
      lastErr = j?.message || `下载视频失败 HTTP ${res.status}`
      continue
    }
    const blob = await res.blob()
    if (blob.size < 1024) {
      lastErr = `下载视频为空（${blob.size} 字节），或与后端连接异常，请稍后重试`
      continue
    }
    return blob
  }
  const direct = await tryDirectVideoBlob(url)
  if (direct) return direct
  throw new Error(`下载视频失败：${lastErr}`)
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
  /** 数字人口播等场景：跳过豆包/方舟，直接走千问视频 */
  prefer_provider?: 'qwen'
}): Promise<
  { ok: true; taskId: string; modelUsed?: string | null; provider?: string }
  | { ok: false; message: string }
> {
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
    const modelUsed = typeof j.modelUsed === 'string' ? j.modelUsed : null
    const provider = typeof j.provider === 'string' ? j.provider : undefined
    return { ok: true, taskId: tid, modelUsed, provider }
  }
  return {
    ok: false,
    message:
      'Seedance/方舟发起失败 HTTP 404（已尝试 meoo 顶路径与 merchant 路径）。请部署 api/meoo-merchant-ai-video-seedance-start.ts。',
  }
}

/** 额度/限流时按运营台模型池逐个切换，最后走服务端 __server_auto__ 轮询（含千问） */
export async function postSeedanceVideoStartWithFailover(body: {
  model?: string
  prompt?: string
  flags?: string
  images_base64?: string[]
  /** 运营台配置的全部视频模型 ID */
  poolModels?: string[]
}): Promise<
  { ok: true; taskId: string; modelUsed?: string | null; provider?: string }
  | { ok: false; message: string }
> {
  const preferred = body.model?.trim() ?? ''
  const hasImages = Array.isArray(body.images_base64) && body.images_base64.some((x) => String(x).trim())
  const tryOrder = buildSeedanceTryOrder({
    preferred,
    poolModels: body.poolModels ?? [],
    hasImages,
  })

  let lastMsg = '视频生成失败'
  const tried: string[] = []
  for (const model of tryOrder) {
    const r = await postSeedanceVideoStart({ ...body, model })
    if (r.ok) {
      if (tried.length > 0) {
        return {
          ...r,
          modelUsed: r.modelUsed ?? (model === SEEDANCE_SERVER_AUTO ? null : model),
        }
      }
      return r
    }
    lastMsg = r.message
    tried.push(model === SEEDANCE_SERVER_AUTO ? '服务端自动轮询(含千问)' : model)
    if (!isArkQuotaHopableError(r.message) && !isQwenVideoModelHopableError(r.message)) {
      return { ok: false, message: formatVideoAiUserError(r.message) }
    }
  }

  const summary =
    tried.length > 1
      ? `${formatVideoAiUserError(lastMsg)}（已依次尝试 ${tried.length} 路：${tried.join(' → ')}）`
      : formatVideoAiUserError(lastMsg)
  return { ok: false, message: summary }
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
