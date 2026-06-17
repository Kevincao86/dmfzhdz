/**
 * 短视频：可灵 JWT + 异步任务轮询（仅 Vite Node 中间层）。
 * Seedance（豆包）：火山方舟 /api/v3/contents/generations/tasks + 查询任务。
 */
import type { ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { applyRegistryVendorKeysToMerchantEnv } from './merchantRegistryVendorEnv.js'
import type { RegistryFile } from '../src/lib/opsRegistryTypes.js'
import {
  DOUBAO_VIDEO_CATALOG,
  isArkQuotaHopableError,
  isQwenVideoModelHopableError,
  isQwenVideoTaskId,
  mergeCatalogModelIds,
  stripQwenVideoTaskPrefix,
  wrapQwenVideoTaskId,
} from '../src/lib/arkModelCatalog.js'
import { qwenVideoModelCandidates, qwenPortraitModelCandidates } from '../src/lib/qwenVisionCatalog.js'
import {
  buildQwenVisionVideoRequest,
  buildQwenWanS2vRequest,
  isQwenWan27I2vModel,
  isQwenWan27VideoModel,
} from '../src/lib/qwenVisionApi.js'
import { normalizePortraitBufferForS2v } from './dhS2vPortraitNormalize.js'
import {
  DEFAULT_SEEDANCE_VIDEO_MODEL_ID,
  describeArkVideoSetupIssue,
  isDoubaoSeedanceModelId,
  listArkVideoModelsForPicker,
  looksLikeArkPlaceholderEndpointId,
  looksLikeDoubaoChatModelId,
  normalizeArkVideoModelParam,
  parseSeedanceCliFlags,
  clampSeedanceV2Duration,
  stripSeedanceDurFlag,
} from '../src/lib/arkVideoEndpointsConfig.js'
import { randomRotateModelIds } from '../src/lib/vendorModelPool.js'
import { applyRegistryVideoAiToMerchantEnv } from './registryVideoAiEnvMerge.js'
import { merchantChatCompletionWithVendorFailover, type MerchantAiEnv } from './merchantAiUpstream.js'
import { handleAliyunIceRoutes } from './aliyunIceGateway.js'
import { concatLocalMp4Buffers, concatRemoteMp4Urls } from './videoConcatServer.js'
import { fetchRemoteVideoBuffer } from './videoDownloadProxyCore.js'

function applyRegistrySliceToVideoAiEnv(
  out: MerchantAiEnv,
  reg: Partial<Pick<RegistryFile, 'videoAi' | 'vendorKeys'>>,
): void {
  applyRegistryVideoAiToMerchantEnv(out, reg)
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
    applyRegistryVendorKeysToMerchantEnv(out, reg.vendorKeys)
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
  try {
    const { loadRegistrySnapshotForServer } = await import('../src/lib/registrySnapshotServerLoad.js')
    const data = await loadRegistrySnapshotForServer(viteRoot)
    if (data) {
      applyRegistrySliceToVideoAiEnv(out, { videoAi: data.videoAi, vendorKeys: data.vendorKeys })
      applyRegistryVendorKeysToMerchantEnv(out, data.vendorKeys)
    }
  } catch {
    /* 未配 Supabase / erp-api 不可达时保留 .env / 本地 registry 结果 */
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
  if (/does not support content generation/i.test(msg)) {
    const underlying = msg.match(/specified model\s+([^\s]+)/i)?.[1] ?? ''
    return (
      `当前所选接入点绑定了对话模型${underlying ? `（${underlying}）` : ''}，无法用于 Seedance 视频生成。` +
      `请在火山方舟控制台新建「Seedance / 视频生成」推理接入点（勿选 Doubao-Seed 对话模型），` +
      `或在运营台填写 Seedance 模型 ID，例如：Seedance 2.0|${DEFAULT_SEEDANCE_VIDEO_MODEL_ID}；` +
      `也可在 Vercel 设置 MERCHANT_AI_SEEDANCE_VIDEO_MODEL=${DEFAULT_SEEDANCE_VIDEO_MODEL_ID} 后重试。`
    )
  }
  if (looksLikeDoubaoChatModelId(endpointId)) {
    return (
      `「${endpointId}」为对话模型，不能用于视频生成。请改用 Seedance 模型（如 ${DEFAULT_SEEDANCE_VIDEO_MODEL_ID}）或 Seedance 专用 ep- 接入点。`
    )
  }
  if (/has not activated the model/i.test(msg)) {
    const modelId = msg.match(/model\s+([^\s.]+)/i)?.[1] ?? endpointId
    return (
      `当前 API Key 所属火山方舟账号尚未开通视频模型「${modelId}」。` +
      `请登录火山方舟控制台 → 模型广场 / 开通管理 → 找到 Seedance 并开通该模型（或创建基于已开通模型的推理接入点 ep-），` +
      `然后在运营台「短视频 API」填写已开通的模型 ID 或 ep（须与 API Key 同账号）。` +
      `控制台：https://console.volcengine.com/ark/region:ark+cn-beijing/model`
    )
  }
  if (/inference limit|Safe Experience Mode|model service has been paused/i.test(msg)) {
    const modelId =
      msg.match(/\*\*([^*]+)\*\*/)?.[1]?.trim() ||
      msg.match(/for the\s+\*?\*?([^\s*.]+)\*?\*?\s+model/i)?.[1]?.trim() ||
      msg.match(/model[「\s]+([^」\s.]+)/i)?.[1]?.trim() ||
      endpointId
    return (
      `火山方舟账号对 Seedance 模型「${modelId}」已达推理限额（安全体验模式），视频生成已暂停。` +
      `系统已尝试切换同账号其它 Seedance 模型及千问视频；若仍失败请到火山方舟控制台关闭或调高「安全体验模式」，或开通正式计费。` +
      `控制台：https://console.volcengine.com/ark/region:ark+cn-beijing/model`
    )
  }
  if (upstreamStatus === 404 || /does not exist|not have access/i.test(msg)) {
    const kind = /^ep-/i.test(endpointId) ? '推理接入点 ep' : '模型'
    return `方舟视频${kind}无效或无权访问（${endpointId}）：${msg}。请在火山方舟控制台确认已开通 Seedance 视频服务，且与运营台配置的 API Key 为同一账号。`
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

function seedanceVideoModelFromEnv(env: MerchantAiEnv): string {
  const fromEnv = String(
    (env as Record<string, string>).MERCHANT_AI_SEEDANCE_VIDEO_MODEL ?? '',
  ).trim()
  return fromEnv || DEFAULT_SEEDANCE_VIDEO_MODEL_ID
}

function parseArkVideoModelList(env: MerchantAiEnv): ArkVideoModelOption[] {
  const raw = (
    env.MERCHANT_AI_ARK_VIDEO_ENDPOINTS ??
    env.MERCHANT_AI_SEEDANCE_VIDEO_MODELS ??
    ''
  ).trim()
  const fb = String((env as Record<string, string>).MERCHANT_AI_ARK_VIDEO_FALLBACK_ENDPOINT ?? '').trim()
  return listArkVideoModelsForPicker(raw, fb, seedanceVideoModelFromEnv(env))
}

const SEEDANCE_SERVER_AUTO = '__server_auto__'

function resolvePreferredVideoModel(raw: unknown): string {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t || t === SEEDANCE_SERVER_AUTO) return ''
  return normalizeArkVideoModelParam(t)
}

function qwenBearerKey(env: MerchantAiEnv): string | null {
  const t = (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
  return t || null
}

function detectVideoInputMode(body: Record<string, unknown>): 't2v' | 'i2v' {
  const images = body.images_base64
  if (Array.isArray(images)) {
    for (const row of images) {
      if (typeof row === 'string' && row.trim()) return 'i2v'
    }
  }
  if (Array.isArray(body.content)) {
    for (const row of body.content) {
      if (row && typeof row === 'object' && String((row as { type?: unknown }).type) === 'image_url') {
        return 'i2v'
      }
    }
  }
  return 't2v'
}

function arkVideoModelCandidates(
  env: MerchantAiEnv,
  body: Record<string, unknown>,
  preferred?: string,
): string[] {
  const mode = detectVideoInputMode(body)
  const envRaw = (
    env.MERCHANT_AI_ARK_VIDEO_ENDPOINTS ??
    env.MERCHANT_AI_SEEDANCE_VIDEO_MODELS ??
    ''
  ).trim()
  const fromList = parseArkVideoModelList(env).map((m) => m.endpointId)
  const merged = mergeCatalogModelIds(DOUBAO_VIDEO_CATALOG, envRaw, preferred, mode)
  const out: string[] = []
  const add = (id: string) => {
    const t = normalizeArkVideoModelParam(id.trim())
    if (t && !out.includes(t)) out.push(t)
  }
  const pref = preferred?.trim()
  if (pref) add(pref)
  for (const id of fromList) add(id)
  for (const id of merged) add(id)
  if (out.length <= 1) return out
  const prefNorm = pref ? normalizeArkVideoModelParam(pref) : ''
  if (!prefNorm) return randomRotateModelIds(out)
  const rest = out.filter((id) => id !== prefNorm)
  return [prefNorm, ...randomRotateModelIds(rest)]
}

function qwenVideoCandidatesFromEnv(env: MerchantAiEnv, mode: 't2v' | 'i2v'): string[] {
  const e = env as Record<string, string | undefined>
  return qwenVideoModelCandidates(
    e.MERCHANT_AI_QWEN_VIDEO_MODELS ?? e.MERCHANT_AI_QWEN_VISION_MODELS,
    e.MERCHANT_AI_QWEN_VIDEO_MODEL,
    mode,
  )
}

function firstImageUrlFromBody(body: Record<string, unknown>): string | undefined {
  const images = body.images_base64
  if (Array.isArray(images)) {
    for (const row of images) {
      if (typeof row !== 'string') continue
      const t = row.trim()
      if (!t) continue
      if (t.startsWith('data:image') || /^https?:\/\//i.test(t)) return t
      return `data:image/jpeg;base64,${t.replace(/\s/g, '')}`
    }
  }
  return undefined
}

function parseImageRefToBuffer(
  imgUrl: string,
): { buffer: Buffer; contentType: string; fileName: string } | null {
  const t = imgUrl.trim()
  if (!t) return null
  const dataMatch = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(t)
  if (dataMatch) {
    const contentType = dataMatch[1]!.toLowerCase()
    const b64 = dataMatch[2]!.replace(/\s/g, '')
    if (!b64) return null
    const buffer = Buffer.from(b64, 'base64')
    if (!buffer.length) return null
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
    return { buffer, contentType, fileName: `qwen-i2v-${Date.now()}.${ext}` }
  }
  if (/^https?:\/\//i.test(t)) return null
  const pure = t.replace(/\s/g, '')
  if (!/^[a-z0-9+/=]+$/i.test(pure)) return null
  const buffer = Buffer.from(pure, 'base64')
  if (!buffer.length) return null
  return { buffer, contentType: 'image/jpeg', fileName: `qwen-i2v-${Date.now()}.jpg` }
}

async function ensurePublicHttpsImageUrl(
  viteRoot: string | undefined,
  env: MerchantAiEnv,
  imgUrl: string,
): Promise<string | null> {
  const t = imgUrl.trim()
  if (/^https?:\/\//i.test(t)) return t
  const parsed = parseImageRefToBuffer(t)
  if (!parsed) return null
  try {
    const { loadIceGatewayConfig } = await import('./aliyunIceGateway.js')
    const { putIceSourceObject } = await import('./aliyunOssIceUpload.js')
    const cfg = await loadIceGatewayConfig(viteRoot ?? process.cwd(), env as Record<string, string | undefined>)
    if (!cfg) return null
    const put = await putIceSourceObject(cfg, env as Record<string, string | undefined>, {
      fileName: parsed.fileName,
      contentType: parsed.contentType,
      buffer: parsed.buffer,
    })
    return put.ok ? put.mediaUrl : null
  } catch {
    return null
  }
}

function extractQwenApiErrorMessage(j: Record<string, unknown>, fallback: string): string {
  const direct = typeof j.message === 'string' ? j.message.trim() : ''
  if (direct) return direct
  const code = typeof j.code === 'string' ? j.code.trim() : ''
  if (code) return code
  const details = j.details
  if (Array.isArray(details)) {
    for (const row of details) {
      if (!row || typeof row !== 'object') continue
      const msg = (row as { message?: unknown }).message
      if (typeof msg === 'string' && msg.trim()) return msg.trim()
    }
  }
  return fallback
}

function isQwenVideoTaskHopableError(msg: string): boolean {
  return isArkQuotaHopableError(msg) || isQwenVideoModelHopableError(msg)
}

function parseQwenVideoTaskPoll(j: Record<string, unknown>): ArkPollState {
  const output = j.output as Record<string, unknown> | undefined
  const status = String(output?.task_status ?? j.task_status ?? '').toUpperCase()
  const videoUrl =
    normalizeHttpUrl(output?.video_url) ||
    normalizeHttpUrl(output?.videoUrl) ||
    extractHttpVideoUrl(j)
  if (status === 'SUCCEEDED' && videoUrl) {
    return { phase: 'succeeded', statusLabel: status, videoUrl }
  }
  if (status === 'FAILED' || status === 'UNKNOWN') {
    const failReason =
      (typeof output?.message === 'string' && output.message) ||
      (typeof j.message === 'string' && j.message) ||
      '千问视频任务失败'
    return { phase: 'failed', statusLabel: status, failReason }
  }
  const phase: ArkPollPhase =
    status === 'PENDING' || status === 'QUEUED' || status === 'SUBMITTED' ? 'queued' : 'running'
  return { phase, statusLabel: status || 'RUNNING', videoUrl: videoUrl || undefined }
}

/** 单次查询千问异步任务（供客户端轮询；禁止在 status 接口内阻塞长轮询） */
async function qwenGetVideoTaskOnce(apiKey: string, taskId: string): Promise<ArkPollState> {
  const url = `https://dashscope.aliyuncs.com/api/v1/tasks/${encodeURIComponent(taskId)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  const j = await readJsonResponse(res)
  if (!res.ok) {
    const msg = (typeof j.message === 'string' && j.message) || `千问任务查询 HTTP ${res.status}`
    throw new Error(msg)
  }
  return parseQwenVideoTaskPoll(j)
}

async function qwenPostVideoTask(
  env: MerchantAiEnv,
  body: Record<string, unknown>,
  viteRoot?: string,
): Promise<{ ok: false; msg: string } | { ok: true; taskId: string; modelUsed: string }> {
  const key = qwenBearerKey(env)
  if (!key) {
    return {
      ok: false,
      msg: '未配置通义千问 Key，无法切换千问视频。请在运营台配置 MERCHANT_AI_QWEN_KEY 或 DASHSCOPE_API_KEY。',
    }
  }
  const mode = detectVideoInputMode(body)
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const flags = parseSeedanceCliFlags(typeof body.flags === 'string' ? body.flags : '')
  const rawImgUrl = mode === 'i2v' ? firstImageUrlFromBody(body) : undefined
  if (mode === 'i2v' && !rawImgUrl) {
    return { ok: false, msg: '图生视频缺少参考图，无法切换千问 i2v 模型。' }
  }
  if (!prompt && mode === 't2v') {
    return { ok: false, msg: '文生视频缺少提示词。' }
  }

  let lastMsg = '千问视频生成失败'
  for (const modelId of qwenVideoCandidatesFromEnv(env, mode)) {
    let imgUrl = rawImgUrl
    if (imgUrl && isQwenWan27VideoModel(modelId) && isQwenWan27I2vModel(modelId)) {
      const publicUrl = await ensurePublicHttpsImageUrl(viteRoot, env, imgUrl)
      if (!publicUrl) {
        lastMsg =
          '千问 wan2.7 图生视频需要公网 https 参考图，临时上传 OSS 失败。请在运营台配置云剪 OSS 前缀后重试。'
        continue
      }
      imgUrl = publicUrl
    }
    const built = buildQwenVisionVideoRequest(modelId, prompt, {
      imgUrl,
      duration: mode === 'i2v' ? undefined : flags.duration,
      ratio: flags.ratio,
    })
    try {
      const res = await fetch(built.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify(built.body),
      })
      const j = await readJsonResponse(res)
      if (!res.ok) {
        lastMsg = extractQwenApiErrorMessage(j, `千问视频创建失败 HTTP ${res.status}`)
        if (!isQwenVideoTaskHopableError(lastMsg)) continue
        continue
      }
      const output = j.output as Record<string, unknown> | undefined
      const taskId = String(output?.task_id ?? j.task_id ?? '').trim()
      if (!taskId) {
        lastMsg = '千问视频未返回 task_id'
        continue
      }
      return { ok: true, taskId, modelUsed: modelId }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
      if (!isQwenVideoTaskHopableError(lastMsg)) continue
    }
  }
  return {
    ok: false,
    msg: `${lastMsg}。豆包视频模型额度已用尽或不可用，已尝试切换千问视频模型仍失败；请充值火山方舟或百炼账户后重试。`,
  }
}

function parseMediaRefToBuffer(
  raw: string,
  defaultMime: string,
  defaultExt: string,
): { buffer: Buffer; contentType: string; fileName: string } | null {
  const t = raw.trim()
  if (!t) return null
  const dataMatch = /^data:([^;]+);base64,(.+)$/i.exec(t)
  if (dataMatch) {
    const contentType = dataMatch[1]!.toLowerCase()
    const b64 = dataMatch[2]!.replace(/\s/g, '')
    if (!b64) return null
    const buffer = Buffer.from(b64, 'base64')
    if (!buffer.length) return null
    const ext = contentType.includes('mpeg') || contentType.includes('mp3') ? 'mp3' : defaultExt
    return { buffer, contentType, fileName: `dh-s2v-${Date.now()}.${ext}` }
  }
  if (/^https?:\/\//i.test(t)) return null
  const pure = t.replace(/\s/g, '')
  if (!/^[a-z0-9+/=]+$/i.test(pure)) return null
  const buffer = Buffer.from(pure, 'base64')
  if (!buffer.length) return null
  return {
    buffer,
    contentType: defaultMime,
    fileName: `dh-s2v-${Date.now()}.${defaultExt}`,
  }
}

async function ensurePublicHttpsMediaUrl(
  viteRoot: string | undefined,
  env: MerchantAiEnv,
  raw: string,
  kind: 'image' | 'audio',
  opts?: { normalizeS2vPortrait?: boolean },
): Promise<string | null> {
  const t = raw.trim()
  if (/^https?:\/\//i.test(t)) return t
  const parsed =
    kind === 'image'
      ? parseImageRefToBuffer(t)
      : parseMediaRefToBuffer(t, 'audio/mpeg', 'mp3')
  if (!parsed) return null
  let upload = parsed
  if (kind === 'image' && opts?.normalizeS2vPortrait) {
    upload = await normalizePortraitBufferForS2v(parsed.buffer, parsed.contentType, parsed.fileName)
  }
  try {
    const { loadIceGatewayConfig } = await import('./aliyunIceGateway.js')
    const { putIceSourceObject } = await import('./aliyunOssIceUpload.js')
    const cfg = await loadIceGatewayConfig(viteRoot ?? process.cwd(), env as Record<string, string | undefined>)
    if (!cfg) return null
    const put = await putIceSourceObject(cfg, env as Record<string, string | undefined>, {
      fileName: upload.fileName,
      contentType: upload.contentType,
      buffer: upload.buffer,
    })
    return put.ok ? put.mediaUrl : null
  } catch {
    return null
  }
}

async function qwenPostS2vVideoTask(
  env: MerchantAiEnv,
  body: Record<string, unknown>,
  viteRoot?: string,
): Promise<{ ok: false; msg: string } | { ok: true; taskId: string; modelUsed: string }> {
  const key = qwenBearerKey(env)
  if (!key) {
    return {
      ok: false,
      msg: '未配置通义千问 Key，无法使用 wan2.2-s2v 口型驱动。请在运营台配置 MERCHANT_AI_QWEN_KEY。',
    }
  }
  const imageRaw =
    (typeof body.image_base64 === 'string' && body.image_base64.trim()) ||
    (Array.isArray(body.images_base64) &&
      typeof body.images_base64[0] === 'string' &&
      body.images_base64[0].trim()) ||
    ''
  const audioRaw = typeof body.audio_base64 === 'string' ? body.audio_base64.trim() : ''
  if (!imageRaw) {
    return { ok: false, msg: '口型驱动缺少人像参考图，请先选择形象或上传正面照片。' }
  }
  if (!audioRaw) {
    return { ok: false, msg: '口型驱动缺少口播音频。' }
  }
  const imageUrl = await ensurePublicHttpsMediaUrl(viteRoot, env, imageRaw, 'image', {
    normalizeS2vPortrait: true,
  })
  if (!imageUrl) {
    return {
      ok: false,
      msg: '人像参考图上传 OSS 失败。请在运营台「短视频 API」配置云剪 OSS 前缀后重试。',
    }
  }
  const audioUrl = await ensurePublicHttpsMediaUrl(viteRoot, env, audioRaw, 'audio')
  if (!audioUrl) {
    return {
      ok: false,
      msg: '口播音频上传 OSS 失败。请在运营台配置云剪 OSS 前缀后重试。',
    }
  }
  const resolution =
    body.resolution === '480P' || body.resolution === '720P' ? body.resolution : '720P'
  const e = env as Record<string, string | undefined>
  const envRaw = (e.MERCHANT_AI_QWEN_VIDEO_MODELS ?? e.MERCHANT_AI_QWEN_VISION_MODELS ?? '').trim()
  const preferred = (e.MERCHANT_AI_QWEN_PORTRAIT_MODEL ?? 'wan2.2-s2v').trim()
  const candidates = qwenPortraitModelCandidates(envRaw, preferred)

  let lastMsg = '千问口型驱动失败'
  const tried: string[] = []

  for (const modelId of candidates) {
    const built = buildQwenWanS2vRequest({ modelId, imageUrl, audioUrl, resolution })
    tried.push(modelId)
    try {
      const res = await fetch(built.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify(built.body),
      })
      const j = await readJsonResponse(res)
      if (!res.ok) {
        lastMsg = extractQwenApiErrorMessage(j, `千问口型驱动创建失败 HTTP ${res.status}`)
        if (!isQwenVideoTaskHopableError(lastMsg)) continue
        continue
      }
      const output = j.output as Record<string, unknown> | undefined
      const taskId = String(output?.task_id ?? j.task_id ?? '').trim()
      if (!taskId) {
        lastMsg = '千问口型驱动未返回 task_id'
        continue
      }
      return { ok: true, taskId, modelUsed: modelId }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
      if (!isQwenVideoTaskHopableError(lastMsg)) continue
    }
  }

  const summary =
    tried.length > 1
      ? `${lastMsg}（已依次尝试 ${tried.length} 个千问口型模型：${tried.slice(0, 6).join(' → ')}${tried.length > 6 ? '…' : ''}）`
      : lastMsg
  return { ok: false, msg: summary }
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

function looksLikePlayableVideoUrl(raw: string): boolean {
  const t = raw.trim()
  if (!/^https?:\/\/\S+/i.test(t)) return false
  if (/\.(mp4|webm|mov)(\?\S*)?$/i.test(t)) return true
  if (/blob|vod|tos|tos-cn|cdn|video|seedance/i.test(t)) return true
  return false
}

/** 从方舟「查询视频任务」等大 JSON 中提取 mp4/https 播放地址（字段名多端差异较大） */
function extractHttpVideoUrl(depth: unknown, dep = 0): string | undefined {
  if (dep > 12) return undefined
  if (typeof depth === 'string') {
    return looksLikePlayableVideoUrl(depth) ? depth.trim() : undefined
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
  for (const k of [
    'video_url',
    'videoUrl',
    'preview_video_url',
    'previewVideoUrl',
    'output_url',
    'outputUrl',
    'url',
  ]) {
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

function buildArkVideoTaskPayload(
  modelId: string,
  body: Record<string, unknown>,
): { ok: false; msg: string } | { ok: true; payload: Record<string, unknown> } {
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const imagesUnknown = body.images_base64
  const extraFlags = typeof body.flags === 'string' ? body.flags.trim() : ''
  const useSeedanceV2 = isDoubaoSeedanceModelId(modelId)
  const flagParsed = parseSeedanceCliFlags(extraFlags)

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
    let textCombined = useSeedanceV2
      ? prompt
      : `${prompt}${extraFlags ? ` ${extraFlags}` : ''}`.trim()
    if (!textCombined && imageRows.length > 0) {
      textCombined = '按上传的画面生成连贯短视频。'
    }
    if (!textCombined) {
      return { ok: false, msg: '请填写提示词，或上传至少一张参考图。' }
    }
    /** ep 图生视频不支持 --dur 自定义时长 */
    if (!useSeedanceV2 && imageRows.length > 0 && extraFlags) {
      const flagsNoDur = stripSeedanceDurFlag(extraFlags)
      textCombined = `${prompt}${flagsNoDur ? ` ${flagsNoDur}` : ''}`.trim()
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

  const payload: Record<string, unknown> = { model: modelId, content: contentArr }
  const isI2v = contentArr.some(
    (row) => String((row as { type?: unknown }).type) === 'image_url',
  )
  if (useSeedanceV2) {
    /** 图生/续帧不支持 duration 字段，传了会报 duration customization is not supported */
    if (!isI2v && flagParsed.duration != null) {
      payload.duration = clampSeedanceV2Duration(flagParsed.duration)
    }
    if (flagParsed.ratio) payload.ratio = flagParsed.ratio
    payload.watermark = flagParsed.watermark ?? false
    payload.resolution = flagParsed.resolution ?? '720p'
  }
  return { ok: true, payload }
}

async function arkPostVideoGenerationTask(
  env: MerchantAiEnv,
  key: string,
  payload: Record<string, unknown>,
  modelForError: string,
): Promise<
  | { ok: false; msg: string; status?: number; rawMsg?: string }
  | { ok: true; taskId: string; raw?: unknown }
> {
  const root = arkApiV3Root(env)
  const res = await fetch(`${root}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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
      msg: arkCreateTaskUserMessage(rawMsg, modelForError, res.status),
      status: arkCreateTaskHttpStatus(res.status),
      rawMsg,
    }
  }
  if (!idRaw) return { ok: false, msg: '方舟未返回任务 id。', status: res.status }
  return { ok: true, taskId: idRaw, raw: j }
}

async function arkCreateVideoTask(
  env: MerchantAiEnv,
  body: Record<string, unknown>,
  viteRoot?: string,
): Promise<
  | { ok: false; msg: string; status?: number }
  | { ok: true; taskId: string; provider?: 'ark' | 'qwen'; modelUsed?: string; raw?: unknown }
> {
  const preferQwenOnly = String(body.prefer_provider ?? '').trim().toLowerCase() === 'qwen'
  const key = doubaoBearerKey(env)
  const rawModel = typeof body.model === 'string' ? body.model.trim() : ''
  const isServerAuto = !rawModel || rawModel === SEEDANCE_SERVER_AUTO
  const preferred = resolvePreferredVideoModel(body.model)
  const candidates =
    preferQwenOnly || !key
      ? []
      : isServerAuto
        ? arkVideoModelCandidates(env, body, preferred)
        : [normalizeArkVideoModelParam(rawModel)]

  let lastMsg = preferQwenOnly ? '千问视频生成失败' : '豆包视频生成失败'
  let lastStatus: number | undefined
  let tried = 0

  if (key && candidates.length > 0) {
    for (const modelId of candidates) {
      if (looksLikeArkPlaceholderEndpointId(modelId) || looksLikeDoubaoChatModelId(modelId)) continue
      const built = buildArkVideoTaskPayload(modelId, body)
      if (built.ok === false) continue
      tried += 1
      const posted = await arkPostVideoGenerationTask(env, key, built.payload, modelId)
      if (posted.ok === true) {
        return { ok: true, taskId: posted.taskId, provider: 'ark', modelUsed: modelId, raw: posted.raw }
      }
      lastMsg = posted.msg
      lastStatus = posted.status
      const hopable =
        isArkQuotaHopableError(posted.rawMsg ?? '') ||
        isArkQuotaHopableError(posted.msg) ||
        /duration customization is not supported|duration must be in/i.test(posted.msg)
      if (!hopable) {
        const soft = /请填写|无效|placeholder|对话模型|not activated/i.test(posted.msg)
        if (soft) continue
      }
      if (!hopable) break
    }
  } else if (!key && !preferQwenOnly) {
    lastMsg =
      '未检测到方舟 / 豆包 API Key：请到运营管控台「AI模型 → 短视频 API」配置专用 Key 或「豆包」Key。'
  }

  const qwen = await qwenPostVideoTask(env, body, viteRoot)
  if (qwen.ok === true) {
    return {
      ok: true,
      taskId: wrapQwenVideoTaskId(qwen.taskId),
      provider: 'qwen',
      modelUsed: qwen.modelUsed,
    }
  }

  return {
    ok: false,
    msg: preferQwenOnly
      ? qwen.msg
      : key
        ? tried > 1
          ? `${lastMsg}（已自动尝试 ${tried} 个豆包/Seedance 模型）；${qwen.msg}`
          : `${lastMsg}；${qwen.msg}`
        : qwen.msg,
    status: lastStatus,
  }
}

async function arkGetVideoTask(
  env: MerchantAiEnv,
  taskId: string,
): Promise<{ ok: false; msg: string; status?: number } | { ok: true; state: ArkPollState }> {
  const key = doubaoBearerKey(env)
  if (!key) return { ok: false, msg: '未配置方舟 API Key。' }
  const root = arkApiV3Root(env)
  let lastMsg = '方舟查询任务失败'
  let lastStatus: number | undefined
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${root}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
    })
    const j = await readJsonResponse(res)
    if (!res.ok) {
      lastMsg =
        (typeof j.message === 'string' && j.message) || `方舟查询任务失败（HTTP ${res.status}）。`
      lastStatus = res.status
      if (isArkQuotaHopableError(lastMsg) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
        continue
      }
      return { ok: false, msg: lastMsg, status: lastStatus }
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
    ) {
      phase = videoUrl ? 'succeeded' : 'running'
    } else if (st === 'failed' || st === 'error') phase = 'failed'
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
  return { ok: false, msg: lastMsg, status: lastStatus }
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
  req?: import('node:http').IncomingMessage
  viteRoot?: string
  env: MerchantAiEnv
}): Promise<boolean> {
  const { method, pathname, searchParams, res, bodyRaw, env: rawEnv } = input
  const env = await mergeVideoAiMerchantEnvWithSnapshot(input.viteRoot, rawEnv)

  if (await handleAliyunIceRoutes({ ...input, env })) return true

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
    const iceOk = Boolean(
      (env.ALIYUN_ICE_APP_ID ?? '').trim() &&
        (env.ALIYUN_ICE_ACCESS_KEY_ID ?? env.ALIBABA_CLOUD_ACCESS_KEY_ID ?? '').trim() &&
        (env.ALIYUN_ICE_ACCESS_KEY_SECRET ?? env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ?? '').trim(),
    )
    const credentialNote =
      '商户端仅可选择模型能力与参数；可灵、方舟视频、阿里云 ICE 云剪辑凭据由运营在「管控台 · AI模型」维护，经 Supabase 注册表快照下发（生产须配置 VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY）；本地 dev 亦可落盘于项目根 .meoo-dev-sync。'
    json(res, 200, {
      klingConfigured: kCfg.ok,
      arkVideoModels: arkOpts,
      arkKeyConfigured: arkKeyOk,
      arkVideoSetupIssue,
      iceConfigured: iceOk,
      /** @deprecated 使用 iceConfigured */
      openshotConfigured: iceOk,
      longformPlanner: {
        doubao: arkKeyOk,
        qwen: qwenOk,
      },
      qwenVideoConfigured: qwenOk,
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
    const plannerRaw = String(parsed.plannerModel ?? 'auto').toLowerCase()
    let plannerModel: 'doubao' | 'qwen' | 'auto' =
      plannerRaw === 'qwen' ? 'qwen' : plannerRaw === 'doubao' ? 'doubao' : 'auto'
    const qwenKeyOk = !!qwenBearerKey(env)
    if (qwenKeyOk && plannerModel !== 'qwen') {
      plannerModel = 'qwen'
    }
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
      const chat = await merchantChatCompletionWithVendorFailover(
        env,
        parsed,
        plannerModel,
        LONGFORM_PLAN_SYSTEM,
        userMsg,
      )
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

  if (method === 'POST' && pathname === '/api/merchant/ai/video/concat-urls') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const rawUrls = parsed.urls
    const urls = Array.isArray(rawUrls)
      ? rawUrls.map((x) => String(x).trim()).filter((u) => /^https?:\/\//i.test(u))
      : []
    if (urls.length < 2) {
      json(res, 400, { ok: false, message: '缺少至少 2 个有效视频 URL。' })
      return true
    }
    const merged = await concatRemoteMp4Urls(urls)
    if (!merged.ok) {
      json(res, 502, { ok: false, message: merged.message })
      return true
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', String(merged.buffer.length))
    res.end(merged.buffer)
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/concat-blobs') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const rawSegs = parsed.segments
    if (!Array.isArray(rawSegs) || rawSegs.length < 2) {
      json(res, 400, { ok: false, message: '缺少至少 2 段 base64 视频片段。' })
      return true
    }
    const buffers: Buffer[] = []
    for (let i = 0; i < rawSegs.length; i++) {
      const b64 = String(rawSegs[i] ?? '').trim()
      if (!b64) {
        json(res, 400, { ok: false, message: `第 ${i + 1} 段为空` })
        return true
      }
      try {
        const buf = Buffer.from(b64, 'base64')
        if (buf.length > 80 * 1024 * 1024) {
          json(res, 400, { ok: false, message: `第 ${i + 1} 段过大` })
          return true
        }
        buffers.push(buf)
      } catch {
        json(res, 400, { ok: false, message: `第 ${i + 1} 段 base64 无效` })
        return true
      }
    }
    const merged = await concatLocalMp4Buffers(buffers)
    if (!merged.ok) {
      json(res, 502, { ok: false, message: merged.message })
      return true
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', String(merged.buffer.length))
    res.end(merged.buffer)
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/mux-audio') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const videoB64 = String(parsed.videoBase64 ?? '').trim()
    const audioB64 = String(parsed.audioBase64 ?? '').trim()
    if (!videoB64 || !audioB64) {
      json(res, 400, { ok: false, message: '缺少 videoBase64 或 audioBase64' })
      return true
    }
    let videoBuf: Buffer
    let audioBuf: Buffer
    try {
      videoBuf = Buffer.from(videoB64, 'base64')
      audioBuf = Buffer.from(audioB64, 'base64')
    } catch {
      json(res, 400, { ok: false, message: 'base64 无效' })
      return true
    }
    const { muxLocalVideoAudio } = await import('./videoConcatServer.js')
    const merged = await muxLocalVideoAudio(videoBuf, audioBuf)
    if (!merged.ok) {
      json(res, 502, { ok: false, message: merged.message })
      return true
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', String(merged.buffer.length))
    res.end(merged.buffer)
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
    const bearer = doubaoBearerKey(env) ?? undefined
    const fetched = await fetchRemoteVideoBuffer(urlStr, { bearer })
    if (!fetched.ok) {
      json(res, 502, { ok: false, message: fetched.message })
      return true
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', String(fetched.buffer.length))
    res.end(fetched.buffer)
    return true
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

  if (method === 'POST' && pathname === '/api/merchant/ai/video/dh-s2v/start') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const s2v = await qwenPostS2vVideoTask(env, parsed, input.viteRoot)
    if (s2v.ok === true) {
      json(res, 200, {
        ok: true,
        taskId: s2v.taskId,
        provider: 'qwen',
        modelUsed: s2v.modelUsed,
        pipeline: 'wan_s2v',
      })
      return true
    }
    json(res, 400, { ok: false, message: s2v.msg })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/ai/video/dh-s2v/status') {
    const taskIdDh = (searchParams.get('taskId') ?? '').trim()
    if (!taskIdDh) {
      json(res, 400, { ok: false, message: '缺少 query taskId。' })
      return true
    }
    const qk = qwenBearerKey(env)
    if (!qk) {
      json(res, 502, { ok: false, message: '未配置通义千问 Key，无法查询口型驱动任务。' })
      return true
    }
    try {
      const rawId = stripQwenVideoTaskPrefix(taskIdDh)
      const state = await qwenGetVideoTaskOnce(qk, rawId)
      json(res, 200, { ok: true, provider: 'qwen', ...state })
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      json(res, 502, { ok: false, message: msg })
      return true
    }
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/seedance/start') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    if (String(parsed.pipeline ?? '').trim() === 'wan_s2v') {
      const s2v = await qwenPostS2vVideoTask(env, parsed, input.viteRoot)
      if (s2v.ok === true) {
        json(res, 200, {
          ok: true,
          taskId: wrapQwenVideoTaskId(s2v.taskId),
          provider: 'qwen',
          modelUsed: s2v.modelUsed,
          pipeline: 'wan_s2v',
        })
        return true
      }
      json(res, 400, { ok: false, message: s2v.msg })
      return true
    }
    const r = await arkCreateVideoTask(env, parsed, input.viteRoot)
    if (r.ok === true) {
      json(res, 200, {
        ok: true,
        taskId: r.taskId,
        provider: r.provider ?? 'ark',
        modelUsed: r.modelUsed ?? null,
      })
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
    if (isQwenVideoTaskId(taskIdSd)) {
      const qk = qwenBearerKey(env)
      if (!qk) {
        json(res, 502, { ok: false, message: '未配置通义千问 Key，无法查询千问视频任务。' })
        return true
      }
      try {
        const state = await qwenGetVideoTaskOnce(qk, stripQwenVideoTaskPrefix(taskIdSd))
        json(res, 200, { ok: true, provider: 'qwen', ...state })
        return true
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        json(res, 502, { ok: false, message: msg })
        return true
      }
    }
    const r = await arkGetVideoTask(env, taskIdSd)
    if (r.ok === true) {
      json(res, 200, { ok: true, provider: 'ark', ...r.state })
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
