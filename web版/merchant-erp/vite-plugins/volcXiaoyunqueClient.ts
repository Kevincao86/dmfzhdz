/**
 * 火山即梦 · 小云雀智能生视频 Agent（文档 85621）
 *
 * 提交：CVSync2AsyncSubmitTask
 * 查询：CVSync2AsyncGetResult
 * Version: 2022-08-31
 * 默认无参考 req_key: jimeng_video_agent_v20
 * 有参考：jimeng_video_agent_v20_ref
 *
 * 凭据：运营台 videoAi.jimengAccessKeyId/SK → JIMENG_*，或轻量 MERCHANT_AI_VOLC_*。
 * 可用 MERCHANT_AI_XIAOYUNQUE_REQ_KEY / SUBMIT_ACTION / GET_ACTION 覆盖。
 */
import type { MerchantAiEnv } from './merchantAiUpstream.js'
import { signVolcVisualJsonPost } from './volcVisualSign.js'
import { resolveVolcVisualCredentials } from './volcOmniHumanClient.js'

export const XIAOYUNQUE_TASK_PREFIX = 'xyq:'

const XYQ_VERSION = '2022-08-31'
const XYQ_SUBMIT_ACTION = 'CVSync2AsyncSubmitTask'
const XYQ_GET_ACTION = 'CVSync2AsyncGetResult'
const XYQ_REQ_KEY_NOREF = 'jimeng_video_agent_v20'
const XYQ_REQ_KEY_REF = 'jimeng_video_agent_v20_ref'

const NOREF_KEYS = [
  XYQ_REQ_KEY_NOREF,
  'jimeng_video_agent_v20_noref',
  'jimeng_video_agent_v2',
  'jimeng_xyq_video_agent_v20',
]

const REF_KEYS = [XYQ_REQ_KEY_REF, 'jimeng_video_agent_v20_with_ref']

export function isXiaoyunqueConfigured(env: MerchantAiEnv): boolean {
  return Boolean(resolveVolcVisualCredentials(env))
}

export function isXiaoyunqueTaskId(taskId: string): boolean {
  return String(taskId || '')
    .trim()
    .toLowerCase()
    .startsWith(XIAOYUNQUE_TASK_PREFIX)
}

export function stripXiaoyunqueTaskPrefix(taskId: string): string {
  const t = String(taskId || '').trim()
  if (isXiaoyunqueTaskId(t)) return t.slice(XIAOYUNQUE_TASK_PREFIX.length)
  return t
}

function encodeTaskToken(reqKey: string, getAction: string, rawTaskId: string): string {
  const pack = Buffer.from(JSON.stringify({ k: reqKey, g: getAction, t: rawTaskId }), 'utf8').toString(
    'base64url',
  )
  return `${XIAOYUNQUE_TASK_PREFIX}${pack}`
}

function decodeTaskToken(taskIdRaw: string): {
  reqKey: string
  getAction: string
  taskId: string
} | null {
  const raw = stripXiaoyunqueTaskPrefix(taskIdRaw)
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
    /* plain */
  }
  return {
    reqKey: XYQ_REQ_KEY_NOREF,
    getAction: XYQ_GET_ACTION,
    taskId: raw,
  }
}

function reqKeyAttempts(env: MerchantAiEnv, hasRef: boolean): Array<{
  action: string
  version: string
  reqKey: string
  getAction: string
}> {
  const customKey = (env.MERCHANT_AI_XIAOYUNQUE_REQ_KEY ?? '').trim()
  const customAction = (env.MERCHANT_AI_XIAOYUNQUE_SUBMIT_ACTION ?? '').trim()
  const customGet = (env.MERCHANT_AI_XIAOYUNQUE_GET_ACTION ?? '').trim()
  const keys = hasRef ? [...REF_KEYS, ...NOREF_KEYS] : [...NOREF_KEYS]
  const base = keys.map((reqKey) => ({
    action: XYQ_SUBMIT_ACTION,
    version: XYQ_VERSION,
    reqKey,
    getAction: XYQ_GET_ACTION,
  }))
  if (customKey || customAction) {
    return [
      {
        action: customAction || XYQ_SUBMIT_ACTION,
        version: XYQ_VERSION,
        reqKey: customKey || (hasRef ? XYQ_REQ_KEY_REF : XYQ_REQ_KEY_NOREF),
        getAction: customGet || XYQ_GET_ACTION,
      },
      ...base,
    ]
  }
  return base
}

function unwrapVolcResult(j: Record<string, unknown>): {
  code: unknown
  message: string
  data: Record<string, unknown>
} {
  const metaErr = (j.ResponseMetadata as { Error?: { Message?: string; Code?: string } } | undefined)
    ?.Error
  const result = (j.Result ?? j.result ?? j.data ?? j) as Record<string, unknown>
  const data =
    result && typeof result === 'object' && result.data && typeof result.data === 'object'
      ? (result.data as Record<string, unknown>)
      : result && typeof result === 'object'
        ? result
        : {}
  const message =
    (typeof result?.message === 'string' && result.message) ||
    (typeof data.message === 'string' && data.message) ||
    (typeof j.message === 'string' && j.message) ||
    (typeof metaErr?.Message === 'string' && metaErr.Message) ||
    ''
  return { code: result?.code ?? data.code ?? j.code ?? metaErr?.Code, message, data }
}

