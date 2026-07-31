/**
 * 火山即梦 OmniHuman 1.5：单图 + 音频驱动数字人口播
 * API: visual.volcengineapi.com CVSync2AsyncSubmitTask / CVSync2AsyncGetResult
 */
import type { MerchantAiEnv } from './merchantAiUpstream.js'
import { signVolcVisualJsonPost } from './volcVisualSign.js'

export const OMNIHUMAN_TASK_PREFIX = 'omnihuman:'

/** 官方/聚合侧常见 req_key；可用环境变量覆盖 */
const DEFAULT_VIDEO_REQ_KEYS = [
  'jimeng_realman_avatar_picture_omni_v15',
  'volces_realman_avatar_picture_omni_v15',
  'jimeng_realman_avatar_picture_omni',
] as const

export function resolveVolcVisualCredentials(env: MerchantAiEnv): {
  accessKeyId: string
  secretAccessKey: string
  region: string
} | null {
  const accessKeyId = (
    env.MERCHANT_AI_VOLC_ACCESS_KEY ??
    env.VOLC_ACCESSKEY ??
    env.VOLC_ACCESS_KEY_ID ??
    env.VOLC_AK ??
    ''
  ).trim()
  const secretAccessKey = (
    env.MERCHANT_AI_VOLC_SECRET_KEY ??
    env.VOLC_SECRETKEY ??
    env.VOLC_SECRET_ACCESS_KEY ??
    env.VOLC_SK ??
    ''
  ).trim()
  if (!accessKeyId || !secretAccessKey) return null
  const region = (env.MERCHANT_AI_VOLC_REGION ?? env.VOLC_REGION ?? 'cn-north-1').trim() || 'cn-north-1'
  return { accessKeyId, secretAccessKey, region }
}

export function isOmniHumanConfigured(env: MerchantAiEnv): boolean {
  return Boolean(resolveVolcVisualCredentials(env))
}

export function isOmniHumanTaskId(taskId: string): boolean {
  return String(taskId || '')
    .trim()
    .toLowerCase()
    .startsWith(OMNIHUMAN_TASK_PREFIX)
}

export function stripOmniHumanTaskPrefix(taskId: string): string {
  const t = String(taskId || '').trim()
  if (isOmniHumanTaskId(t)) return t.slice(OMNIHUMAN_TASK_PREFIX.length)
  return t
}

function videoReqKeys(env: MerchantAiEnv): string[] {
  const custom = (env.MERCHANT_AI_OMNIHUMAN_REQ_KEY ?? '').trim()
  if (custom) return [custom, ...DEFAULT_VIDEO_REQ_KEYS.filter((k) => k !== custom)]
  return [...DEFAULT_VIDEO_REQ_KEYS]
}

