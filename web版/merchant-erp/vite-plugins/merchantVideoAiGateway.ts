/**
 * 短视频：可灵 JWT + 异步任务轮询（仅 Vite Node 中间层）。
 * Seedance（豆包）：火山方舟 /api/v3/contents/generations/tasks + 查询任务。
 */
import type { ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { normalizeVendorKeysFromDisk } from '../src/lib/aiVendorCatalogShared.js'
import type { RegistryFile } from '../src/lib/opsRegistryTypes.js'
import {
  describeArkVideoSetupIssue,
  listValidArkVideoModels,
  looksLikeArkPlaceholderEndpointId,
  pickMergedArkEndpointsField,
} from '../src/lib/arkVideoEndpointsConfig.js'
import { normalizeRegistryVideoAi } from '../src/lib/registryVideoAiNormalize.js'
import { merchantChatCompletion, type MerchantAiEnv } from './merchantAiUpstream.js'
import { readMerchantSupabaseAdminEnv } from './merchantSupabaseAdminEnv.js'
import { handleOpenshotCloudRoutes } from './openshotCloudGateway.js'

/** 将注册表中的 videoAi / vendorKeys 合入 env：非空 env 优先生效（与本地 registry.json 规则一致）。 */
function applyRegistrySliceToVideoAiEnv(
  out: MerchantAiEnv,
  reg: Partial<Pick<RegistryFile, 'videoAi' | 'vendorKeys'>>,
): void {
  const vx = normalizeRegistryVideoAi(reg.videoAi)
  const vk = normalizeVendorKeysFromDisk(reg.vendorKeys)

  const fill = (key: string, val: string | undefined) => {
    const v = val?.trim()
    if (!v) return
    const cur = String((out as Record<string, string | undefined>)[key] ?? '').trim()
    if (cur) return
    ;(out as Record<string, string>)[key] = v
  }

  fill('KLING_ACCESS_KEY', vx.klingAccessKey)
  fill('KLING_SECRET_KEY', vx.klingSecretKey)
  fill('KLING_API_BASE', vx.klingApiBase)
  fill('OPENSHOT_CLOUD_USER', vx.openshotUsername)
  fill('OPENSHOT_CLOUD_PASSWORD', vx.openshotPassword)
  fill('OPENSHOT_CLOUD_API_BASE', vx.openshotApiBase)

  const envEp = String(
    out.MERCHANT_AI_ARK_VIDEO_ENDPOINTS ?? out.MERCHANT_AI_SEEDANCE_VIDEO_MODELS ?? '',
  ).trim()
  const regEp = vx.arkVideoEndpoints?.trim() ?? ''
  const mergedEp = pickMergedArkEndpointsField(envEp, regEp)
  if (mergedEp) {
    out.MERCHANT_AI_ARK_VIDEO_ENDPOINTS = mergedEp
  } else {
    const preserve = envEp || regEp
    if (preserve) out.MERCHANT_AI_ARK_VIDEO_ENDPOINTS = preserve
  }

  const arkFromEnv = String(out.MERCHANT_AI_DOUBAO_KEY ?? out.ARK_API_KEY ?? '').trim()
  if (!arkFromEnv) {
    const fromVideo = vx.arkVideoApiKey?.trim()
    const fromVendor = typeof vk.doubao === 'string' ? vk.doubao.trim() : ''
    if (fromVideo) out.MERCHANT_AI_DOUBAO_KEY = fromVideo
    else if (fromVendor) out.MERCHANT_AI_DOUBAO_KEY = fromVendor
  }

  const qwenFromEnv = String(out.MERCHANT_AI_QWEN_KEY ?? out.DASHSCOPE_API_KEY ?? '').trim()
  if (!qwenFromEnv) {
    const fromVendor = typeof vk.qwen === 'string' ? vk.qwen.trim() : ''
    if (fromVendor) {
      out.MERCHANT_AI_QWEN_KEY = fromVendor
    }
  }
}

/**
 * 与环境变量合并：非空 env 优先生效；否则使用项目根 `.meoo-dev-sync/registry.json`
 * 运营管控台写入的 `videoAi` 与注册表内 `vendorKeys.doubao`。
 */
export function mergeVideoAiMerchantEnv(
  viteRoot: string | undefined,
  base: MerchantAiEnv,
): MerchantAiEnv {
  const out: MerchantAiEnv = { ...base }
  if (!viteRoot) return out
  const registryPath = path.join(path.resolve(viteRoot, '..', '..', '.meoo-dev-sync'), 'registry.json')
  try {
    if (!fs.existsSync(registryPath)) return out
    const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as Partial<RegistryFile>
    applyRegistrySliceToVideoAiEnv(out, reg)
  } catch {
    return out
  }

  return out
}

/**
 * 本地 registry.json 之上，再合并 Supabase `ops_registry_snapshot`（与商品 AI 同源）。
 * 线上 Vercel 无 `.meoo-dev-sync` 时依赖此路径读取运营台「短视频 / 视频模型 API」绑定。
 */
export async function mergeVideoAiMerchantEnvWithSnapshot(
  viteRoot: string | undefined,
  base: MerchantAiEnv,
): Promise<MerchantAiEnv> {
  const out = mergeVideoAiMerchantEnv(viteRoot, base)
  const { supabaseUrl, serviceRole } = readMerchantSupabaseAdminEnv()
  if (!supabaseUrl || !serviceRole) return out
  try {
    const { createRegistrySnapshotIoFetch } = await import('../src/lib/registrySnapshotIoFetch.js')
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    applyRegistrySliceToVideoAiEnv(out, { videoAi: data.videoAi, vendorKeys: data.vendorKeys })
  } catch {
    /* 未配 Supabase 或快照不可读时保留 .env / 本地 registry 结果 */
  }
  return out
}

export type ArkVideoModelOption = { label: string; endpointId: string }

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function arkApiV3Root(env: MerchantAiEnv): string {
  const raw = (env.MERCHANT_AI_DOUBAO_ARK_BASE ?? '').trim().replace(/\/$/, '')
  if (!raw) return 'https://ark.cn-beijing.volces.com/api/v3'
  if (raw.endsWith('/api/v3')) return raw
  return `${raw}/api/v3`
}

function doubaoBearerKey(env: MerchantAiEnv): string | null {
  const x = env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY
  const t = (x ?? '').trim()
  return t || null
}

function arkCreateTaskHttpStatus(upstreamStatus?: number): number {
  if (upstreamStatus === 404) return 400
  if (upstreamStatus != null && upstreamStatus >= 400 && upstreamStatus < 600) return upstreamStatus
  return 400
}

function arkCreateTaskUserMessage(msg: string, endpointId: string, upstreamStatus?: number): string {
  if (looksLikeArkPlaceholderEndpointId(endpointId)) {
    return `视频推理接入点「${endpointId}」为占位示例，不可用。请到运营管控台「AI模型 → 短视频 API」或 Vercel 环境变量 MERCHANT_AI_ARK_VIDEO_ENDPOINTS 填写火山方舟控制台真实的 ep- 接入点（形如 ep-2024xxxxxxxx）。`
  }
  if (upstreamStatus === 404 || /does not exist|not have access/i.test(msg)) {
    return `方舟视频接入点无效或无权访问（${endpointId}）：${msg}。请在火山方舟控制台确认该 ep 已开通 Seedance 视频推理且与当前 API Key 同账号。`
  }
  return msg
}

const LONGFORM_PLAN_SYSTEM = `你是短视频编导。回答必须且仅为一个 JSON 对象，格式：{"segments":[{"prompt":"第1段..."},...]}。不要 Markdown、代码围栏或其它说明文字。`

function parseLongformSegments(text: string, n: number): string[] | null {
  const t = text.trim()
  const s = t.indexOf('{')
  const e = t.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  let j: { segments?: unknown }
  try {
    j = JSON.parse(t.slice(s, e + 1)) as { segments?: unknown }
  } catch {
    return null
  }
  if (!Array.isArray(j.segments) || j.segments.length !== n) return null
  const prompts = j.segments.map((row) => {
    if (row && typeof row === 'object' && typeof (row as { prompt?: unknown }).prompt === 'string')
      return (row as { prompt: string }).prompt.trim()
    return ''
  })
  return prompts.every((p) => p.length > 0) ? prompts : null
}

function klingBase(env: MerchantAiEnv): string {
  const b = (env.KLING_API_BASE ?? '').trim().replace(/\/$/, '')
  return b || 'https://api-beijing.klingai.com'
}

function parseArkVideoModelList(env: MerchantAiEnv): ArkVideoModelOption[] {
  const raw = (
    env.MERCHANT_AI_ARK_VIDEO_ENDPOINTS ??
    env.MERCHANT_AI_SEEDANCE_VIDEO_MODELS ??
    ''
  ).trim()
  const fb = String((env as Record<string, string>).MERCHANT_AI_ARK_VIDEO_FALLBACK_ENDPOINT ?? '').trim()
  return listValidArkVideoModels(raw, fb)
}

function signKlingJwt(accessKey: string, secretKey: string): string {
  const headers = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(
    JSON.stringify({
      iss: accessKey,
      sub: accessKey,
      iat: now,
      exp: now + 1800,
      nbf: now - 5,
    }),
  ).toString('base64url')
  const signingInput = `${headers}.${payload}`
  const sig = crypto.createHmac('sha256', secretKey).update(signingInput).digest('base64url')
  return `${signingInput}.${sig}`
}

function extractKlingApiMessage(j: Record<string, unknown>): string {
  const data = j.data
  const dataObj =
    data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null
  const candidates = [
    j.message,
    j.msg,
    j.error,
    j.error_message,
    dataObj?.message,
    dataObj?.msg,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

function orderedKlingApiBases(env: MerchantAiEnv): string[] {
  const custom = (env.KLING_API_BASE ?? '').trim().replace(/\/$/, '')
  const pool = custom
    ? [custom, 'https://api-beijing.klingai.com', 'https://api.klingai.com']
    : ['https://api-beijing.klingai.com', 'https://api.klingai.com']
  const out: string[] = []
  for (const b of pool) {
    if (b && !out.includes(b)) out.push(b)
  }
  return out
}

function klingUpstreamUserMessage(
  status: number,
  j: Record<string, unknown>,
  apiBase: string,
): { message: string; httpStatus: number } {
  const code = j.code ?? j.error_code
  const msg = extractKlingApiMessage(j)
  const baseHint = apiBase.includes('beijing') ? '国内节点' : '国际节点'

  if (
    status === 429 ||
    status === 402 ||
    /balance|额度|余额|不足|quota|rate limit|resource exhausted/i.test(msg)
  ) {
    return {
      httpStatus: 402,
      message:
        `可灵账户余额或套餐额度不足（${baseHint}，HTTP ${status}${msg ? `：${msg}` : ''}）。` +
        '密钥已生效，请到 app.klingai.com 控制台为对应 Access Key 充值/开通视频额度后重试。',
    }
  }

  if (status === 401 || /auth|unauthorized|invalid token/i.test(msg)) {
    return {
      httpStatus: 401,
      message:
        `可灵鉴权失败（${baseHint}，HTTP ${status}${msg ? `：${msg}` : ''}${code != null ? `，code=${code}` : ''}）。` +
        '国内账号请设置 KLING_API_BASE=https://api-beijing.klingai.com；核对 AK/SK 勿填反、勿含空格。',
    }
  }

  return {
    httpStatus: status >= 400 && status < 600 ? status : 502,
    message: msg ? `${msg}（${baseHint} HTTP ${status}）` : `可灵接口错误 HTTP ${status}（${baseHint}）`,
  }
}

function pickKlingCreds(env: MerchantAiEnv): { ok: false; msg: string } | { ok: true; jwt: string } {
  const ak = (env.KLING_ACCESS_KEY ?? '').trim().replace(/\s+/g, '')
  const sk = (env.KLING_SECRET_KEY ?? '').trim().replace(/\s+/g, '')
  if (!ak || !sk) {
    return {
      ok: false,
      msg:
        '未配置可灵鉴权：请到运营管控台「AI模型 → 短视频 / 视频模型 API」维护 Access Key 与 Secret，或在服务端环境变量 KLING_ACCESS_KEY / KLING_SECRET_KEY 配置。',
    }
  }
  return { ok: true, jwt: signKlingJwt(ak, sk) }
}

async function readJsonResponse(res: globalThis.Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** 从方舟「查询视频任务」等大 JSON 中提取 mp4/https 播放地址（字段名多端差异较大） */
function extractHttpVideoUrl(depth: unknown, dep = 0): string | undefined {
  if (dep > 12) return undefined
  if (typeof depth === 'string') {
    if (/^https?:\/\/\S+/i.test(depth)) {
      if (/\.(mp4|webm)(\?\S*)?$/i.test(depth)) return depth
      if (/blob|vod|tos|tos-cn|cdn|video/i.test(depth)) return depth
    }
    return undefined
  }
  if (!depth || typeof depth !== 'object') return undefined
  if (Array.isArray(depth)) {
    for (const x of depth) {
      const u = extractHttpVideoUrl(x, dep + 1)
      if (u) return u
    }
    return undefined
  }
  const o = depth as Record<string, unknown>
  for (const k of ['video_url', 'preview_video_url', 'url', 'cover_url']) {
    const u = extractHttpVideoUrl(o[k], dep + 1)
    if (u) return u
  }
  for (const v of Object.values(o)) {
    const u = extractHttpVideoUrl(v, dep + 1)
    if (u) return u
  }
  return undefined
}

function normalizeHttpUrl(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const t = s.trim()
  if (!/^https?:\/\/\S+/i.test(t)) return null
  return t
}

function klingData(obj: Record<string, unknown>): Record<string, unknown> | null {
  const d = obj.data
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : null
}

function unwrapKlingTask(obj: Record<string, unknown>): {
  taskId?: string
  taskStatus?: string
  videoUrl?: string
  rawMessage?: string
} {
  const nested = klingData(obj) ?? {}
  const tidPick = nested.task_id ?? obj.task_id
  const taskId = typeof tidPick === 'string' ? tidPick : undefined
  const tstPick = nested.task_status ?? obj.task_status
  const taskStatus = typeof tstPick === 'string' ? tstPick : undefined
  const tr = nested.task_result
  if (tr && typeof tr === 'object' && !Array.isArray(tr)) {
    const videos = (tr as { videos?: unknown }).videos
    if (Array.isArray(videos) && videos[0] && typeof videos[0] === 'object') {
      const u = normalizeHttpUrl((videos[0] as { url?: unknown }).url)
      if (u) return { taskId, taskStatus, videoUrl: u }
    }
  }
  const message = typeof obj.message === 'string' ? obj.message : undefined
  return { taskId, taskStatus, rawMessage: message }
}

async function arkCreateVideoTask(
  env: MerchantAiEnv,
  body: Record<string, unknown>,
): Promise<{ ok: false; msg: string; status?: number } | { ok: true; taskId: string; raw?: unknown }> {
  const key = doubaoBearerKey(env)
  if (!key)
    return {
      ok: false,
      msg:
        '未检测到方舟 / 豆包 API Key：请到运营管控台「AI模型 → 短视频 API」配置专用 Key 或「豆包」Key，或设置服务端 MERCHANT_AI_DOUBAO_KEY。',
    }
  let modelEp = typeof body.model === 'string' ? body.model.trim() : ''
  if (!modelEp) {
    const list = parseArkVideoModelList(env)
    if (list[0]?.endpointId) modelEp = list[0].endpointId
  }
  if (!modelEp)
    return {
      ok: false,
      msg:
        '请选择视频推理接入点，或由运营在管控台「短视频 API」录入接入点清单；也可在服务环境变量 MERCHANT_AI_ARK_VIDEO_ENDPOINTS 提供别名|ep-xxxx。',
    }
  if (looksLikeArkPlaceholderEndpointId(modelEp)) {
    return {
      ok: false,
      msg: arkCreateTaskUserMessage('', modelEp),
      status: 400,
    }
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const imagesUnknown = body.images_base64

  /** 形如 ["data:image/jpeg;base64,..."] 或可灵式纯 base64 列表 */
  const extraFlags = typeof body.flags === 'string' ? body.flags.trim() : ''

  let contentArr: Record<string, unknown>[]
  if (Array.isArray(body.content)) {
    contentArr = body.content as Record<string, unknown>[]
  } else {
    const imageRows: string[] = []
    if (Array.isArray(imagesUnknown)) {
      for (const row of imagesUnknown) {
        if (typeof row !== 'string') continue
        const t = row.trim()
        if (t) imageRows.push(t)
      }
    }
    let textCombined = `${prompt}${extraFlags ? ` ${extraFlags}` : ''}`.trim()
    if (!textCombined && imageRows.length > 0) {
      textCombined = '按上传的画面生成连贯短视频。'
    }
    if (!textCombined) {
      return { ok: false, msg: '请填写提示词，或上传至少一张参考图。' }
    }
    contentArr = [{ type: 'text', text: textCombined }]
    for (const row of imageRows) {
      let url = row
      if (!url.startsWith('data:image') && /^[a-z0-9+/=\s]+$/i.test(url.replace(/\s/g, ''))) {
        url = `data:image/jpeg;base64,${url.replace(/\s/g, '')}`
      }
      contentArr.push({ type: 'image_url', image_url: { url } })
    }
  }

  const root = arkApiV3Root(env)
  const res = await fetch(`${root}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: modelEp, content: contentArr }),
  })
  const j = await readJsonResponse(res)
  const idRaw = typeof j.id === 'string' ? j.id : null
  if (!res.ok) {
    const rawMsg =
      (typeof j.error === 'object' &&
        j.error &&
        typeof (j.error as { message?: unknown }).message === 'string' &&
        (j.error as { message: string }).message) ||
      (typeof j.message === 'string' && j.message) ||
      `方舟创建视频任务失败（HTTP ${res.status}）。`
    return {
      ok: false,
      msg: arkCreateTaskUserMessage(rawMsg, modelEp, res.status),
      status: arkCreateTaskHttpStatus(res.status),
    }
  }
  if (!idRaw) return { ok: false, msg: '方舟未返回任务 id。', status: res.status }
  return { ok: true, taskId: idRaw, raw: j }
}

async function arkGetVideoTask(
  env: MerchantAiEnv,
  taskId: string,
): Promise<{ ok: false; msg: string; status?: number } | { ok: true; state: ArkPollState }> {
  const key = doubaoBearerKey(env)
  if (!key) return { ok: false, msg: '未配置方舟 API Key。' }
  const root = arkApiV3Root(env)
  const res = await fetch(`${root}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${key}` },
  })
  const j = await readJsonResponse(res)
  if (!res.ok) {
    const msg =
      (typeof j.message === 'string' && j.message) || `方舟查询任务失败（HTTP ${res.status}）。`
    return { ok: false, msg, status: res.status }
  }
  const rawStatus = typeof j.status === 'string' ? j.status : typeof j.phase === 'string' ? j.phase : ''
  const st = rawStatus.trim().toLowerCase()
  const videoUrl = extractHttpVideoUrl(j)

  /** 语义归一（不同版本字段不一致） */
  let phase: ArkPollPhase = 'running'
  if (!st || st === 'submitted' || st === 'queued' || st === 'pending') phase = 'queued'
  else if (
    st === 'running' ||
    st === 'processing' ||
    st === 'in_progress' ||
    st === 'generating' ||
    st === 'working'
  )
    phase = 'running'
  else if (
    st === 'succeeded' ||
    st === 'success' ||
    st === 'completed' ||
    st === 'finished' ||
    st === 'complete'
  )
    phase = 'succeeded'
  else if (st === 'failed' || st === 'error') phase = 'failed'
  else if (videoUrl && st !== '') phase = 'succeeded'

  const failReason =
    (typeof j.error === 'object' &&
      j.error &&
      typeof (j.error as { message?: unknown }).message === 'string' &&
      (j.error as { message: string }).message) ||
    (typeof j.message === 'string' ? j.message : undefined)

  return {
    ok: true,
    state: {
      phase,
      statusLabel: rawStatus || phase,
      videoUrl,
      raw: j as unknown as Record<string, unknown>,
      failReason: phase === 'failed' ? failReason || '方舟任务失败，请稍后重试。' : undefined,
    },
  }
}

export type ArkPollPhase = 'queued' | 'running' | 'succeeded' | 'failed'

export type ArkPollState = {
  phase: ArkPollPhase
  statusLabel: string
  videoUrl?: string
  failReason?: string
  raw?: Record<string, unknown>
}

export async function handleMerchantAiVideoRoutes(input: {
  method: string
  pathname: string
  searchParams: URLSearchParams
  res: ServerResponse
  bodyRaw: string
  viteRoot?: string
  env: MerchantAiEnv
}): Promise<boolean> {
  const { method, pathname, searchParams, res, bodyRaw, env: rawEnv } = input
  const env = await mergeVideoAiMerchantEnvWithSnapshot(input.viteRoot, rawEnv)

  if (await handleOpenshotCloudRoutes({ ...input, env })) return true

  if (method === 'GET' && pathname === '/api/merchant/ai/video/config') {
    const kCfg = pickKlingCreds(env)
    const endpointsRaw = (
      env.MERCHANT_AI_ARK_VIDEO_ENDPOINTS ??
      env.MERCHANT_AI_SEEDANCE_VIDEO_MODELS ??
      ''
    ).trim()
    const arkOpts = parseArkVideoModelList(env)
    const arkKeyOk = !!doubaoBearerKey(env)
    const qwenOk = !!(env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
    const arkVideoSetupIssue = describeArkVideoSetupIssue(arkKeyOk, endpointsRaw)
    const openshotUser = (env.OPENSHOT_CLOUD_USER ?? env.OPENCUT_CLOUD_USER ?? '').trim()
    const openshotPass = (env.OPENSHOT_CLOUD_PASSWORD ?? env.OPENCUT_CLOUD_PASSWORD ?? '').trim()
    const credentialNote =
      '商户端仅可选择模型能力与参数；可灵密钥、方舟 Key / 视频推理接入点、OpenShot Cloud 账号由运营人员在「管控台 · AI模型」中维护，经 Supabase 注册表快照下发（生产须配置 VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY）；本地 dev 亦可落盘于项目根 .meoo-dev-sync。'
    json(res, 200, {
      klingConfigured: kCfg.ok,
      arkVideoModels: arkOpts,
      arkKeyConfigured: arkKeyOk,
      arkVideoSetupIssue,
      openshotConfigured: !!(openshotUser && openshotPass),
      longformPlanner: {
        doubao: arkKeyOk,
        qwen: qwenOk,
      },
      credentialNote,
    })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/longform/plan') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const plannerRaw = String(parsed.plannerModel ?? 'doubao').toLowerCase()
    const plannerModel = plannerRaw === 'qwen' ? 'qwen' : 'doubao'
    const segmentCount = Math.min(6, Math.max(2, Number(parsed.segmentCount) || 6))
    const overallPrompt = String(parsed.overallPrompt ?? '').trim()
    if (!overallPrompt) {
      json(res, 400, { ok: false, message: '缺少 overallPrompt。' })
      return true
    }
    const mode = String(parsed.mode ?? 'optimize')
    const neg = String(parsed.negativeHint ?? '').trim()
    const modeHint =
      mode === 'generate_text'
        ? '用户将从零生成短片，仅有文字创意，没有首帧图片。第 1 段可写开场画面；后续段在动作、景别、光线上连贯衔接。'
        : mode === 'generate_frames'
          ? '用户上传了分镜参考图，首段以首帧画面为锚；后续段承接前一段结尾的镜头语言。'
          : '用户基于参考图/截帧做短视频优化，各段提示词写清镜头、主体、光线与运镜，段与段过渡自然。'
    const user = `整体创意与要求：\n${overallPrompt}\n${neg ? `\n需避免出现的内容（各段尽量遵守）：${neg}\n` : ''}\n任务说明：${modeHint}\n\n请将上述内容拆分为恰好 ${segmentCount} 段、每段约 10 秒的镜头描述（用于 AI 视频模型）。每段只写画面内容与运镜，不要写「第几秒」或时长数字。\n只输出 JSON：{"segments":[{"prompt":"..."},...]}，数组长度必须恰好为 ${segmentCount}。`
    let prompts: string[] | null = null
    for (let attempt = 0; attempt < 2 && !prompts; attempt++) {
      const userMsg =
        attempt === 0
          ? user
          : `${user}\n\n上次输出无法解析。请只输出合法 JSON，segments 数组长度必须=${segmentCount}，键名用 prompt，不要其它字符。`
      const chat = await merchantChatCompletion(env, parsed, plannerModel, LONGFORM_PLAN_SYSTEM, userMsg)
      if (chat.ok === false) {
        json(res, 502, { ok: false, message: chat.message })
        return true
      }
      prompts = parseLongformSegments(chat.text, segmentCount)
    }
    if (!prompts) {
      json(res, 502, {
        ok: false,
        message: '模型未返回可用的分段 JSON，请重试或更换策划模型。',
      })
      return true
    }
    json(res, 200, { ok: true, prompts })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/download-url') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const urlStr = typeof parsed.url === 'string' ? parsed.url.trim() : ''
    if (!urlStr || !/^https?:\/\//i.test(urlStr)) {
      json(res, 400, { ok: false, message: '缺少有效的 http(s) URL。' })
      return true
    }
    const maxBytes = 100 * 1024 * 1024
    try {
      const u = new URL(urlStr)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        json(res, 400, { ok: false, message: '仅支持 http(s) URL。' })
        return true
      }
      const upstream = await fetch(urlStr, {
        redirect: 'follow',
        headers: { 'User-Agent': 'meoo-merchant-erp-video-proxy/1.0' },
      })
      if (!upstream.ok) {
        json(res, 502, { ok: false, message: `下载失败 HTTP ${upstream.status}` })
        return true
      }
      const len = upstream.headers.get('content-length')
      if (len && Number(len) > maxBytes) {
        json(res, 400, { ok: false, message: '视频文件过大。' })
        return true
      }
      const buf = Buffer.from(await upstream.arrayBuffer())
      if (buf.length > maxBytes) {
        json(res, 400, { ok: false, message: '视频文件过大。' })
        return true
      }
      const ct = upstream.headers.get('content-type')?.split(';')[0]?.trim() || 'video/mp4'
      res.statusCode = 200
      res.setHeader('Content-Type', ct)
      res.setHeader('Content-Length', String(buf.length))
      res.end(buf)
      return true
    } catch (e) {
      json(res, 502, {
        ok: false,
        message: e instanceof Error ? e.message : '下载失败',
      })
      return true
    }
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/kling/start') {
    const cred = pickKlingCreds(env)
    if (cred.ok === false) {
      json(res, 400, { ok: false, message: cred.msg })
      return true
    }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const kind = parsed.kind === 'image2video' ? 'image2video' : 'text2video'
    const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : ''
    const modelName =
      (typeof parsed.model_name === 'string' && parsed.model_name.trim()) || 'kling-v1-6'
    const durRaw = parsed.duration
    const duration =
      typeof durRaw === 'number' && Number.isFinite(durRaw)
        ? durRaw
        : typeof durRaw === 'string'
          ? Number.parseInt(durRaw, 10) || 5
          : 5
    const aspectRatio = (typeof parsed.aspect_ratio === 'string' && parsed.aspect_ratio.trim()) || '16:9'
    const mode = (typeof parsed.mode === 'string' && parsed.mode.trim()) || 'std'
    const negative =
      typeof parsed.negative_prompt === 'string'
        ? parsed.negative_prompt
        : 'blur, distortion, low quality'

    let reqBody: Record<string, unknown>
    if (kind === 'text2video') {
      if (!prompt) {
        json(res, 400, { ok: false, message: '文生视频需填写正向提示词。' })
        return true
      }
      reqBody = {
        model_name: modelName,
        prompt,
        negative_prompt: negative,
        duration,
        aspect_ratio: aspectRatio,
        mode,
        cfg_scale:
          typeof parsed.cfg_scale === 'number' ? parsed.cfg_scale : 0.5,
      }
    } else {
      let imageField: string | undefined
      const urlField = normalizeHttpUrl(parsed.image_url)
      if (urlField) imageField = urlField
      else if (typeof parsed.image_base64 === 'string' && parsed.image_base64.trim()) {
        imageField = parsed.image_base64.trim()
      }
      if (!imageField) {
        json(res, 400, {
          ok: false,
          message: '图生视频需提供 image_base64（或公有 image_url）。',
        })
        return true
      }
      reqBody = {
        model_name: modelName,
        image: imageField,
        prompt,
        negative_prompt: negative,
        duration,
        mode,
        cfg_scale:
          typeof parsed.cfg_scale === 'number' ? parsed.cfg_scale : 0.5,
      }
    }

    const klingBases = orderedKlingApiBases(env)

    let upstream: globalThis.Response | null = null
    let j: Record<string, unknown> = {}
    let usedBase = klingBases[0] ?? 'https://api-beijing.klingai.com'
    for (const base of klingBases) {
      usedBase = base
      const tryUrl = `${base.replace(/\/$/, '')}/v1/videos/${kind}`
      const r = await fetch(tryUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cred.jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reqBody),
      })
      const body = await readJsonResponse(r)
      if (r.ok) {
        upstream = r
        j = body
        break
      }
      j = body
      upstream = r
      /** 401 换节点；429/402 余额不足不再换节点（避免误报 502） */
      if (r.status === 401) continue
      break
    }
    if (!upstream || !upstream.ok) {
      const { message, httpStatus } = klingUpstreamUserMessage(upstream?.status ?? 502, j, usedBase)
      json(res, httpStatus, {
        ok: false,
        message,
        upstream: j,
        kling_api_base: usedBase,
      })
      return true
    }
    const { taskId } = unwrapKlingTask(j)
    if (!taskId) {
      json(res, 502, { ok: false, message: '可灵未返回 task_id', upstream: j })
      return true
    }
    json(res, 200, { ok: true, taskId, pollKind: kind })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/ai/video/kling/status') {
    const cred = pickKlingCreds(env)
    if (cred.ok === false) {
      json(res, 400, { ok: false, message: cred.msg })
      return true
    }
    const taskId = (searchParams.get('taskId') ?? '').trim()
    const pollKindRaw = searchParams.get('kind') ?? 'text2video'
    const kind = pollKindRaw === 'image2video' ? 'image2video' : 'text2video'
    if (!taskId) {
      json(res, 400, { ok: false, message: '缺少 query taskId。' })
      return true
    }
    const statusUrl = `${klingBase(env)}/v1/videos/${kind}/${encodeURIComponent(taskId)}`
    const upstream = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${cred.jwt}` },
    })
    const j = await readJsonResponse(upstream)
    if (!upstream.ok) {
      json(res, 502, {
        ok: false,
        message:
          typeof j.message === 'string' ? j.message : `HTTP ${upstream.status}`,
        upstream: j,
      })
      return true
    }
    const unwrap = unwrapKlingTask(j)
    const ts = unwrap.taskStatus?.toLowerCase() ?? ''
    let phase: 'queued' | 'running' | 'succeeded' | 'failed' = 'running'
    if (ts === 'submitted' || ts === 'queue' || ts === 'queued') phase = 'queued'
    else if (ts.includes('process') || ts.includes('waiting') || ts === 'running') phase = 'running'
    else if (ts.includes('succ') || ts === 'completed' || ts === 'finish' || unwrap.videoUrl)
      phase = 'succeeded'
    else if (ts.includes('fail') || ts.includes('error')) phase = 'failed'

    json(res, 200, {
      ok: true,
      phase,
      videoUrl: unwrap.videoUrl ?? null,
      taskStatus: unwrap.taskStatus ?? null,
      upstream: klingData(j),
    })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/seedance/start') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const r = await arkCreateVideoTask(env, parsed)
    if (r.ok === true) {
      json(res, 200, { ok: true, taskId: r.taskId })
      return true
    }
    json(res, arkCreateTaskHttpStatus(r.status), { ok: false, message: r.msg })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/ai/video/seedance/status') {
    const taskIdSd = (searchParams.get('taskId') ?? '').trim()
    if (!taskIdSd) {
      json(res, 400, { ok: false, message: '缺少 query taskId。' })
      return true
    }
    const r = await arkGetVideoTask(env, taskIdSd)
    if (r.ok === true) {
      json(res, 200, { ok: true, ...r.state })
      return true
    }
    json(res, r.status && r.status >= 400 ? r.status : 502, {
      ok: false,
      message: r.msg,
    })
    return true
  }

  return false
}