function isVolcVisualRateLimitError(msg: string): boolean {
  return /接口超限|请求超限|并发超限|模型接口超限|50429|50430|concurrent|try later|限流|频率|too many|rate.?limit/i.test(
    msg,
  )
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

function humanizeXiaoyunqueError(raw: string): string {
  const t = String(raw || '').trim()
  if (/Access\s*Denied|50400|not\s*authorized|未开通/i.test(t)) {
    return (
      '小云雀 Agent 未开通或 AK 无权限。请到火山控制台开通「即梦 AI · 小云雀智能生视频 Agent」，' +
      '并在运营台「短剧 AI 制作」填写视觉云 AK/SK。'
    )
  }
  if (/not supported|req_key/i.test(t)) {
    return (
      '当前账号不支持该小云雀 req_key。请确认已开通智能生视频 Agent 2.0（无参考），或联系管理员配置 MERCHANT_AI_XIAOYUNQUE_REQ_KEY。' +
      `（原始：${t.slice(0, 140)}）`
    )
  }
  if (isVolcVisualRateLimitError(t)) {
    return '小云雀接口瞬时超限，请隔 1～2 分钟再生成。'
  }
  return t || '小云雀任务提交失败'
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
    return { ok: false, message: unwrapped.message || `火山视觉 HTTP ${res.status}`, status: res.status }
  }
  return { ok: true, json: j }
}

async function postVolcVisualWithRetry(
  creds: { accessKeyId: string; secretAccessKey: string; region: string },
  action: string,
  version: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; message: string; status?: number }> {
  let last: { ok: false; message: string; status?: number } | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await postVolcVisual(creds, action, version, body)
    if (r.ok) return r
    last = r
    if (attempt < 3 && isVolcVisualRateLimitError(r.message)) {
      await sleepMs(1500 * 2 ** attempt)
      continue
    }
    return { ok: false, message: humanizeXiaoyunqueError(r.message), status: r.status }
  }
  return {
    ok: false,
    message: humanizeXiaoyunqueError(last?.message || '小云雀提交失败'),
    status: last?.status,
  }
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
      const u = parsed.video_url ?? parsed.url ?? parsed.output_video_url
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

export type XiaoyunquePollState = {
  phase: 'queued' | 'running' | 'succeeded' | 'failed'
  statusLabel: string
  videoUrl?: string
  failReason?: string
}

function clampDurationSec(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 30
  return Math.min(900, Math.max(5, Math.round(n)))
}

