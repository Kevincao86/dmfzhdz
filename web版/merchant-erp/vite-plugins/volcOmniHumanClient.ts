/**
 * 火山即梦 OmniHuman 1.5：单图 + 音频驱动数字人口播
 *
 * 须走专用 Action（不是 CVSync2AsyncSubmitTask）：
 * - 提交：JimengRealmanAvatarPictureOmniV15SubmitTask
 * - 查询：JimengRealmanAvatarPictureOmniV15GetResult
 * Version: 2024-06-06，req_key: jimeng_realman_avatar_picture_omni_v15
 */
import type { MerchantAiEnv } from './merchantAiUpstream.js'
import { signVolcVisualJsonPost } from './volcVisualSign.js'

export const OMNIHUMAN_TASK_PREFIX = 'omnihuman:'

const OMNI_V15_REQ_KEY = 'jimeng_realman_avatar_picture_omni_v15'
const OMNI_V15_VERSION = '2024-06-06'
const OMNI_V15_SUBMIT_ACTION = 'JimengRealmanAvatarPictureOmniV15SubmitTask'
const OMNI_V15_GET_ACTION = 'JimengRealmanAvatarPictureOmniV15GetResult'

/** 备用：旧版 Omni v2 / 同步异步通用接口（账号开通时才可用） */
const FALLBACK_ATTEMPTS: Array<{
  action: string
  version: string
  reqKey: string
  getAction: string
}> = [
  {
    action: OMNI_V15_SUBMIT_ACTION,
    version: OMNI_V15_VERSION,
    reqKey: OMNI_V15_REQ_KEY,
    getAction: OMNI_V15_GET_ACTION,
  },
  {
    action: 'RealmanAvatarPictureOmniV2SubmitTask',
    version: OMNI_V15_VERSION,
    reqKey: 'jimeng_realman_avatar_picture_omni_v2',
    getAction: 'RealmanAvatarPictureOmniV2GetResult',
  },
]

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

/** taskId 内嵌 req_key / getAction，便于轮询：omnihuman:v15:<taskId> */
function encodeTaskToken(reqKey: string, getAction: string, rawTaskId: string): string {
  const pack = Buffer.from(
    JSON.stringify({ k: reqKey, g: getAction, t: rawTaskId }),
    'utf8',
  ).toString('base64url')
  return `${OMNIHUMAN_TASK_PREFIX}${pack}`
}

function decodeTaskToken(taskIdRaw: string): {
  reqKey: string
  getAction: string
  taskId: string
} | null {
  const raw = stripOmniHumanTaskPrefix(taskIdRaw)
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
    /* plain task id fallback */
  }
  return {
    reqKey: OMNI_V15_REQ_KEY,
    getAction: OMNI_V15_GET_ACTION,
    taskId: raw,
  }
}

function attemptsForEnv(env: MerchantAiEnv): typeof FALLBACK_ATTEMPTS {
  const customKey = (env.MERCHANT_AI_OMNIHUMAN_REQ_KEY ?? '').trim()
  const customAction = (env.MERCHANT_AI_OMNIHUMAN_SUBMIT_ACTION ?? '').trim()
  const customGet = (env.MERCHANT_AI_OMNIHUMAN_GET_ACTION ?? '').trim()
  if (customKey || customAction) {
    return [
      {
        action: customAction || OMNI_V15_SUBMIT_ACTION,
        version: OMNI_V15_VERSION,
        reqKey: customKey || OMNI_V15_REQ_KEY,
        getAction: customGet || OMNI_V15_GET_ACTION,
      },
      ...FALLBACK_ATTEMPTS,
    ]
  }
  return FALLBACK_ATTEMPTS
}

function unwrapVolcResult(j: Record<string, unknown>): {
  code: number | string | undefined
  message: string
  data: Record<string, unknown>
  httpOkHint: boolean
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
  const codeRaw = result?.code ?? result?.status ?? j.code ?? metaErr?.Code
  const code =
    typeof codeRaw === 'string' || typeof codeRaw === 'number' ? codeRaw : undefined
  const message =
    (typeof result?.message === 'string' && result.message) ||
    (typeof j.message === 'string' && j.message) ||
    (typeof metaErr?.Message === 'string' && metaErr.Message) ||
    ''
  return { code, message, data, httpOkHint: !metaErr }
}

