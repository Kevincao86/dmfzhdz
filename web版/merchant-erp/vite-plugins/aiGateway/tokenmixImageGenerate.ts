/**
 * TokenMix OpenAI 兼容 `/v1/images/generations` — 用于智能体选择 GPT Image / DALL·E 等展示模型时走真实中继出图。
 * gpt-image-2 在 TokenMix 上为异步任务（HTTP 202 → GET /images/generations/{id}），须轮询 output.data。
 *
 * 视觉工坊高级生图：拆成 create + pollOnce，避免浏览器长连接被反代掐断（Failed to fetch）。
 * TokenMix CDN 无 CORS：成图后服务端 hydrate 为 data URL，供浏览器裁切。
 */

import { isTokenmixImageHost, resolveTokenmixBaseUrl } from '../../src/services/ai/tokenmixClient.js'

const TOKENMIX_HYDRATE_MAX_BYTES = 8 * 1024 * 1024

export function isTokenmixBrowserUnsafeImageUrl(url: string): boolean {
  const u = url.trim()
  if (!u || u.startsWith('data:') || u.startsWith('blob:')) return false
  try {
    const parsed = new URL(u)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    return isTokenmixImageHost(parsed.hostname)
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 避免 TokenMix 上游挂起导致 phase=start 卡满 nginx 300s */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/abort/i.test(msg)) throw new Error(`${label}超时（${Math.round(timeoutMs / 1000)}秒），请重试`)
    throw e instanceof Error ? e : new Error(msg)
  } finally {
    clearTimeout(timer)
  }
}

function isTransientHydrateError(msg: string): boolean {
  return /fetch failed|Failed to fetch|ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|socket|network|aborted|超时|CDN 不可达|HTTP 5\d\d/i.test(
    msg,
  )
}

function fetchFailedDetail(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  const cause =
    e && typeof e === 'object' && 'cause' in e && (e as { cause?: unknown }).cause
      ? String((e as { cause: unknown }).cause)
      : ''
  const extra = cause && !msg.includes(cause) ? `（${cause.slice(0, 160)}）` : ''
  return `${msg}${extra}`
}

