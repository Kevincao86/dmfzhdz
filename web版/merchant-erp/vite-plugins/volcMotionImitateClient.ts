/**
 * 火山即梦动作模仿 2.0（DreamActor）：单图 + 参考视频驱动人物动作/口型
 *
 * 提交：CVSync2AsyncSubmitTask
 * 查询：CVSync2AsyncGetResult
 * Version: 2022-08-31
 * 默认 req_key: jimeng_dream_actor_m1_gen_video_cv
 * 可用 MERCHANT_AI_MOTION_REQ_KEY / SUBMIT_ACTION / GET_ACTION 覆盖。
 */
import type { MerchantAiEnv } from './merchantAiUpstream.js'
import { signVolcVisualJsonPost } from './volcVisualSign.js'
import { resolveVolcVisualCredentials, isOmniHumanConfigured } from './volcOmniHumanClient.js'

export const MOTION_IMITATE_TASK_PREFIX = 'motion:'

const MOTION_REQ_KEY = 'jimeng_dream_actor_m1_gen_video_cv'
const MOTION_VERSION = '2022-08-31'
const MOTION_SUBMIT_ACTION = 'CVSync2AsyncSubmitTask'
const MOTION_GET_ACTION = 'CVSync2AsyncGetResult'

const FALLBACK_ATTEMPTS: Array<{
  action: string
  version: string
  reqKey: string
  getAction: string
}> = [
  {
    action: MOTION_SUBMIT_ACTION,
    version: MOTION_VERSION,
    reqKey: MOTION_REQ_KEY,
    getAction: MOTION_GET_ACTION,
  },
  {
    action: MOTION_SUBMIT_ACTION,
    version: MOTION_VERSION,
    reqKey: 'jimeng_dream_actor_gen_video_cv',
    getAction: MOTION_GET_ACTION,
  },
]

export function isMotionImitateConfigured(env: MerchantAiEnv): boolean {
  return isOmniHumanConfigured(env)
}

export function isMotionImitateTaskId(taskId: string): boolean {
  return String(taskId || '')
    .trim()
    .toLowerCase()
    .startsWith(MOTION_IMITATE_TASK_PREFIX)
}

export function stripMotionImitateTaskPrefix(taskId: string): string {
  const t = String(taskId || '').trim()
  if (isMotionImitateTaskId(t)) return t.slice(MOTION_IMITATE_TASK_PREFIX.length)
  return t
}

function encodeTaskToken(reqKey: string, getAction: string, rawTaskId: string): string {
  const pack = Buffer.from(JSON.stringify({ k: reqKey, g: getAction, t: rawTaskId }), 'utf8').toString(
    'base64url',
  )
  return `${MOTION_IMITATE_TASK_PREFIX}${pack}`
}

function decodeTaskToken(taskIdRaw: string): {
  reqKey: string
  getAction: string
  taskId: string
} | null {
  const raw = stripMotionImitateTaskPrefix(taskIdRaw)
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      k?: string
      g?: string
      t?: string
    }
    if (parsed.t && parsed.k && parsed.g) {
      return { reqKey: parsed.k, getAction: parsed.g, taskId: parsed.t }
    }
  } catch {
    /* plain task id */
  }
  return {
    reqKey: MOTION_REQ_KEY,
    getAction: MOTION_GET_ACTION,
    taskId: raw,
  }
}

function attemptsForEnv(env: MerchantAiEnv): typeof FALLBACK_ATTEMPTS {
  const customKey = (env.MERCHANT_AI_MOTION_REQ_KEY ?? '').trim()
  const customAction = (env.MERCHANT_AI_MOTION_SUBMIT_ACTION ?? '').trim()
  const customGet = (env.MERCHANT_AI_MOTION_GET_ACTION ?? '').trim()
  if (customKey || customAction) {
    return [
      {
        action: customAction || MOTION_SUBMIT_ACTION,
        version: MOTION_VERSION,
        reqKey: customKey || MOTION_REQ_KEY,
        getAction: customGet || MOTION_GET_ACTION,
      },
      ...FALLBACK_ATTEMPTS,
    ]
  }
  return FALLBACK_ATTEMPTS
}