/** 将火山 50400 / Access Denied 等转为可执行说明（避免只显示英文拒答） */
export function humanizeOmniHumanVolcError(raw: string): string {
  const msg = String(raw || '').trim()
  if (!msg) return 'OmniHuman 提交失败'
  if (/50400|Access\s*Denied/i.test(msg)) {
    return (
      '火山即梦 OmniHuman 返回 Access Denied（50400）：当前轻量 AK/SK 无权调用「OmniHuman 1.5 视频生成」。' +
      '请到火山控制台开通/续期「即梦 AI · OmniHuman 1.5」，确认该 Access Key 具备智能视觉(cv)权限且账户有余额；' +
      '若换了新 AK/SK，写入轻量 auth-api.env 的 MERCHANT_AI_VOLC_ACCESS_KEY / MERCHANT_AI_VOLC_SECRET_KEY 后重启 meoo-auth-api。' +
      `（原始：${msg.slice(0, 160)}）`
    )
  }
  if (/concurrent|50430|try later|限流|频率/i.test(msg)) {
    return `OmniHuman 限流，请稍后重试（${msg.slice(0, 120)}）`
  }
  if (/not supported|req_key/i.test(msg)) {
    return (
      'OmniHuman 接口或 req_key 不被当前账号支持，请确认已开通即梦 OmniHuman 1.5 公测/正式版。' +
      `（原始：${msg.slice(0, 160)}）`
    )
  }
  return msg
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
    const msg = humanizeOmniHumanVolcError(unwrapped.message || `火山视觉 HTTP ${res.status}`)
    return { ok: false, message: msg, status: res.status }
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
        '未配置火山智能视觉 AK/SK，无法使用 OmniHuman。请在轻量 auth-api.env 配置 MERCHANT_AI_VOLC_ACCESS_KEY 与 MERCHANT_AI_VOLC_SECRET_KEY。',
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

  const errors: string[] = []
  for (const attempt of attemptsForEnv(env)) {
    const body: Record<string, unknown> = {
      req_key: attempt.reqKey,
      image_url: imageUrl,
      audio_url: audioUrl,
    }
    if (opts.prompt?.trim()) body.prompt = opts.prompt.trim().slice(0, 500)
    if (opts.peFastMode) body.pe_fast_mode = true

    const r = await postVolcVisual(creds, attempt.action, attempt.version, body)
    if (!r.ok) {
      errors.push(`${attempt.action}/${attempt.reqKey}: ${r.message}`)
      if (/concurrent|50430|try later|限流|频率/i.test(r.message)) {
        return { ok: false, message: humanizeOmniHumanVolcError(r.message) }
      }
      if (/50400|Access\s*Denied/i.test(r.message)) {
        // 权限类错误换 Action 也不会通，直接返回可读说明
        return { ok: false, message: humanizeOmniHumanVolcError(r.message) }
      }
      continue
    }
    const tid = extractTaskId(r.json)
    if (!tid) {
      errors.push(`${attempt.action}: 未返回 task_id`)
      continue
    }
    return {
      ok: true,
      taskId: encodeTaskToken(attempt.reqKey, attempt.getAction, tid),
      reqKey: attempt.reqKey,
    }
  }
  return {
    ok: false,
    message: humanizeOmniHumanVolcError(
      errors[0] ||
        'OmniHuman 提交失败：账号可能未开通即梦 OmniHuman 1.5，请到火山控制台开通后重试',
    ),
  }
}

export async function volcGetOmniHumanTaskOnce(
  env: MerchantAiEnv,
  taskIdRaw: string,
): Promise<OmniHumanPollState> {
  const creds = resolveVolcVisualCredentials(env)
  if (!creds) {
    return { phase: 'failed', statusLabel: 'FAILED', failReason: '未配置火山视觉 AK/SK' }
  }
  const decoded = decodeTaskToken(taskIdRaw)
  if (!decoded?.taskId) {
    return { phase: 'failed', statusLabel: 'FAILED', failReason: '无效的 OmniHuman taskId' }
  }

  const getAttempts = [
    { action: decoded.getAction, version: OMNI_V15_VERSION, reqKey: decoded.reqKey },
    { action: OMNI_V15_GET_ACTION, version: OMNI_V15_VERSION, reqKey: OMNI_V15_REQ_KEY },
    {
      action: 'CVSync2AsyncGetResult',
      version: '2022-08-31',
      reqKey: decoded.reqKey,
    },
  ]

  let lastFail = '查询失败'
  for (const g of getAttempts) {
    const r = await postVolcVisual(creds, g.action, g.version, {
      req_key: g.reqKey,
      task_id: decoded.taskId,
    })
    if (!r.ok) {
      lastFail = humanizeOmniHumanVolcError(r.message)
      continue
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
        failReason: humanizeOmniHumanVolcError(message || status),
      }
    }
    if (/queue|pending|waiting|submit|in_queue/i.test(status)) {
      return { phase: 'queued', statusLabel: status || 'QUEUED' }
    }
    if (videoUrl) {
      return { phase: 'succeeded', statusLabel: status || 'SUCCEEDED', videoUrl }
    }
    return { phase: 'running', statusLabel: status || 'RUNNING' }
  }
  return { phase: 'failed', statusLabel: 'FAILED', failReason: lastFail }
}