async function hydrateTokenmixImageUrlOnce(src: string): Promise<string> {
  let res: Response
  try {
    res = await fetchWithTimeout(
      src,
      {
        method: 'GET',
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (compatible; MeooErp/1.0; +https://mofangdianai.com) AppleWebKit/537.36',
        },
        redirect: 'follow',
      },
      12_000,
      'TokenMix CDN 代拉',
    )
  } catch (e) {
    throw new Error(`TokenMix CDN 不可达：${fetchFailedDetail(e)}`)
  }
  if (!res.ok) throw new Error(`TokenMix 成图下载失败 HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.length) throw new Error('TokenMix 成图为空')
  if (buf.length > TOKENMIX_HYDRATE_MAX_BYTES) {
    throw new Error(`TokenMix 成图过大（${buf.length} bytes）`)
  }
  const ctRaw = (res.headers.get('content-type') || 'image/png').split(';')[0]?.trim() || 'image/png'
  const ct = /^image\//i.test(ctRaw) ? ctRaw : 'image/png'
  return `data:${ct};base64,${buf.toString('base64')}`
}

/** 服务端拉 TokenMix CDN → data URL（解决浏览器 CORS Failed to fetch）；短暂网络抖动自动重试 */
export async function hydrateTokenmixImageUrlForBrowser(imageUrl: string): Promise<string> {
  const src = imageUrl.trim()
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return src
  if (!isTokenmixBrowserUnsafeImageUrl(src)) return src

  let lastErr = 'TokenMix 成图下载失败'
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await hydrateTokenmixImageUrlOnce(src)
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (attempt >= 2 || !isTransientHydrateError(lastErr)) break
      await sleep(800)
    }
  }
  throw new Error(lastErr)
}

function asDataUrlFromB64(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (t.startsWith('data:image/')) return t
  return `data:image/png;base64,${t.replace(/^data:image\/\w+;base64,/i, '')}`
}

function extractImageUrlFromPayload(json: unknown): string {
  if (!json || typeof json !== 'object') return ''
  const root = json as Record<string, unknown>
  const tryRows = (rows: unknown): string => {
    if (!Array.isArray(rows) || !rows.length) return ''
    let url = ''
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const b64 = typeof r.b64_json === 'string' ? r.b64_json.trim() : ''
      if (b64) return asDataUrlFromB64(b64)
      if (!url && typeof r.url === 'string' && r.url.trim()) url = r.url.trim()
    }
    return url
  }
  const direct = tryRows(root.data)
  if (direct) return direct
  const output = root.output
  if (output && typeof output === 'object') {
    const nested = tryRows((output as Record<string, unknown>).data)
    if (nested) return nested
  }
  return ''
}

function errorMessageFromPayload(json: unknown, fallback: string): string {
  if (!json || typeof json !== 'object') return fallback
  const root = json as Record<string, unknown>
  const err = root.error
  if (typeof err === 'string' && err.trim()) return err.trim().slice(0, 400)
  if (err && typeof err === 'object') {
    const msg = (err as Record<string, unknown>).message
    if (typeof msg === 'string' && msg.trim()) return msg.trim().slice(0, 400)
  }
  if (typeof root.message === 'string' && root.message.trim()) return root.message.trim().slice(0, 400)
  return fallback
}

export type TokenmixImageCreateResult =
  | { kind: 'ready'; imageUrl: string; modelUsed: string }
  | { kind: 'pending'; taskId: string; modelUsed: string; retryAfterSec: number }

export type TokenmixImagePollResult =
  | { kind: 'ready'; imageUrl: string; modelUsed: string }
  | { kind: 'pending'; retryAfterSec: number }
  | { kind: 'failed'; message: string }

function tokenmixBaseAndKey(env: Record<string, string>): { base: string; apiKey: string } {
  const apiKey = (env.TOKENMIX_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('TOKENMIX_API_KEY 未配置')
  const base = resolveTokenmixBaseUrl(env)
  return { base, apiKey }
}

/** 创建 TokenMix 生图任务；gpt-image 多为 pending，其它模型可能同步返回 url */
export async function tokenmixImagesCreate(
  env: Record<string, string>,
  modelId: string,
  prompt: string,
  opts?: { quality?: 'low' | 'medium' | 'high'; size?: string },
): Promise<TokenmixImageCreateResult> {
  const { base, apiKey } = tokenmixBaseAndKey(env)
  const mid = modelId.trim()
  if (!mid) throw new Error('tokenmix_image_model 为空')

  const p = prompt.trim().slice(0, 3800)
  if (!p) throw new Error('prompt 为空')

  const isDalle3 = mid.includes('dall-e-3') || mid === 'dall-e-3'
  const isDalle2 = mid.includes('dall-e-2') || mid === 'dall-e-2'
  const isGptImage = /^gpt-image/i.test(mid)

  const payload: Record<string, unknown> = { model: mid, prompt: p, n: 1, response_format: 'b64_json' }
  if (isDalle3) {
    payload.size = opts?.size?.trim() || '1024x1024'
  } else if (isDalle2) {
    payload.size = opts?.size?.trim() || '512x512'
  } else if (isGptImage) {
    payload.size = opts?.size?.trim() || '1024x1024'
    payload.quality = opts?.quality || 'high'
  } else {
    payload.size = opts?.size?.trim() || '1024x1024'
  }

  const postCreate = async (body: Record<string, unknown>) =>
    fetchWithTimeout(
      `${base}/images/generations`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      45_000,
      'TokenMix 创建任务',
    )

  let res = await postCreate(payload)
  let text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (!res.ok && res.status !== 202) {
    const errMsg = errorMessageFromPayload(json, `TokenMix 生图失败 HTTP ${res.status}`)
    if (payload.response_format && /response_format|unknown parameter|invalid param/i.test(errMsg)) {
      delete payload.response_format
      res = await postCreate(payload)
      text = await res.text()
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
    }
    if (!res.ok && res.status !== 202) {
      throw new Error(errorMessageFromPayload(json, `TokenMix 生图失败 HTTP ${res.status}`))
    }
  }

  const root = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
  const objectType = typeof root?.object === 'string' ? root.object : ''
  const taskId = typeof root?.id === 'string' ? root.id.trim() : ''
  const syncUrl = extractImageUrlFromPayload(json)
  const modelUsed = typeof root?.model === 'string' && root.model.trim() ? root.model.trim() : mid

  if (syncUrl) {
    return { kind: 'ready', imageUrl: syncUrl, modelUsed }
  }

  if (
    taskId &&
    (res.status === 202 ||
      objectType === 'image.generation.task' ||
      /^pending|processing|queued$/i.test(String(root?.status || '')))
  ) {
    const retryAfter =
      typeof root?.retry_after === 'number' && Number.isFinite(root.retry_after) ? root.retry_after : 3
    return { kind: 'pending', taskId, modelUsed, retryAfterSec: retryAfter }
  }

  throw new Error('TokenMix 生图未返回 url / b64_json / task id')
}

/** 单次查询 TokenMix 任务状态（短请求，供浏览器轮询） */
export async function tokenmixImagesPollOnce(
  env: Record<string, string>,
  taskId: string,
  modelUsedFallback: string,
): Promise<TokenmixImagePollResult> {
  const { base, apiKey } = tokenmixBaseAndKey(env)
  const id = taskId.trim()
  if (!id) throw new Error('task_id 为空')

  const res = await fetchWithTimeout(
    `${base}/images/generations/${encodeURIComponent(id)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    },
    20_000,
    'TokenMix 任务查询',
  )
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    throw new Error(errorMessageFromPayload(json, `TokenMix 任务查询失败 HTTP ${res.status}`))
  }
  const root = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
  const status = typeof root?.status === 'string' ? root.status.toLowerCase() : ''
  const imageUrl = extractImageUrlFromPayload(json)
  if (imageUrl) {
    const modelUsed =
      typeof root?.model === 'string' && root.model.trim() ? root.model.trim() : modelUsedFallback
    return { kind: 'ready', imageUrl, modelUsed }
  }
  if (status === 'failed' || status === 'error' || status === 'cancelled') {
    return { kind: 'failed', message: errorMessageFromPayload(json, `TokenMix 生图任务失败（${status}）`) }
  }
  const next = typeof root?.retry_after === 'number' ? root.retry_after : NaN
  const retryAfterSec =
    Number.isFinite(next) && next > 0 ? Math.max(1, Math.min(10, Math.round(next))) : 3
  return { kind: 'pending', retryAfterSec }
}

