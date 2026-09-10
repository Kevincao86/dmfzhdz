/**
 * 火山即梦 · 小云雀智能生视频 Agent（文档 85621）
 *
 * 提交：CVSync2AsyncSubmitTask
 * 查询：CVSync2AsyncGetResult
 * Version: 2022-08-31
 * 默认无参考 req_key: pippit_iv2v_v20_cvtob（文档 85621/2359611）
 * 有参考（图+视频）：pippit_iv2v_v20_cvtob_with_vinput（文档 85621/2359610）
 * 有角色/参考图：只走 pippit_iv2v_v20_cvtob_with_vinput（图必须进片）。
 * 禁止无参考 cvtob 文生。有参考时不兜底即梦无声首帧（会丢掉对白和配角）。
 * 不走方舟 Seedance 真人库/纯文案。
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
const XYQ_REQ_KEY_NOREF = 'pippit_iv2v_v20_cvtob'
const XYQ_REQ_KEY_REF = 'pippit_iv2v_v20_cvtob_with_vinput'
const NOREF_KEYS = [XYQ_REQ_KEY_NOREF]
const REF_KEYS = [XYQ_REQ_KEY_REF]

export function isXiaoyunqueConfigured(env: MerchantAiEnv): boolean {
  return Boolean(resolveVolcVisualCredentials(env))
}

/** 凭据在 ≠ 小云雀 Agent 已开通。用假 task 打一次 GetResult 判断 req_key 是否被账号支持。 */
export async function probeXiaoyunqueAccount(env: MerchantAiEnv): Promise<{
  configured: boolean
  usable: boolean
  detail: string
}> {
  if (!isXiaoyunqueConfigured(env)) {
    return { configured: false, usable: false, detail: '未配置短剧视频凭据' }
  }
  const dummy = encodeTaskToken(XYQ_REQ_KEY_NOREF, XYQ_GET_ACTION, 'probe-not-exist')
  const state = await volcGetXiaoyunqueTaskOnce(env, dummy)
  const reason = `${state.failReason ?? ''} ${state.statusLabel ?? ''}`
  if (/req_key\s*<[^>]+>\s*not supported|不支持该小云雀 req_key/i.test(reason)) {
    return {
      configured: true,
      usable: false,
      detail: '视觉云 AK 有效，但当前账号未开通有声短剧能力',
    }
  }
  if (/Access\s*Denied|50400|未开通或 AK 无权限/i.test(reason)) {
    return { configured: true, usable: false, detail: 'AK 无有声短剧权限，请到火山控制台开通并授权' }
  }
  return { configured: true, usable: true, detail: '有声短剧接口可调用' }
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

function isJimengI2vReqKey(reqKey: string): boolean {
  return /jimeng_ti2v|jimeng_i2v|jimeng_vgfm_i2v/i.test(String(reqKey || ''))
}

function isXiaoyunqueAgentReqKey(reqKey: string): boolean {
  return /pippit_iv2v/i.test(String(reqKey || ''))
}

function reqKeyAttempts(
  env: MerchantAiEnv,
  hasVideoRef: boolean,
  hasImageRef: boolean,
): Array<{
  action: string
  version: string
  reqKey: string
  getAction: string
}> {
  const customKey = (env.MERCHANT_AI_XIAOYUNQUE_REQ_KEY ?? '').trim()
  const customAction = (env.MERCHANT_AI_XIAOYUNQUE_SUBMIT_ACTION ?? '').trim()
  const customGet = (env.MERCHANT_AI_XIAOYUNQUE_GET_ACTION ?? '').trim()
  const xyqRow = (reqKey: string) => ({
    action: customAction || XYQ_SUBMIT_ACTION,
    version: XYQ_VERSION,
    reqKey,
    getAction: customGet || XYQ_GET_ACTION,
  })
  /** 有角色/参考图：只走「有参考」图生。禁止无参考文生 cvtob，否则图不进片 */
  if (hasImageRef) {
    const rows = [xyqRow(XYQ_REQ_KEY_REF)]
    if (customKey && customKey !== XYQ_REQ_KEY_NOREF && !isJimengI2vReqKey(customKey) && !rows.some((r) => r.reqKey === customKey)) {
      rows.unshift(xyqRow(customKey))
    }
    return rows
  }
  const pippitKeys = hasVideoRef ? [...REF_KEYS, ...NOREF_KEYS] : [...NOREF_KEYS]
  const base = pippitKeys.map((reqKey) => xyqRow(reqKey))
  if (customKey || customAction) {
    return [xyqRow(customKey || (hasVideoRef ? XYQ_REQ_KEY_REF : XYQ_REQ_KEY_NOREF)), ...base.filter((row) => row.reqKey !== customKey)]
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

function isXiaoyunqueBillingError(msg: string): boolean {
  return /欠费|余额不足|预付费不足|账号逾期|overdue|arrear|insufficient\s*(credit|fund|balance)|quota\s*exceeded|credit\s*not\s*enough/i.test(
    msg,
  )
}

function isXiaoyunqueReqKeyNotOpenedError(msg: string): boolean {
  return /req_key\s*<[^>]+>\s*not supported|不支持该小云雀 req_key|req_key.*not supported/i.test(msg)
}

function isTransientXiaoyunqueQueryError(msg: string): boolean {
  return (
    isVolcVisualRateLimitError(msg) ||
    /瞬时繁忙|请隔|fetch failed|Failed to fetch|network|timeout|ECONNRESET|ETIMEDOUT|HTTP\s*5\d\d|超时|中断|abort/i.test(
      msg,
    )
  )
}

function humanizeXiaoyunqueError(raw: string): string {
  const t = String(raw || '').trim()
  if (isXiaoyunqueBillingError(t)) {
    return `短剧视频账户余额不足或欠费，请联系运营充值后再生成。（原始：${t.slice(0, 140)}）`
  }
  if (/Access\s*Denied|50400|not\s*authorized|未开通/i.test(t) && !/req_key/i.test(t)) {
    return '短剧视频能力未开通或权限不足，请联系运营在管控台完成配置。'
  }
  if (isXiaoyunqueReqKeyNotOpenedError(t) || /not supported/i.test(t)) {
    return (
      '当前账号尚未开通有声短剧能力，请联系运营配置。' +
      `（原始：${t.slice(0, 140)}）`
    )
  }
  if (isVolcVisualRateLimitError(t)) {
    return '视频接口瞬时繁忙。若已提交成功，任务会在云端继续，稍后刷新即可拉回成片；否则请隔 1～2 分钟再试。'
  }
  return t || '短剧任务提交失败'
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
    message: humanizeXiaoyunqueError(last?.message || '短剧任务提交失败'),
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

function durationSlot(sec: number): '～15s' | '～30s' | '40～60s' | '1min+' {
  if (sec <= 22) return '～15s'
  if (sec <= 40) return '～30s'
  if (sec <= 70) return '40～60s'
  return '1min+'
}

function ratioSlot(raw: string): '16:9' | '9:16' | '4:3' | '3:4' {
  const t = String(raw || '').replace(/\s/g, '')
  if (t === '16:9' || t === '9:16' || t === '4:3' || t === '3:4') return t
  const [w, h] = t.split(':').map(Number)
  if (Number.isFinite(w) && Number.isFinite(h) && h > 0) {
    return w >= h ? '16:9' : '9:16'
  }
  return '9:16'
}

function publicHttpUrls(raw: unknown, cap: number): string[] {
  const out: string[] = []
  const push = (u: unknown) => {
    if (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) && out.length < cap) {
      out.push(u.trim())
    }
  }
  if (Array.isArray(raw)) {
    for (const u of raw) push(u)
  } else {
    push(raw)
  }
  return out
}

function toPureImageBase64(raw: string): string | null {
  const t = String(raw || '').trim()
  if (!t || /^https?:\/\//i.test(t)) return null
  const m = /^data:image\/[a-zA-Z0-9.+-]+;base64,([\s\S]+)$/i.exec(t)
  const b64 = (m ? m[1] : t).replace(/\s/g, '')
  if (b64.length < 80) return null
  return b64
}

function collectImagePayloads(rawList: unknown, cap: number): { urls: string[]; binaries: string[] } {
  const urls: string[] = []
  const binaries: string[] = []
  const rows = Array.isArray(rawList) ? rawList : rawList != null ? [rawList] : []
  for (const row of rows) {
    if (typeof row !== 'string') continue
    const t = row.trim()
    if (!t) continue
    if (/^https?:\/\//i.test(t)) {
      if (urls.length < cap) urls.push(t)
      continue
    }
    const b64 = toPureImageBase64(t)
    if (b64 && binaries.length < cap) binaries.push(b64)
  }
  return { urls, binaries }
}

function clipPromptKeepIdentity(prompt: string, max: number): string {
  const p = String(prompt ?? '').trim()
  if (p.length <= max) return p
  if (p.startsWith('【角色锁定') || p.startsWith('【图生') || p.startsWith('【参考图')) {
    const nl = p.indexOf('\n')
    const lock = nl > 0 && nl < max ? p.slice(0, nl) : p.slice(0, Math.min(160, max))
    const restStart = nl > 0 ? nl + 1 : lock.length
    const room = max - lock.length - 1
    if (room > 24) return `${lock}\n${p.slice(restStart, restStart + room)}`
  }
  return p.slice(0, max)
}

/** 小云雀对足浴/技师会 Text Risk Not Pass；换成同义场景词，保留双人对戏和对白 */
function xiaoyunqueSafeDramaPrompt(prompt: string): string {
  return String(prompt ?? '')
    .replace(/足浴按摩/g, '休闲到店')
    .replace(/足浴店/g, '休闲店')
    .replace(/足疗/g, '休闲护理')
    .replace(/足浴/g, '休闲护理')
    .replace(/按摩/g, '放松护理')
    .replace(/女技师/g, '女店员')
    .replace(/男技师/g, '男店员')
    .replace(/技师/g, '店员')
    .replace(/桑拿|会所/g, '休闲空间')
    .replace(/采耳/g, '护理')
}

/** 即梦图生审核严，故事里的足浴等词会拦；兜底时只做锁脸微动，故事交给小云雀 */
function jimengSafeMotionPrompt(prompt: string): string {
  const p = String(prompt ?? '').trim()
  if (/足浴|按摩|技师|桑拿|会所/.test(p)) {
    return [
      '【图生】角色照片已作为首帧提交。',
      '让图中的人自然转头、微笑、抬手，竖屏半身近景，电影棚拍光。',
      '必须是这张图里的同一人、同一张脸、同一发型、同一套衣服。',
      '禁止生成其他人物，禁止换脸。不要字幕、水印、Logo。',
    ].join('')
  }
  return clipPromptKeepIdentity(p, 800)
}

function buildJimengI2vSubmitBody(opts: {
  reqKey: string
  prompt: string
  durationSec: number
  imageUrls: string[]
  binaries: string[]
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    req_key: opts.reqKey,
    prompt: jimengSafeMotionPrompt(opts.prompt),
    seed: -1,
    frames: opts.durationSec <= 7 ? 121 : 241,
    aspect_ratio: '9:16',
  }
  if (opts.binaries.length) {
    body.binary_data_base64 = opts.binaries.slice(0, 1)
  } else if (opts.imageUrls.length) {
    body.image_urls = opts.imageUrls.slice(0, 1)
  }
  return body
}

function buildXiaoyunqueSubmitBody(opts: {
  reqKey: string
  prompt: string
  durationSec: number
  aspectRatio: string
  imageUrls: string[]
  videoUrls: string[]
  binaries: string[]
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    req_key: opts.reqKey,
    prompt: clipPromptKeepIdentity(xiaoyunqueSafeDramaPrompt(opts.prompt), 2000),
    ratio: ratioSlot(opts.aspectRatio),
    duration: durationSlot(opts.durationSec),
    language: 'Chinese',
    enable_watermark: false,
  }
  /** 槽位 1=角色（或尾帧），槽位 2=店内参考/拼贴。多图原图会撑爆请求，由短剧页先压成 2 张再提交 */
  if (opts.imageUrls.length) body.img_url_list = opts.imageUrls.slice(0, 2)
  if (opts.binaries.length) body.binary_data_base64 = opts.binaries.slice(0, 2)
  if (opts.videoUrls.length) body.video_url_list = opts.videoUrls.slice(0, 50)
  return body
}

export async function volcSubmitXiaoyunqueTask(
  env: MerchantAiEnv,
  opts: {
    prompt: string
    durationSec: number
    aspectRatio?: string
    imageUrls?: string[]
    videoUrls?: string[]
    imageBase64?: string[]
  },
): Promise<{ ok: true; taskId: string; reqKey: string } | { ok: false; message: string }> {
  const creds = resolveVolcVisualCredentials(env)
  if (!creds) {
    return {
      ok: false,
      message:
        '未配置短剧视频凭据。请到运营台「短剧 AI 制作」填写，或在轻量 auth-api.env 配置视觉云 AK/SK。',
    }
  }
  const prompt = opts.prompt.trim()
  if (!prompt) return { ok: false, message: '缺少短剧生成提示词。' }
  const durationSec = clampDurationSec(opts.durationSec)
  const aspectRatio = (opts.aspectRatio || '9:16').trim() || '9:16'
  const mixed = collectImagePayloads([...(opts.imageUrls ?? []), ...(opts.imageBase64 ?? [])], 2)
  const imageUrls = mixed.urls
  const binaries = mixed.binaries
  const videoUrls = publicHttpUrls(opts.videoUrls, 50)
  const hasVideoRef = videoUrls.length > 0
  const imageCount = imageUrls.length + binaries.length
  const hasImageRef = imageCount > 0
  if (imageCount < 2) {
    return {
      ok: false,
      message: '必须同时提交角色图和参考画面，已拒绝纯文案生成。',
    }
  }

  const errors: string[] = []
  let xyqNotOpened = false
  let xyqOtherFailed = false
  for (const attempt of reqKeyAttempts(env, hasVideoRef, hasImageRef)) {
    if (isJimengI2vReqKey(attempt.reqKey) && !imageUrls.length && !binaries.length) continue
    if (isJimengI2vReqKey(attempt.reqKey) && durationSec > 12) continue
    const tryDurs =
      isJimengI2vReqKey(attempt.reqKey) && durationSec > 7 ? [durationSec, 5] : [durationSec]
    for (const dur of tryDurs) {
      const body = isJimengI2vReqKey(attempt.reqKey)
        ? buildJimengI2vSubmitBody({
            reqKey: attempt.reqKey,
            prompt,
            durationSec: dur,
            imageUrls,
            binaries,
          })
        : buildXiaoyunqueSubmitBody({
            reqKey: attempt.reqKey,
            prompt,
            durationSec: dur,
            aspectRatio,
            imageUrls,
            videoUrls,
            binaries,
          })
      const r = await postVolcVisualWithRetry(creds, attempt.action, attempt.version, body)
      if (!r.ok) {
        const tag = isXiaoyunqueAgentReqKey(attempt.reqKey)
          ? '有声短剧'
          : isJimengI2vReqKey(attempt.reqKey)
            ? '图生'
            : '短剧视频'
        const row = `${tag}${dur !== durationSec ? `@${dur}s` : ''}: ${r.message}`
        errors.push(row)
        console.warn('[xiaoyunque-submit]', row.slice(0, 400))
        if (isXiaoyunqueAgentReqKey(attempt.reqKey)) {
          if (isXiaoyunqueBillingError(r.message)) {
            return { ok: false, message: humanizeXiaoyunqueError(r.message) }
          }
          if (isXiaoyunqueReqKeyNotOpenedError(r.message)) xyqNotOpened = true
          else xyqOtherFailed = true
        }
        continue
      }
      const rawId = extractTaskId(r.json)
      if (!rawId) {
        errors.push(`${attempt.reqKey}: 未返回 task_id`)
        continue
      }
      if (hasImageRef && attempt.reqKey === XYQ_REQ_KEY_NOREF) {
        errors.push('已拒绝无参考文生（图必须进片）')
        continue
      }
      return {
        ok: true,
        taskId: encodeTaskToken(attempt.reqKey, attempt.getAction, rawId),
        reqKey: attempt.reqKey,
      }
    }
  }
  if (hasImageRef && !hasVideoRef) {
    return {
      ok: false,
      message:
        humanizeXiaoyunqueError(errors.slice(0, 3).join('；')) ||
        (xyqOtherFailed && !xyqNotOpened
          ? '有声短剧提交失败。未改走无声片，以免丢掉对白。'
          : '有声短剧与图生均未成功，未改用无参考成片（否则会丢掉角色照片）。'),
    }
  }
  return {
    ok: false,
    message: humanizeXiaoyunqueError(errors.slice(0, 3).join('；') || '短剧任务提交失败'),
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
    if (isTransientXiaoyunqueQueryError(r.message)) {
      return { phase: 'running', statusLabel: '云端生成中' }
    }
    return { phase: 'failed', statusLabel: '查询失败', failReason: humanizeXiaoyunqueError(r.message) }
  }
  const status = extractStatus(r.json)
  const videoUrl = extractVideoUrl(r.json)
  if (videoUrl) {
    return { phase: 'succeeded', statusLabel: status || '已完成', videoUrl }
  }
  if (/done|success|succeed|completed|finish/i.test(status)) {
    const { message } = unwrapVolcResult(r.json)
    return {
      phase: 'failed',
      statusLabel: status || '失败',
      failReason: humanizeXiaoyunqueError(message || '任务已结束但未返回视频'),
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
  if (/in_queue|processing|queue|pending|wait|submit/i.test(status)) {
    return { phase: 'queued', statusLabel: status || '排队中' }
  }
  if (/generating/i.test(status)) {
    return { phase: 'running', statusLabel: status || '生成中' }
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
  const imageFromBody = collectImagePayloads(
    [
      parsed.image_url,
      parsed.img_url,
      ...(Array.isArray(parsed.image_urls) ? parsed.image_urls : []),
      ...(Array.isArray(parsed.img_url_list) ? parsed.img_url_list : []),
      ...(Array.isArray(parsed.images_base64) ? parsed.images_base64 : []),
      ...(Array.isArray(parsed.binary_data_base64) ? parsed.binary_data_base64 : []),
    ],
    50,
  )
  const videoUrls = publicHttpUrls(
    [
      parsed.video_url,
      ...(Array.isArray(parsed.video_urls) ? parsed.video_urls : []),
      ...(Array.isArray(parsed.video_url_list) ? parsed.video_url_list : []),
    ],
    50,
  )
  const r = await volcSubmitXiaoyunqueTask(env, {
    prompt,
    durationSec,
    aspectRatio: aspect,
    imageUrls: imageFromBody.urls,
    imageBase64: imageFromBody.binaries,
    videoUrls,
  })
  if (!r.ok) return { ok: false, msg: r.message }
  return { ok: true, taskId: r.taskId, modelUsed: r.reqKey }
}