async function postVolcVisual(
  creds: { accessKeyId: string; secretAccessKey: string; region: string },
  action: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; message: string; status?: number }> {
  const signed = signVolcVisualJsonPost({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    region: creds.region,
    action,
    body,
  })
  let res: Response
  try {
    res = await fetch(signed.url, {
      method: 'POST',
      headers: signed.headers,
      body: signed.body,
    })
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
  let j: Record<string, unknown> = {}
  try {
    j = (await res.json()) as Record<string, unknown>
  } catch {
    /* empty */
  }
  const code = j.code ?? j.Code ?? (j.ResponseMetadata as { Error?: { Code?: string } } | undefined)?.Error?.Code
  const msg =
    (typeof j.message === 'string' && j.message) ||
    (typeof j.Message === 'string' && j.Message) ||
    (j.ResponseMetadata as { Error?: { Message?: string } } | undefined)?.Error?.Message ||
    `火山视觉 HTTP ${res.status}`
  if (!res.ok) {
    return { ok: false, message: String(msg), status: res.status }
  }
  if (code !== undefined && code !== 0 && code !== '0' && code !== 10000 && String(code) !== 'Success') {
    const nested = j.data as Record<string, unknown> | undefined
    const nestedMsg = typeof nested?.message === 'string' ? nested.message : ''
    return { ok: false, message: nestedMsg || String(msg), status: res.status }
  }
  return { ok: true, json: j }
}

function extractTaskId(j: Record<string, unknown>): string {
  const data = (j.data ?? j.Data ?? j.result ?? {}) as Record<string, unknown>
  const candidates = [data.task_id, data.taskId, data.JobId, j.task_id, j.taskId]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

function extractVideoUrl(j: Record<string, unknown>): string | undefined {
  const data = (j.data ?? j.Data ?? {}) as Record<string, unknown>
  const direct = [data.video_url, data.videoUrl, data.url, j.video_url]
  for (const c of direct) {
    if (typeof c === 'string' && /^https?:\/\//i.test(c.trim())) return c.trim()
  }
  const respData = data.resp_data
  if (typeof respData === 'string' && respData.trim()) {
    try {
      const parsed = JSON.parse(respData) as Record<string, unknown>
      const u = parsed.video_url ?? parsed.url
      if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u.trim()
    } catch {
      /* ignore */
    }
  }
  const urls = data.urls ?? data.video_urls ?? data.binary_data_url_list
  if (Array.isArray(urls)) {
    for (const u of urls) {
      if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u.trim()
      if (u && typeof u === 'object') {
        const ou = (u as { url?: unknown }).url
        if (typeof ou === 'string' && /^https?:\/\//i.test(ou)) return ou.trim()
      }
    }
  }
  return undefined
}

function extractStatus(j: Record<string, unknown>): string {
  const data = (j.data ?? j.Data ?? {}) as Record<string, unknown>
  const s = data.status ?? data.task_status ?? data.Status ?? j.status
  return String(s ?? '').trim().toLowerCase()
}

export type OmniHumanPollState = {
  phase: 'queued' | 'running' | 'succeeded' | 'failed'
  statusLabel: string
  videoUrl?: string
  failReason?: string
}

export async function volcSubmitOmniHumanTask(
  env: MerchantAiEnv,
  opts: {
    imageUrl: string
    audioUrl: string
    prompt?: string
    peFastMode?: boolean
  },
): Promise<{ ok: true; taskId: string; reqKey: string } | { ok: false; message: string }> {
  const creds = resolveVolcVisualCredentials(env)
  if (!creds) {
    return {
      ok: false,
      message:
        '未配置火山智能视觉 AK/SK，无法使用 OmniHuman。请在轻量 auth-api.env 配置 MERCHANT_AI_VOLC_ACCESS_KEY 与 MERCHANT_AI_VOLC_SECRET_KEY（即梦/视觉内容生成控制台）。',
    }
  }
  const imageUrl = opts.imageUrl.trim()
  const audioUrl = opts.audioUrl.trim()
  if (!/^https?:\/\//i.test(imageUrl)) {
    return { ok: false, message: 'OmniHuman 需要公网可访问的人像/场景图 URL' }
  }
  if (!/^https?:\/\//i.test(audioUrl)) {
    return { ok: false, message: 'OmniHuman 需要公网可访问的口播音频 URL' }
  }

  let lastMsg = 'OmniHuman 提交失败'
  for (const reqKey of videoReqKeys(env)) {
    const body: Record<string, unknown> = {
      req_key: reqKey,
      image_url: imageUrl,
      audio_url: audioUrl,
    }
    if (opts.prompt?.trim()) body.prompt = opts.prompt.trim().slice(0, 500)
    if (opts.peFastMode) body.pe_fast_mode = true

    const r = await postVolcVisual(creds, 'CVSync2AsyncSubmitTask', body)
    if (!r.ok) {
      lastMsg = `${reqKey}: ${r.message}`
      if (/not.?found|unknown.?req|req_key|不支持|未开通|invalid/i.test(r.message)) continue
      return { ok: false, message: r.message }
    }
    const tid = extractTaskId(r.json)
    if (!tid) {
      lastMsg = `${reqKey}: 未返回 task_id`
      continue
    }
    return { ok: true, taskId: `${OMNIHUMAN_TASK_PREFIX}${tid}`, reqKey }
  }
  return { ok: false, message: lastMsg }
}

export async function volcGetOmniHumanTaskOnce(
  env: MerchantAiEnv,
  taskIdRaw: string,
  reqKeyHint?: string,
): Promise<OmniHumanPollState> {
  const creds = resolveVolcVisualCredentials(env)
  if (!creds) {
    return { phase: 'failed', statusLabel: 'FAILED', failReason: '未配置火山视觉 AK/SK' }
  }
  const taskId = stripOmniHumanTaskPrefix(taskIdRaw)
  const keys = reqKeyHint?.trim()
    ? [reqKeyHint.trim(), ...videoReqKeys(env)]
    : videoReqKeys(env)

  let lastFail = '查询失败'
  for (const reqKey of keys) {
    const r = await postVolcVisual(creds, 'CVSync2AsyncGetResult', {
      req_key: reqKey,
      task_id: taskId,
    })
    if (!r.ok) {
      lastFail = r.message
      continue
    }
    const status = extractStatus(r.json)
    const videoUrl = extractVideoUrl(r.json)
    if (videoUrl && (/succ|done|finish|complete|success/i.test(status) || !status)) {
      return { phase: 'succeeded', statusLabel: status || 'SUCCEEDED', videoUrl }
    }
    if (/fail|error|cancel/i.test(status)) {
      const data = (r.json.data ?? {}) as Record<string, unknown>
      const reason =
        (typeof data.message === 'string' && data.message) ||
        (typeof r.json.message === 'string' && r.json.message) ||
        status
      return { phase: 'failed', statusLabel: status || 'FAILED', failReason: String(reason) }
    }
    if (/queue|pending|waiting|submit/i.test(status)) {
      return { phase: 'queued', statusLabel: status || 'QUEUED' }
    }
    if (videoUrl) {
      return { phase: 'succeeded', statusLabel: status || 'SUCCEEDED', videoUrl }
    }
    return { phase: 'running', statusLabel: status || 'RUNNING' }
  }
  return { phase: 'failed', statusLabel: 'FAILED', failReason: lastFail }
}