async function pollTokenmixImageTask(
  env: Record<string, string>,
  taskId: string,
  retryAfterSec: number,
  modelUsedFallback: string,
): Promise<{ imageUrl: string; modelUsed: string }> {
  const deadline = Date.now() + 240_000
  let waitMs = Math.max(1000, Math.min(10_000, Math.round((retryAfterSec || 3) * 1000)))

  while (Date.now() < deadline) {
    await sleep(waitMs)
    const once = await tokenmixImagesPollOnce(env, taskId, modelUsedFallback)
    if (once.kind === 'ready') return { imageUrl: once.imageUrl, modelUsed: once.modelUsed }
    if (once.kind === 'failed') throw new Error(once.message)
    waitMs = Math.max(1000, Math.min(10_000, Math.round((once.retryAfterSec || 3) * 1000)))
  }
  throw new Error('TokenMix 高级生图超时（轮询超过 240 秒），请稍后重试')
}

/** 兼容旧调用：服务端内同步等到出图（智能体等非视觉工坊路径） */
export async function tokenmixImagesGenerate(
  env: Record<string, string>,
  modelId: string,
  prompt: string,
  opts?: { quality?: 'low' | 'medium' | 'high'; size?: string },
): Promise<{ imageUrl: string; modelUsed: string }> {
  const created = await tokenmixImagesCreate(env, modelId, prompt, opts)
  if (created.kind === 'ready') {
    return { imageUrl: created.imageUrl, modelUsed: created.modelUsed }
  }
  return pollTokenmixImageTask(env, created.taskId, created.retryAfterSec, created.modelUsed)
}

