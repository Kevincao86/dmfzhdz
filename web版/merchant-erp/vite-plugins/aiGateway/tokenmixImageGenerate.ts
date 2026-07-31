/**
 * TokenMix OpenAI 兼容 `/v1/images/generations` — 用于智能体选择 GPT Image / DALL·E 等展示模型时走真实中继出图。
 * gpt-image-2 在 TokenMix 上为异步任务（HTTP 202 → GET /images/generations/{id}），须轮询 output.data。
 *
 * 视觉工坊高级生图：拆成 create + pollOnce，避免浏览器长连接被反代掐断（Failed to fetch）。
 */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function extractImageUrlFromPayload(json: unknown): string {
  if (!json || typeof json !== 'object') return ''
  const root = json as Record<string, unknown>
  const tryRows = (rows: unknown): string => {
    if (!Array.isArray(rows) || !rows.length) return ''
    const row = rows[0]
    if (!row || typeof row !== 'object') return ''
    const r = row as Record<string, unknown>
    const url = typeof r.url === 'string' ? r.url.trim() : ''
    if (url) return url
    const b64 = typeof r.b64_json === 'string' ? r.b64_json.trim() : ''
    if (b64) return `data:image/png;base64,${b64}`
    return ''
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
  const base = (env.TOKENMIX_BASE_URL ?? 'https://api.tokenmix.ai/v1').trim().replace(/\/$/, '')
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

  const payload: Record<string, unknown> = { model: mid, prompt: p, n: 1 }
  if (isDalle3) {
    payload.size = opts?.size?.trim() || '1024x1024'
    payload.response_format = 'url'
  } else if (isDalle2) {
    payload.size = opts?.size?.trim() || '512x512'
    payload.response_format = 'url'
  } else if (isGptImage) {
    payload.size = opts?.size?.trim() || '1024x1024'
    payload.quality = opts?.quality || 'high'
  } else {
    payload.size = opts?.size?.trim() || '1024x1024'
    payload.response_format = 'url'
  }

  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (!res.ok && res.status !== 202) {
    throw new Error(errorMessageFromPayload(json, `TokenMix 生图失败 HTTP ${res.status}`))
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

  const res = await fetch(`${base}/images/generations/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
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