function unwrapVolcResult(j: Record<string, unknown>): {
  code: unknown
  message: string
  data: Record<string, unknown>
} {
  const dataRaw = j.data
  const data =
    dataRaw && typeof dataRaw === 'object' && !Array.isArray(dataRaw)
      ? (dataRaw as Record<string, unknown>)
      : j
  const message =
    (typeof j.message === 'string' && j.message) ||
    (typeof data.message === 'string' && data.message) ||
    ''
  return { code: j.code ?? data.code, message, data }
}

function humanizeMotionVolcError(raw: string): string {
  const t = String(raw || '').trim()
  if (/Access\s*Denied|50400|not\s*authorized|未开通/i.test(t)) {
    return '即梦动作模仿未开通或 AK 无权限。请到火山控制台开通「动作模仿 2.0」后重试。'
  }
  if (/concurrent|50430|try later|限流|频率/i.test(t)) {
    return '动作模仿任务繁忙，请稍后再试。'
  }
  if (/video|时长|duration|too long|oversize|过大/i.test(t)) {
    return t || '参考视频不符合动作模仿要求（建议竖版 MP4、约 3～15 秒、12MB 内）。'
  }
  return t || '动作模仿提交失败'
}

async function postVolcVisual(
  creds: { accessKeyId: string; secretAccessKey: string; region: string },
  action: string,
  version: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; message: string; status?: number }> {
  const signed = signVolcVisualJsonPost({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    region: creds.region,
    action,
    version,
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
    return { ok: false, message: `火山视觉 HTTP ${res.status}`, status: res.status }
  }
  const unwrapped = unwrapVolcResult(j)
  const codeNum = Number(unwrapped.code)
  const businessFail =
    unwrapped.code !== undefined &&
    unwrapped.code !== null &&
    unwrapped.code !== '' &&
    codeNum !== 0 &&
    codeNum !== 10000 &&
    String(unwrapped.code).toLowerCase() !== 'success'
  if (!res.ok || businessFail) {
    return { ok: false, message: humanizeMotionVolcError(unwrapped.message || `火山视觉 HTTP ${res.status}`), status: res.status }
  }
  return { ok: true, json: j }
}

function extractTaskId(j: Record<string, unknown>): string {
  const { data } = unwrapVolcResult(j)
  const candidates = [data.task_id, data.taskId, data.JobId, data.job_id]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  const respData = data.resp_data
  if (typeof respData === 'string' && respData.trim()) {
    try {
      const parsed = JSON.parse(respData) as Record<string, unknown>
      const u = parsed.task_id ?? parsed.taskId
      if (typeof u === 'string' && u.trim()) return u.trim()
    } catch {
      /* ignore */
    }
  }
  return ''
}

function extractVideoUrl(j: Record<string, unknown>): string | undefined {
  const { data } = unwrapVolcResult(j)
  const direct = [data.video_url, data.videoUrl, data.url]
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
  const { data } = unwrapVolcResult(j)
  const s = data.status ?? data.task_status ?? data.Status
  return String(s ?? '').trim().toLowerCase()
}

export type MotionImitatePollState = {
  phase: 'queued' | 'running' | 'succeeded' | 'failed'
  statusLabel: string
  videoUrl?: string
  failReason?: string
}

function bodyVariants(imageUrl: string, videoUrl: string, prompt?: string): Record<string, unknown>[] {
  const extra = prompt?.trim() ? { prompt: prompt.trim().slice(0, 500) } : {}
  return [
    { image_urls: [imageUrl], video_urls: [videoUrl], ...extra },
    { image_url: imageUrl, video_url: videoUrl, ...extra },
    { image_urls: [imageUrl], video_url: videoUrl, ...extra },
  ]
}

export async function volcSubmitMotionImitateTask(
  env: MerchantAiEnv,
  opts: { imageUrl: string; videoUrl: string; prompt?: string },
): Promise<{ ok: true; taskId: string; reqKey: string } | { ok: false; message: string }> {
  const creds = resolveVolcVisualCredentials(env)
  if (!creds) {
    return {
      ok: false,
      message:
        '未配置火山智能视觉 AK/SK，无法使用动作模仿。请在轻量 auth-api.env 配置 MERCHANT_AI_VOLC_ACCESS_KEY 与 MERCHANT_AI_VOLC_SECRET_KEY。',
    }
  }
  const imageUrl = opts.imageUrl.trim()
  const videoUrl = opts.videoUrl.trim()
  if (!/^https?:\/\//i.test(imageUrl)) {
    return { ok: false, message: '动作模仿需要公网可访问的人物参考图 URL' }
  }
  if (!/^https?:\/\//i.test(videoUrl)) {
    return { ok: false, message: '动作模仿需要公网可访问的参考视频 URL' }
  }

  const errors: string[] = []
  for (const attempt of attemptsForEnv(env)) {
    for (const fields of bodyVariants(imageUrl, videoUrl, opts.prompt)) {
      const body: Record<string, unknown> = { req_key: attempt.reqKey, ...fields }
      const r = await postVolcVisual(creds, attempt.action, attempt.version, body)
      if (!r.ok) {
        errors.push(`${attempt.reqKey}: ${r.message}`)
        if (/concurrent|50430|try later|限流|频率/i.test(r.message)) {
          return { ok: false, message: humanizeMotionVolcError(r.message) }
        }
        if (/50400|Access\s*Denied/i.test(r.message)) {
          return { ok: false, message: humanizeMotionVolcError(r.message) }
        }
        continue
      }
      const tid = extractTaskId(r.json)
      if (!tid) {
        errors.push(`${attempt.reqKey}: 未返回 task_id`)
        continue
      }
      return {
        ok: true,
        taskId: encodeTaskToken(attempt.reqKey, attempt.getAction, tid),
        reqKey: attempt.reqKey,
      }
    }
  }
  return {
    ok: false,
    message: humanizeMotionVolcError(
      errors[0] || '动作模仿提交失败：账号可能未开通即梦动作模仿 2.0，请到火山控制台开通后重试',
    ),
  }
}

export async function volcGetMotionImitateTaskOnce(
  env: MerchantAiEnv,
  taskIdRaw: string,
): Promise<MotionImitatePollState> {
  const creds = resolveVolcVisualCredentials(env)
  if (!creds) {
    return { phase: 'failed', statusLabel: 'FAILED', failReason: '未配置火山视觉 AK/SK' }
  }
  const decoded = decodeTaskToken(taskIdRaw)
  if (!decoded?.taskId) {
    return { phase: 'failed', statusLabel: 'FAILED', failReason: '无效的动作模仿 taskId' }
  }

  const r = await postVolcVisual(creds, decoded.getAction || MOTION_GET_ACTION, MOTION_VERSION, {
    req_key: decoded.reqKey,
    task_id: decoded.taskId,
  })
  if (!r.ok) {
    return { phase: 'running', statusLabel: 'RUNNING', failReason: r.message }
  }
  const status = extractStatus(r.json)
  const videoUrl = extractVideoUrl(r.json)
  if (videoUrl && (/succ|done|finish|complete|success/i.test(status) || !status || status === '0')) {
    return { phase: 'succeeded', statusLabel: status || 'SUCCEEDED', videoUrl }
  }
  if (/fail|error|cancel/i.test(status)) {
    const { message } = unwrapVolcResult(r.json)
    return {
      phase: 'failed',
      statusLabel: status || 'FAILED',
      failReason: humanizeMotionVolcError(message || '动作模仿生成失败'),
    }
  }
  return { phase: 'running', statusLabel: status || 'RUNNING' }
}