async function loadTokenmixEditImageBytes(
  src: string,
): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
  const t = src.trim()
  const dataUrl = /^data:([^;]+);base64,(.+)$/i.exec(t)
  if (dataUrl) {
    const contentType = (dataUrl[1] || 'image/jpeg').trim() || 'image/jpeg'
    const ext = /png/i.test(contentType) ? 'png' : /webp/i.test(contentType) ? 'webp' : 'jpg'
    const buffer = Buffer.from(dataUrl[2] || '', 'base64')
    if (!buffer.length) throw new Error('参考图为空')
    return { buffer, contentType, fileName: `ref.${ext}` }
  }
  if (!/^https?:\/\//i.test(t)) throw new Error('参考图格式无效')
  const res = await fetchWithTimeout(
    t,
    { method: 'GET', headers: { Accept: 'image/*,*/*' } },
    30_000,
    '下载参考图',
  )
  if (!res.ok) throw new Error(`参考图下载失败 HTTP ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  if (!buffer.length) throw new Error('参考图为空')
  const ctRaw = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]?.trim() || 'image/jpeg'
  const contentType = /^image\//i.test(ctRaw) ? ctRaw : 'image/jpeg'
  const ext = /png/i.test(contentType) ? 'png' : /webp/i.test(contentType) ? 'webp' : 'jpg'
  return { buffer, contentType, fileName: `ref.${ext}` }
}

function parseTokenmixImageCreateBody(json: unknown, httpStatus: number, fallbackModel: string): TokenmixImageCreateResult {
  const root = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
  const objectType = typeof root?.object === 'string' ? root.object : ''
  const taskId = typeof root?.id === 'string' ? root.id.trim() : ''
  const syncUrl = extractImageUrlFromPayload(json)
  const modelUsed = typeof root?.model === 'string' && root.model.trim() ? root.model.trim() : fallbackModel
  if (syncUrl) return { kind: 'ready', imageUrl: syncUrl, modelUsed }
  if (
    taskId &&
    (httpStatus === 202 ||
      objectType === 'image.generation.task' ||
      objectType === 'image.edit.task' ||
      /^pending|processing|queued$/i.test(String(root?.status || '')))
  ) {
    const retryAfter =
      typeof root?.retry_after === 'number' && Number.isFinite(root.retry_after) ? root.retry_after : 3
    return { kind: 'pending', taskId, modelUsed, retryAfterSec: retryAfter }
  }
  throw new Error('TokenMix 生图未返回 url / b64_json / task id')
}

/** GPT Image 按参考图编辑（multipart /images/edits），用于角色贴脸 */
export async function tokenmixImagesEdit(
  env: Record<string, string>,
  modelId: string,
  prompt: string,
  imageSrc: string,
  opts?: { quality?: 'low' | 'medium' | 'high'; size?: string },
): Promise<{ imageUrl: string; modelUsed: string }> {
  const { base, apiKey } = tokenmixBaseAndKey(env)
  const mid = modelId.trim()
  if (!mid) throw new Error('tokenmix_image_model 为空')
  const p = prompt.trim().slice(0, 3800)
  if (!p) throw new Error('prompt 为空')
  const img = await loadTokenmixEditImageBytes(imageSrc)
  if (img.buffer.length > 8 * 1024 * 1024) throw new Error('参考图过大，请压缩后再试')

  const form = new FormData()
  form.append('model', mid)
  form.append('prompt', p)
  form.append('n', '1')
  form.append('response_format', 'b64_json')
  form.append(
    'image',
    new Blob([new Uint8Array(img.buffer)], { type: img.contentType }),
    img.fileName,
  )
  const size = opts?.size?.trim()
  if (size) form.append('size', size)
  if (opts?.quality) form.append('quality', opts.quality)

  const res = await fetchWithTimeout(
    `${base}/images/edits`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    },
    60_000,
    'TokenMix 参考图编辑',
  )
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok && res.status !== 202) {
    throw new Error(errorMessageFromPayload(json, `TokenMix 参考图编辑失败 HTTP ${res.status}`))
  }
  const created = parseTokenmixImageCreateBody(json, res.status, mid)
  if (created.kind === 'ready') {
    return { imageUrl: created.imageUrl, modelUsed: created.modelUsed }
  }
  return pollTokenmixImageTask(env, created.taskId, created.retryAfterSec, created.modelUsed)
}