function bodyVariants(opts: {
  prompt: string
  durationSec: number
  aspectRatio: string
  imageUrls?: string[]
}): Record<string, unknown>[] {
  const prompt = opts.prompt.trim().slice(0, 4000)
  const duration = opts.durationSec
  const aspect_ratio = opts.aspectRatio
  const imageUrls = (opts.imageUrls ?? []).filter((u) => /^https?:\/\//i.test(u)).slice(0, 4)
  const base: Record<string, unknown> = { prompt, aspect_ratio }
  const withImages =
    imageUrls.length > 0
      ? [{ ...base, image_urls: imageUrls }, { ...base, image_url: imageUrls[0] }]
      : [{ ...base }]

  const out: Record<string, unknown>[] = []
  for (const b of withImages) {
    out.push({ ...b, duration })
    out.push({ ...b, duration: String(duration) })
    out.push({
      ...b,
      req_json: JSON.stringify({ duration, aspect_ratio, target_duration: duration }),
    })
    if (duration <= 15) {
      out.push({ ...b, frames: 24 * duration + 1 })
    }
  }
  // 最后兜底：时长写进 prompt，仅传 prompt + ratio
  out.push({
    prompt: `${prompt}\n目标成片时长约 ${duration} 秒，竖屏 ${aspect_ratio}。`,
    aspect_ratio,
  })
  return out
}

export async function volcSubmitXiaoyunqueTask(
  env: MerchantAiEnv,
  opts: {
    prompt: string
    durationSec: number
    aspectRatio?: string
    imageUrls?: string[]
  },
): Promise<{ ok: true; taskId: string; reqKey: string } | { ok: false; message: string }> {
  const creds = resolveVolcVisualCredentials(env)
  if (!creds) {
    return {
      ok: false,
      message:
        '未配置即梦/小云雀视觉云 AK/SK。请到运营台「短剧 AI 制作」填写，或在轻量 auth-api.env 配置 JIMENG_ACCESS_KEY_ID / JIMENG_SECRET_ACCESS_KEY。',
    }
  }
  const prompt = opts.prompt.trim()
  if (!prompt) return { ok: false, message: '缺少小云雀生成提示词。' }
  const durationSec = clampDurationSec(opts.durationSec)
  const aspectRatio = (opts.aspectRatio || '9:16').trim() || '9:16'
  const hasRef = (opts.imageUrls ?? []).some((u) => /^https?:\/\//i.test(String(u || '')))

  const errors: string[] = []
  for (const attempt of reqKeyAttempts(env, hasRef)) {
    for (const fields of bodyVariants({
      prompt,
      durationSec,
      aspectRatio,
      imageUrls: opts.imageUrls,
    })) {
      const body: Record<string, unknown> = { req_key: attempt.reqKey, ...fields }
      const r = await postVolcVisualWithRetry(creds, attempt.action, attempt.version, body)
      if (!r.ok) {
        errors.push(`${attempt.reqKey}: ${r.message}`)
        if (/50400|Access\s*Denied/i.test(r.message)) {
          return { ok: false, message: humanizeXiaoyunqueError(r.message) }
        }
        // req_key 不被支持 → 换下一个 key
        if (/not supported|req_key|不支持|invalid/i.test(r.message)) break
        continue
      }
      const rawId = extractTaskId(r.json)
      if (!rawId) {
        errors.push(`${attempt.reqKey}: 未返回 task_id`)
        continue
      }
      return {
        ok: true,
        taskId: encodeTaskToken(attempt.reqKey, attempt.getAction, rawId),
        reqKey: attempt.reqKey,
      }
    }
  }
  return {
    ok: false,
    message: humanizeXiaoyunqueError(errors.slice(0, 3).join('；') || '小云雀提交失败'),
  }
}

export async function volcGetXiaoyunqueTaskOnce(
  env: MerchantAiEnv,
  taskIdRaw: string,
): Promise<XiaoyunquePollState> {
  const creds = resolveVolcVisualCredentials(env)
  if (!creds) {
    return { phase: 'failed', statusLabel: '未配置凭据', failReason: '缺少视觉云 AK/SK' }
  }
  const decoded = decodeTaskToken(taskIdRaw)
  if (!decoded?.taskId) {
    return { phase: 'failed', statusLabel: '无效任务', failReason: 'taskId 无效' }
  }
  const body = { req_key: decoded.reqKey, task_id: decoded.taskId }
  const r = await postVolcVisualWithRetry(creds, decoded.getAction, XYQ_VERSION, body)
  if (!r.ok) {
    return { phase: 'failed', statusLabel: '查询失败', failReason: r.message }
  }
  const status = extractStatus(r.json)
  const videoUrl = extractVideoUrl(r.json)
  if (videoUrl || /done|success|succeed|completed|finish/i.test(status)) {
    if (videoUrl) {
      return { phase: 'succeeded', statusLabel: '已完成', videoUrl }
    }
  }
  if (/fail|error|expired|not_found|cancel/i.test(status)) {
    const { message } = unwrapVolcResult(r.json)
    return {
      phase: 'failed',
      statusLabel: status || '失败',
      failReason: humanizeXiaoyunqueError(message || status),
    }
  }
  if (/queue|pending|wait|submit/i.test(status)) {
    return { phase: 'queued', statusLabel: status || '排队中' }
  }
  return { phase: 'running', statusLabel: status || '生成中' }
}

/** 网关入口：从 seedance/start body 提交小云雀 */
export async function volcPostXiaoyunqueVideoTask(
  env: MerchantAiEnv,
  parsed: Record<string, unknown>,
): Promise<{ ok: true; taskId: string; modelUsed: string } | { ok: false; msg: string }> {
  const prompt = String(parsed.prompt ?? '').trim()
  const flags = typeof parsed.flags === 'string' ? parsed.flags : ''
  const durFromFlags = /--dur\s+(\d+)/i.exec(flags)
  const durationSec = clampDurationSec(
    parsed.durationSec ?? parsed.duration ?? (durFromFlags ? Number(durFromFlags[1]) : 30),
  )
  const aspect =
    /--ratio\s+([0-9:.]+)/i.exec(flags)?.[1] ||
    String(parsed.aspect_ratio ?? parsed.aspectRatio ?? '9:16').trim() ||
    '9:16'
  const imageUrls: string[] = []
  const single = String(parsed.image_url ?? '').trim()
  if (/^https?:\/\//i.test(single)) imageUrls.push(single)
  if (Array.isArray(parsed.image_urls)) {
    for (const u of parsed.image_urls) {
      if (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) imageUrls.push(u.trim())
    }
  }
  const r = await volcSubmitXiaoyunqueTask(env, {
    prompt,
    durationSec,
    aspectRatio: aspect,
    imageUrls,
  })
  if (!r.ok) return { ok: false, msg: r.message }
  return { ok: true, taskId: r.taskId, modelUsed: r.reqKey }
}
