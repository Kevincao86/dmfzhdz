/** 同源 /api/merchant/ai/video：由 Vite 中间层代理可灵与方舟，密钥仅服务端环境变量 */

import {
  isArkQuotaHopableError,
  isQwenVideoModelHopableError,
} from '../lib/arkModelCatalog'
import { SEEDANCE_SERVER_AUTO } from '../lib/shortVideoUiLabels'
import {
  buildVideoDurationMatchedTryPlan,
  clampI2vImagesForApi,
  parseI2vMaxImagesFromBody,
  parseVideoDurationFromFlags,
  replaceVideoDurationInFlags,
} from '../lib/videoModelDuration'
import { appendAspectToVideoPrompt } from '../lib/shortVideoRenderFlags'
import { merchantApiFetchUrls, merchantBinaryApiFetchUrls } from '../lib/merchantErpApiBase'
import { merchantApiAuthHeaders, resolveMerchantApiBearer } from '../lib/merchantApiAuth'
import { fetchPrimaryTenantId } from '../lib/tenantBilling'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

/** 豆包/千问短视频生成请求体（浏览器 → 网关） */
export type ShortVideoGenRequestBody = {
  model?: string
  prompt?: string
  flags?: string
  images_base64?: string[]
  /** 数字人产品融合等：允许保留多张 i2v 参考图（默认 1） */
  i2v_max_images?: number
  /** 数字人口播等：跳过豆包/方舟，直接走千问视频 */
  prefer_provider?: 'qwen'
  /** 数字人口播等：lite-i2v / Seaweed 优先，Pro 排后；千问跳过 wan2.7 */
  prefer_quota_stable?: boolean
  /** 数字人口播：仅用火山/Seedance，额度不足时在豆包模型池内切换，禁止回退千问 */
  skip_qwen?: boolean
  /**
   * 阶段 D：Wan/垂类 LoRA 挂载点（DiffSynth/musubi）。
   * 本轮仅类型预留，网关忽略；勿依赖此字段改变生成结果。
   */
  styleAdapter?: { id: string; strength?: number }
}

export function formatVideoAiUserError(msg: string): string {
  const raw = String(msg ?? '').trim()
  if (!raw) return raw
  if (/duration customization is not supported|duration must be in/i.test(raw)) {
    return (
      '当前模型不支持您选择的视频时长（10 秒图生视频须 Seedance 1.5/2.0 或千问 wan2.6+）。' +
      '系统会按所选秒数自动切换兼容模型；若全部失败请到运营台开通 Seedance 1.5 或配置千问视频 Key。' +
      `原始信息：${raw}`
    )
  }
  if (/field required:\s*input[_\.]?media/i.test(raw)) {
    return (
      '千问 wan2.7 图生视频需要公网参考图，已自动切换 wan2.6 等兼容模型。' +
      '若仍失败请配置云剪 OSS 或改用灵祺视频模型2（Seedance）。' +
      `原始信息：${raw}`
    )
  }
  if (/parse input json error.*video_url|field required:\s*video_url/i.test(raw)) {
    return (
      '千问视频模型协议不匹配（该模型需 video_url，不能用于纯文案/分镜生成）。' +
      '系统会自动切换 wan2.6-t2v 等文生视频模型；若仍失败请检查运营台「千问视觉模型」配置，勿混入 videoretalk / liveportrait 等口型模型。' +
      `原始信息：${raw}`
    )
  }
  if (/function not supported/i.test(raw)) {
    return (
      '千问视频编辑模型（如 vace / videoedit）不支持纯文案文生视频，已自动切换 wan2.6-t2v / wan2.7-t2v 等模型。' +
      '若仍失败请到运营台「千问视觉模型」中仅保留 *-t2v / *-i2v 模型，勿混入视频编辑或口型模型。' +
      `原始信息：${raw}`
    )
  }
  if (/inappropriate content|content[_\s-]?filter|content policy|safety filter|blocked by safety|moderation|内容审核|敏感内容|不当内容/i.test(raw)) {
    return (
      '视频模型内容安全审核未通过（生成画面被判定可能含不当内容）。' +
      '建议：简化分镜文案（减少真人录屏、网址、平台界面等描述）、更换分镜参考图，或切换灵祺视频模型1/2。' +
      '系统会自动尝试其它模型；若仍失败请修改文案后重试。' +
      `原始信息：${raw}`
    )
  }
  if (/invalid content\.text|Invalid content\.text/i.test(raw)) {
    return (
      '视频模型提示词过长或格式不符合 Seedance 要求（content.text 校验失败）。' +
      '系统已自动精简提示词；请点「再编辑」后重新渲染。若仍失败请缩短动作指令或背景描述。' +
      `原始信息：${raw}`
    )
  }
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

/** 接口未部署 / 路由未命中 / 网关不可达时，应继续尝试千问或其它候选 URL */
function isVideoApiUnreachableError(msg: string): boolean {
  const raw = String(msg ?? '').trim()
  if (!raw) return false
  return (
    /HTTP\s*404|接口不可达|路由未|not[_\s-]?found|请部署\s*api\//i.test(raw) ||
    /fetch failed|failed to fetch|networkerror|network request failed/i.test(raw) ||
    /HTTP\s*502|HTTP\s*503|HTTP\s*504|bad gateway|gateway timeout/i.test(raw)
  )
}

/** 千问 / 豆包视频额度、限流、时长或参数不匹配时可切换模型 */
export function isVideoModelHopableError(msg: string): boolean {
  const raw = String(msg ?? '').trim()
  if (!raw) return false
  if (isArkQuotaHopableError(raw) || isQwenVideoModelHopableError(raw)) return true
  if (isVideoApiUnreachableError(raw)) return true
  if (/duration must be in|duration customization is not supported|不支持.*时长|时长.*不支持/i.test(raw)) {
    return true
  }
  if (/does not support content generation|not support.*video|不支持.*视频|function not supported/i.test(raw)) {
    return true
  }
  if (/inappropriate content|content[_\s-]?filter|content policy|safety filter|blocked by safety|moderation|内容审核|敏感内容|不当内容/i.test(raw)) {
    return true
  }
  /** 方舟 Key 未配置时服务端会再试千问；客户端应继续 tryPlan 中的千问步 */
  if (/未检测到方舟|未配置方舟|方舟.*API Key|火山方舟.*Key/i.test(raw)) return true
  if (/invalid content\.text|Invalid content\.text/i.test(raw)) return true
  return false
}

/** @deprecated 使用 isVideoModelHopableError */
export function isVideoQuotaHopableError(msg: string): boolean {
  return isVideoModelHopableError(msg)
}

function isVideoInputValidationError(msg: string): boolean {
  const raw = String(msg ?? '').trim()
  if (!raw) return false
  /** 额度/未开通/限流等应走模型切换，不可当作输入校验直接中止 */
  if (isVideoModelHopableError(raw)) return false
  return /请填写|请用文字|缺少|不能为空|invalid prompt|placeholder|请先选择|图生视频缺少/i.test(
    raw,
  )
}

export type ShortVideoJobFail = {
  ok: false
  message: string
  /** 已按该秒数轮询完所有候选模型仍未成功 */
  exhaustedAtDuration?: number
  triedCount?: number
}

/** 10 秒时长下全部候选模型额度/限流耗尽，可降级为 5 秒 */
export function shouldFallbackVideoDurationToFiveSec(
  message: string,
  requestedDur: number,
  meta?: { exhaustedAtDuration?: number; triedCount?: number },
): boolean {
  if (requestedDur < 10) return false
  if (
    meta?.exhaustedAtDuration !== undefined &&
    meta.exhaustedAtDuration >= 10 &&
    (meta.triedCount ?? 0) > 0
  ) {
    return true
  }
  if (!isVideoModelHopableError(message)) return false
  return (
    /已按\s*10\s*秒/.test(message) ||
    /10\s*秒.*尝试.*路/.test(message) ||
    /安全体验模式|推理限额|推理限制|inference limit|reached the set inference limit|额度|quota|rate limit|too many requests/i.test(
      message,
    )
  )
}

/**
 * 短视频生成：模型1（千问）与模型2（豆包/Seedance）互备。
 * 与数字人口播一致：当前引擎额度用尽时自动切换另一路可用模型池。
 */
export async function postShortVideoStartWithCrossFailover(opts: {
  engine: 'qwen' | 'seedance'
  body: ShortVideoGenRequestBody
  poolModels?: string[]
}): Promise<
  | {
      ok: true
      taskId: string
      modelUsed?: string | null
      provider?: string
      engineUsed: 'qwen' | 'seedance'
    }
  | { ok: false; message: string }
> {
  const { engine, body, poolModels } = opts

  const tryQwen = () =>
    postSeedanceVideoStart({
      ...body,
      model: SEEDANCE_SERVER_AUTO,
      prefer_provider: 'qwen',
    })

  const trySeedance = () =>
    postSeedanceVideoStartWithFailover({
      ...body,
      model: body.model?.trim() || SEEDANCE_SERVER_AUTO,
      poolModels: poolModels ?? [],
    })

  const primary = engine === 'qwen' ? tryQwen : trySeedance
  const fallback = engine === 'qwen' ? trySeedance : tryQwen

  const first = await primary()
  if (first.ok) {
    return {
      ...first,
      engineUsed: engine,
    }
  }

  if (isVideoInputValidationError(first.message)) {
    return { ok: false, message: formatVideoAiUserError(first.message) }
  }

  const second = await fallback()
  if (second.ok) {
    return {
      ...second,
      engineUsed: engine === 'qwen' ? 'seedance' : 'qwen',
    }
  }

  const summary = `${formatVideoAiUserError(first.message)}；已自动切换${engine === 'qwen' ? '灵祺视频模型2' : '灵祺视频模型1（千问）'}仍失败：${formatVideoAiUserError(second.message)}`
  return { ok: false, message: summary }
}

export type VideoAiBackendConfig = {
  klingConfigured: boolean
  arkKeyConfigured: boolean
  arkVideoModels: { label: string; endpointId: string }[]
  iceConfigured?: boolean
  /** @deprecated 使用 iceConfigured */
  openshotConfigured?: boolean
  longformPlanner?: {
    doubao: boolean
    qwen: boolean
    doubaoModelId?: string
    qwenModelId?: string
    failoverOrder?: string
    anyConfigured?: boolean
    vendors?: Partial<
      Record<
        'deepseek' | 'minimax' | 'kimi' | 'openai' | 'claude' | 'gemini' | 'grok' | 'qwen' | 'doubao',
        boolean
      >
    >
  }
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

let cachedVideoAuthHeaders: Record<string, string> | null = null
let cachedVideoAuthAt = 0
let cachedVideoTenantId: string | undefined

async function videoAuthHeaders(): Promise<Record<string, string>> {
  if (cachedVideoAuthHeaders && Date.now() - cachedVideoAuthAt < 30_000) {
    return cachedVideoAuthHeaders
  }
  const auth = await resolveMerchantApiBearer()
  cachedVideoAuthHeaders = merchantApiAuthHeaders(auth.token, auth.source)
  cachedVideoAuthAt = Date.now()
  return cachedVideoAuthHeaders
}

async function videoTenantIdForApi(): Promise<string | undefined> {
  if (cachedVideoTenantId) return cachedVideoTenantId
  if (!supabaseConfigured || !supabase) return undefined
  cachedVideoTenantId = (await fetchPrimaryTenantId(supabase)) ?? undefined
  return cachedVideoTenantId
}

async function enrichVideoPostBody(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const tenantId = await videoTenantIdForApi()
  return tenantId ? { ...body, tenantId } : body
}

const VIDEO_FETCH_TIMEOUT_MS = 45_000
/**
 * Seedance 发起：服务端会依次试多个模型（额度/参数失败换模），双参考图更大。
 * 浏览器 45s 会误报「接口不可达」；须对齐 cs/轻量 Nginx proxy_read_timeout（约 300s）。
 */
const VIDEO_SEEDANCE_START_TIMEOUT_MS = 240_000
/** 分镜策划：服务端单次请求含多轮 AI 重试，须 ≥ 轻量 Nginx proxy_read_timeout（180s） */
const VIDEO_LONGFORM_PLAN_TIMEOUT_MS = 180_000
/** 经服务端代理拉取火山/千问 CDN 成片；须 ≥ 轻量 Nginx proxy_read_timeout（180s） */
const VIDEO_SEGMENT_DOWNLOAD_TIMEOUT_MS = 180_000
const VIDEO_LAST_FRAME_TIMEOUT_MS = 180_000
const VIDEO_CONCAT_TIMEOUT_MS = 600_000
const VIDEO_CONFIG_TIMEOUT_MS = 25_000

function formatVideoFetchNetworkErr(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (/abort|timeout|timed out/i.test(raw)) {
    return `请求超时（多模型换模/大图上传可能需 1–3 分钟，请稍后重试）`
  }
  return raw.trim() || '网络请求失败'
}

function videoFetchSignal(ms: number): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(ms)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

async function readFetchBodyWithTimeout(res: Response, timeoutMs: number): Promise<ArrayBuffer> {
  return Promise.race([
    res.arrayBuffer(),
    new Promise<ArrayBuffer>((_, reject) => {
      setTimeout(
        () => reject(new Error(`下载响应体超时（${Math.round(timeoutMs / 1000)} 秒）`)),
        timeoutMs,
      )
    }),
  ])
}

/** 视频生成优先 erp-api 单跳；`includeApiFallback` 时在 erp-api 全失败后补试同源 /api */
function videoApiFetchUrls(pathWithQuery: string, includeApiFallback = false): string[] {
  const all = merchantApiFetchUrls(pathWithQuery)
  const erpOnly = all.filter((u) => /\/erp-api\//i.test(u))
  if (!erpOnly.length) return all
  if (!includeApiFallback) return erpOnly
  const apiFallback = all.filter((u) => !erpOnly.includes(u))
  return [...erpOnly, ...apiFallback]
}

async function fetchVideoGet(pathWithQuery: string): Promise<Response | null> {
  const headers = await videoAuthHeaders()
  for (const url of videoApiFetchUrls(pathWithQuery)) {
    try {
      const res = await fetch(url, { headers, signal: videoFetchSignal(VIDEO_FETCH_TIMEOUT_MS) })
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
  out?: { lastNetworkErr?: string },
): Promise<Response | null> {
  const bodyStr = JSON.stringify(await enrichVideoPostBody(body))
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...(await videoAuthHeaders()),
  }
  for (const url of merchantBinaryApiFetchUrls(path)) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
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
      const buf = await readFetchBodyWithTimeout(res, timeoutMs)
      if (responseLooksLikeHtml(new TextDecoder().decode(buf.slice(0, 256)), ct)) continue
      return new Response(buf, {
        status: res.status,
        statusText: res.statusText,
        headers: { 'Content-Type': ct || 'video/mp4' },
      })
    } catch (e) {
      if (out) out.lastNetworkErr = formatVideoFetchNetworkErr(e)
      /* try next candidate */
    }
  }
  return null
}

async function fetchVideoPostOnUrls(
  urls: readonly string[],
  bodyStr: string,
  timeoutMs: number,
  extraHeaders?: Record<string, string>,
  out?: { lastNetworkErr?: string },
): Promise<Response | null> {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...(extraHeaders ?? {}),
  }
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyStr,
        signal: videoFetchSignal(timeoutMs),
      })
      const text = await res.text()
      const ct = res.headers.get('content-type') ?? ''
      if (res.status === 404) continue
      if (isLikelyVercelApiRouteMiss(text, ct, res.status)) continue
      if (res.ok && responseLooksLikeHtml(text, ct)) continue
      return new Response(text, {
        status: res.status,
        statusText: res.statusText,
        headers: { 'Content-Type': ct || 'application/json; charset=utf-8' },
      })
    } catch (e) {
      if (out) out.lastNetworkErr = formatVideoFetchNetworkErr(e)
      /* try next candidate */
    }
  }
  return null
}

async function fetchVideoPost(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = VIDEO_FETCH_TIMEOUT_MS,
  out?: { lastNetworkErr?: string },
): Promise<Response | null> {
  const bodyStr = JSON.stringify(await enrichVideoPostBody(body))
  const authHdr = await videoAuthHeaders()
  const primary = videoApiFetchUrls(path, false)
  const first = await fetchVideoPostOnUrls(primary, bodyStr, timeoutMs, authHdr, out)
  if (first) return first
  const fallback = videoApiFetchUrls(path, true).filter((u) => !primary.includes(u))
  if (fallback.length === 0) return null
  return fetchVideoPostOnUrls(fallback, bodyStr, timeoutMs, authHdr, out)
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
  /** 兜底段数；与 targetTotalSec 同时传时以 AI 按总时长自动规划为准 */
  segmentCount?: number
  /** 目标成片总时长（秒）；传入后由 AI 自行决定 2～12 段 */
  targetTotalSec?: number
  segmentSec?: number
  mode: LongformPlanMode
  negativeHint?: string
  /** 为 true 时禁止本地结构化/script 直出，必须走 AI 模型阅读后规划 */
  forceAiPlanner?: boolean
  /** draft=模型1规划；review=模型2/3检查补全 */
  planStage?: 'draft' | 'review'
  reviewPass?: 1 | 2
  draftSegments?: Array<{
    timeRange?: string
    visual?: string
    dialogue?: string
  }>
  validationIssues?: string[]
  scriptSegments?: Array<{
    timeRange?: string
    visual?: string
    dialogue?: string
    prompt?: string
    action?: string
  }>
}): Promise<
  | {
      ok: true
      prompts: string[]
      narrationScript?: string
      scriptSegments?: Array<{
        timeRange?: string
        visual?: string
        dialogue?: string
      }>
      usedRuleBasedFallback?: boolean
      usedAiPlanner?: boolean
      plannerVendor?: string
      plannerModelId?: string
      validationOk?: boolean
      validationIssues?: string[]
      rowsFullyFilled?: boolean
      planStage?: string
      reviewPass?: number
    }
  | { ok: false; message: string }
> {
  const paths = [
    '/api/meoo-merchant-ai-video-longform-plan',
    '/api/merchant/ai/video/longform/plan',
  ] as const
  const networkOut: { lastNetworkErr?: string } = {}
  for (const p of paths) {
    const res = await fetchVideoPost(
      p,
      buildVideoPostBody({ ...body }),
      VIDEO_LONGFORM_PLAN_TIMEOUT_MS,
      networkOut,
    )
    if (!res) continue
    const j = (await parseJsonSafe<Record<string, unknown>>(res)) ?? {}
    if (!res.ok || !j.ok) {
      const msg =
        typeof j.message === 'string' ? j.message : `长片策划失败 HTTP ${res.status}`
      return { ok: false, message: msg }
    }
    const raw = j.prompts
    const scriptSegments = Array.isArray(j.scriptSegments)
      ? (j.scriptSegments as Array<Record<string, unknown>>).map((row) => {
          const prompt = typeof row.prompt === 'string' ? row.prompt.trim() : ''
          const action = typeof row.action === 'string' ? row.action.trim() : ''
          const visualRaw = typeof row.visual === 'string' ? row.visual.trim() : ''
          const visual = visualRaw || [prompt, action].filter(Boolean).join('；')
          const dialogueRaw = typeof row.dialogue === 'string' ? row.dialogue.trim() : ''
          const dialogue =
            dialogueRaw ||
            (typeof row.narration === 'string' ? row.narration.trim() : '') ||
            (typeof row.voiceover === 'string' ? row.voiceover.trim() : '')
          return {
            timeRange: typeof row.timeRange === 'string' ? row.timeRange : undefined,
            visual: visual || undefined,
            dialogue: dialogue || undefined,
          }
        })
      : undefined
    const prompts = Array.isArray(raw)
      ? raw.map((x) => String(x).trim()).filter(Boolean)
      : []
    if (prompts.length === 0 && (!scriptSegments || scriptSegments.length < 2)) {
      return { ok: false, message: '分段提示词为空' }
    }
    if (!Array.isArray(raw) && (!scriptSegments || scriptSegments.length < 2)) {
      return { ok: false, message: '服务端未返回 prompts' }
    }
    return {
      ok: true,
      prompts,
      narrationScript:
        typeof j.narrationScript === 'string' && j.narrationScript.trim()
          ? j.narrationScript.trim()
          : undefined,
      scriptSegments,
      usedRuleBasedFallback: j.usedRuleBasedFallback === true,
      usedAiPlanner: j.usedAiPlanner === true,
      plannerVendor:
        typeof j.plannerVendor === 'string' && j.plannerVendor.trim()
          ? j.plannerVendor.trim()
          : undefined,
      plannerModelId:
        typeof j.plannerModelId === 'string' && j.plannerModelId.trim()
          ? j.plannerModelId.trim()
          : undefined,
      validationOk: j.validationOk === true,
      validationIssues: Array.isArray(j.validationIssues)
        ? (j.validationIssues as unknown[]).map((x) => String(x))
        : undefined,
      rowsFullyFilled: j.rowsFullyFilled === true,
      planStage:
        typeof j.planStage === 'string' && j.planStage.trim() ? j.planStage.trim() : undefined,
      reviewPass: typeof j.reviewPass === 'number' ? j.reviewPass : undefined,
    }
  }
  if (networkOut.lastNetworkErr) {
    return {
      ok: false,
      message: `分镜策划请求失败：${networkOut.lastNetworkErr}（AI 规划约需 30–90 秒，请稍后重试）`,
    }
  }
  return { ok: false, message: '长片策划失败：视频 AI 接口未部署或不可达' }
}

export async function postShortVideoNarrationExtract(body: {
  overallPrompt: string
  plannerModel?: 'doubao' | 'qwen' | 'auto'
}): Promise<{ ok: true; narrationScript: string } | { ok: false; message: string }> {
  const paths = [
    '/api/meoo-merchant-ai-video-narration-extract',
    '/api/merchant/ai/video/narration/extract',
  ] as const
  for (const p of paths) {
    const res = await fetchVideoPost(p, buildVideoPostBody({ ...body }))
    if (!res) continue
    const j = (await parseJsonSafe<Record<string, unknown>>(res)) ?? {}
    if (!res.ok || !j.ok) {
      const msg =
        typeof j.message === 'string' ? j.message : `口播提取失败 HTTP ${res.status}`
      return { ok: false, message: msg }
    }
    const script = typeof j.narrationScript === 'string' ? j.narrationScript.trim() : ''
    if (!script) return { ok: false, message: '服务端未返回口播稿' }
    return { ok: true, narrationScript: script }
  }
  return { ok: false, message: '口播提取失败：视频 AI 接口未部署或不可达' }
}

/** 服务端 ffmpeg 拼接多段远程 MP4（浏览器 wasm 失败时兜底） */
export async function concatVideoUrlsOnServer(
  urls: string[],
  opts?: { ratio?: string; fps?: number | string },
): Promise<Blob> {
  const paths = [
    '/api/meoo-merchant-ai-video-concat-urls',
    '/api/merchant/ai/video/concat-urls',
  ] as const
  const body: Record<string, unknown> = { urls }
  if (opts?.ratio) body.ratio = opts.ratio
  if (opts?.fps != null) body.fps = opts.fps
  for (const p of paths) {
    const res = await fetchVideoPostBinary(p, body, VIDEO_CONCAT_TIMEOUT_MS)
    if (!res) continue
    if (!res.ok) {
      const j = await parseJsonSafe<{ message?: string }>(new Response(await res.text()))
      throw new Error(j?.message || `云端拼接失败 HTTP ${res.status}`)
    }
    const blob = new Blob([await readFetchBodyWithTimeout(res, VIDEO_CONCAT_TIMEOUT_MS)])
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
export async function concatVideoBlobsOnServer(
  blobs: Blob[],
  opts?: { ratio?: string; fps?: number | string },
): Promise<Blob> {
  const segments = await Promise.all(blobs.map((b) => blobToBase64(b)))
  const paths = [
    '/api/meoo-merchant-ai-video-concat-blobs',
    '/api/merchant/ai/video/concat-blobs',
  ] as const
  const body: Record<string, unknown> = { segments }
  if (opts?.ratio) body.ratio = opts.ratio
  if (opts?.fps != null) body.fps = opts.fps
  for (const p of paths) {
    const res = await fetchVideoPostBinary(p, body, 300_000)
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

/** 服务端 ffmpeg 烧录字幕 / 叠加产品图 */
export async function postProcessVideoOnServer(
  videoBlob: Blob,
  opts: {
    srtContent?: string
    subtitleStyle?: string
    productImageBase64?: string
    productStartSec?: number
    productEndSec?: number
    subtleMotion?: boolean
    gesturePreset?: string
    motionTimeline?: Array<{ startSec: number; endSec: number; gesturePreset: string }>
    hookTitle?: string
    bgmUrl?: string
    bgmVolume?: number
    minDurationSec?: number
  },
): Promise<Blob> {
  const paths = [
    '/api/meoo-merchant-ai-video-post-process',
    '/api/merchant/ai/video/post-process',
  ] as const
  const body: Record<string, unknown> = {
    videoBase64: await blobToBase64(videoBlob),
  }
  if (opts.srtContent?.trim()) body.srtContent = opts.srtContent
  if (opts.subtitleStyle?.trim()) body.subtitleStyle = opts.subtitleStyle
  if (opts.productImageBase64?.trim()) body.productImageBase64 = opts.productImageBase64
  if (typeof opts.productStartSec === 'number' && opts.productStartSec >= 0) {
    body.productStartSec = opts.productStartSec
  }
  if (typeof opts.productEndSec === 'number' && opts.productEndSec > 0) {
    body.productEndSec = opts.productEndSec
  }
  if (opts.subtleMotion) body.subtleMotion = '1'
  if (opts.gesturePreset?.trim()) body.gesturePreset = opts.gesturePreset.trim()
  if (opts.motionTimeline?.length) body.motionTimeline = opts.motionTimeline
  if (opts.hookTitle?.trim()) body.hookTitle = opts.hookTitle.trim()
  if (opts.bgmUrl?.trim()) {
    body.bgmUrl = opts.bgmUrl.trim()
    if (typeof opts.bgmVolume === 'number') body.bgmVolume = opts.bgmVolume
  }
  if (typeof opts.minDurationSec === 'number' && opts.minDurationSec > 0) {
    body.minDurationSec = opts.minDurationSec
  }
  for (const p of paths) {
    const res = await fetchVideoPostBinary(p, body, 300_000)
    if (!res) continue
    if (!res.ok) {
      const j = await parseJsonSafe<{ message?: string }>(new Response(await res.text()))
      throw new Error(j?.message || `云端成片后处理失败 HTTP ${res.status}`)
    }
    const out = await res.blob()
    if (out.size < 1024) throw new Error('云端成片后处理返回空文件')
    return out
  }
  throw new Error('云端成片后处理失败：视频 AI 接口未部署或不可达')
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
      signal: videoFetchSignal(VIDEO_SEGMENT_DOWNLOAD_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const blob = new Blob([await readFetchBodyWithTimeout(res, VIDEO_SEGMENT_DOWNLOAD_TIMEOUT_MS)])
    return blob.size >= 1024 ? blob : null
  } catch {
    return null
  }
}

/** 经网关二进制代理拉取成片（直连 handler 写 Buffer，避免 node-mocks-http 0 字节） */
async function downloadVideoUrlAsBlobOnce(url: string): Promise<Blob> {
  const direct = await tryDirectVideoBlob(url)
  if (direct) return direct

  const paths = [
    '/api/meoo-merchant-ai-video-download-url',
    '/api/merchant/ai/video/download-url',
  ] as const
  let lastErr = '视频 AI 接口未部署或不可达'
  const fetchOut = { lastNetworkErr: '' }
  for (const p of paths) {
    const res = await fetchVideoPostBinary(p, { url }, VIDEO_SEGMENT_DOWNLOAD_TIMEOUT_MS, fetchOut)
    if (!res) {
      if (fetchOut.lastNetworkErr?.trim()) lastErr = fetchOut.lastNetworkErr.trim()
      continue
    }
    if (!res.ok) {
      const j = await parseJsonSafe<{ message?: string }>(new Response(await res.text()))
      lastErr = j?.message || `下载视频失败 HTTP ${res.status}`
      continue
    }
    const blob = new Blob([await readFetchBodyWithTimeout(res, VIDEO_SEGMENT_DOWNLOAD_TIMEOUT_MS)])
    if (blob.size < 1024) {
      lastErr = `下载视频为空（${blob.size} 字节），或与后端连接异常，请稍后重试`
      continue
    }
    return blob
  }
  throw new Error(lastErr)
}

export async function downloadVideoUrlAsBlob(
  url: string,
  opts?: { maxAttempts?: number; onRetry?: (attempt: number, maxAttempts: number, message: string) => void },
): Promise<Blob> {
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 5)
  let lastErr = '下载失败'
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await downloadVideoUrlAsBlobOnce(url)
    } catch (e) {
      lastErr = e instanceof Error ? e.message : '下载失败'
      if (attempt >= maxAttempts) break
      opts?.onRetry?.(attempt + 1, maxAttempts, lastErr)
      await new Promise((r) => setTimeout(r, 1800 * attempt))
    }
  }
  throw new Error(`下载视频失败（已重试 ${maxAttempts} 次）：${lastErr}`)
}

/** 服务端 ffmpeg 截取远程视频采样帧（opening/last/atSec） */
export async function postVideoLastFrameFromUrl(
  url: string,
  opts?: { onProgress?: (msg: string) => void; frame?: 'opening' | 'last'; atSec?: number },
): Promise<{ ok: true; pureBase64: string } | { ok: false; message: string }> {
  const trimmed = url.trim()
  if (!trimmed) return { ok: false, message: '缺少视频 URL' }
  const paths = [
    '/api/meoo-merchant-ai-video-last-frame',
    '/api/merchant/ai/video/last-frame',
  ] as const
  const atSec = opts?.atSec != null && Number.isFinite(Number(opts.atSec)) ? Number(opts.atSec) : undefined
  const frame = atSec != null ? undefined : opts?.frame === 'opening' ? 'opening' : 'last'
  let lastErr = '尾帧截取接口未部署或不可达'
  for (const p of paths) {
    opts?.onProgress?.(
      atSec != null
        ? `服务端截取素材 ${atSec.toFixed(1)}s 帧…`
        : frame === 'opening'
        ? '服务端截取素材首帧…'
        : '服务端截取上一段尾帧…',
    )
    const body: Record<string, unknown> = { url: trimmed }
    if (atSec != null) body.atSec = atSec
    else body.frame = frame
    const res = await fetchVideoPost(p, body, VIDEO_LAST_FRAME_TIMEOUT_MS)
    if (!res) continue
    const j = (await parseJsonSafe<Record<string, unknown>>(res)) ?? {}
    if (!res.ok || !j.ok) {
      lastErr =
        typeof j.message === 'string' ? j.message : `截取尾帧失败 HTTP ${res.status}`
      continue
    }
    const b64 = typeof j.imageBase64 === 'string' ? j.imageBase64.trim() : ''
    if (b64.length < 64) return { ok: false, message: '服务端返回空尾帧' }
    return { ok: true, pureBase64: b64.replace(/\s/g, '') }
  }
  return { ok: false, message: lastErr }
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

function videoStartFailurePrefix(preferQwen: boolean): string {
  return preferQwen ? '千问视频发起失败' : 'Seedance/方舟发起失败'
}

async function postSeedanceVideoStartOnce(
  body: Record<string, unknown>,
  preferQwen: boolean,
): Promise<
  | { ok: true; taskId: string; modelUsed?: string | null; provider?: string }
  | { ok: false; message: string; unreachable?: boolean }
> {
  const prefix = videoStartFailurePrefix(preferQwen)
  const paths = [
    '/api/meoo-merchant-ai-video-seedance-start',
    '/api/merchant/ai/video/seedance/start',
  ] as const
  const netOut: { lastNetworkErr?: string } = {}
  for (const p of paths) {
    const res = await fetchVideoPost(p, body, VIDEO_SEEDANCE_START_TIMEOUT_MS, netOut)
    if (!res) continue
    const j = (await parseJsonSafe<Record<string, unknown>>(res)) ?? {}
    if (!res.ok || !j.ok) {
      const msg =
        typeof j.message === 'string' ? j.message : `${prefix} HTTP ${res.status}`
      return { ok: false, message: msg }
    }
    const tid = typeof j.taskId === 'string' ? j.taskId : ''
    if (!tid) return { ok: false, message: '服务端未返回 task id' }
    const modelUsed = typeof j.modelUsed === 'string' ? j.modelUsed : null
    const provider = typeof j.provider === 'string' ? j.provider : undefined
    return { ok: true, taskId: tid, modelUsed, provider }
  }
  const netHint = netOut.lastNetworkErr ? ` 网络细节：${netOut.lastNetworkErr}` : ''
  return {
    ok: false,
    unreachable: true,
    message: `${prefix} 接口不可达（已尝试 erp-api 与 /api 路径）。${netHint}若上传了产品图/分镜参考，请缩小图片或刷新后重试；仍失败请联系管理员确认 cs /erp-api 已部署。`,
  }
}

export async function postSeedanceVideoStart(body: ShortVideoGenRequestBody & {
  /** wan2.2-s2v 口型驱动 */
  pipeline?: 'wan_s2v'
  image_base64?: string
  audio_base64?: string
  resolution?: '480P' | '720P'
}): Promise<
  { ok: true; taskId: string; modelUsed?: string | null; provider?: string }
  | { ok: false; message: string }
> {
  const skipQwen = body.skip_qwen === true
  const preferQwen =
    !skipQwen && String(body.prefer_provider ?? '').trim().toLowerCase() === 'qwen'
  const first = await postSeedanceVideoStartOnce(body, preferQwen)
  if (first.ok) return first

  /** 方舟/路由不可达时自动改走千问（数字人口播 skip_qwen 时禁止） */
  if (
    !skipQwen &&
    !preferQwen &&
    (first.unreachable || isVideoApiUnreachableError(first.message) || isArkQuotaHopableError(first.message))
  ) {
    const qwenBody = { ...body, prefer_provider: 'qwen' as const }
    const second = await postSeedanceVideoStartOnce(qwenBody, true)
    if (second.ok) return second
    if (isVideoModelHopableError(first.message) && !isVideoInputValidationError(second.message)) {
      return { ok: false, message: second.message }
    }
  }

  return { ok: false, message: first.message }
}

/** 额度/限流时按运营台模型池逐个切换，最后走服务端 __server_auto__ 轮询（含千问） */
export async function postSeedanceVideoStartWithFailover(body: ShortVideoGenRequestBody & {
  /** 运营台配置的全部视频模型 ID */
  poolModels?: string[]
}): Promise<
  { ok: true; taskId: string; modelUsed?: string | null; provider?: string }
  | { ok: false; message: string }
> {
  const hasImages = Array.isArray(body.images_base64) && body.images_base64.some((x) => String(x).trim())
  const durationSec = parseVideoDurationFromFlags(body.flags)
  const i2vMaxImages = parseI2vMaxImagesFromBody(body)
  const apiBody = {
    ...body,
    images_base64: clampI2vImagesForApi(body.images_base64, i2vMaxImages),
  }
  const tryPlan = buildVideoDurationMatchedTryPlan({
    durationSec,
    hasImages,
    poolModels: body.poolModels ?? [],
    preferred: body.model?.trim() || SEEDANCE_SERVER_AUTO,
    preferQuotaStable: body.prefer_quota_stable === true,
    skipQwen: body.skip_qwen === true,
  })

  if (tryPlan.length === 0) {
    return {
      ok: false,
      message: `当前没有支持 ${durationSec} 秒时长的视频模型，请改选 5 秒或联系管理员配置 Seedance 1.5 / 千问 wan2.6+ 模型。`,
    }
  }

  let lastMsg = '视频生成失败'
  const tried: string[] = []
  for (const step of tryPlan) {
    const r = await postSeedanceVideoStart({
      ...apiBody,
      model: step.model,
      prefer_provider: step.preferProvider,
    })
    if (r.ok) {
      if (tried.length > 0) {
        return {
          ...r,
          modelUsed: r.modelUsed ?? (step.model === SEEDANCE_SERVER_AUTO ? null : step.model),
        }
      }
      return r
    }
    lastMsg = r.message
    tried.push(step.label)
    if (!isVideoModelHopableError(r.message)) {
      return { ok: false, message: formatVideoAiUserError(r.message) }
    }
  }

  const summary =
    tried.length > 1
      ? `${formatVideoAiUserError(lastMsg)}（已按 ${durationSec} 秒依次尝试 ${tried.length} 路：${tried.join(' → ')}）`
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

const DEFAULT_POLL_MS = 5000

/** 按视频时长估算轮询上限（5 秒片约 8 分钟，10 秒片约 15 分钟） */
export function pollMaxTriesForVideoDuration(durationSec: number, pollIntervalMs = DEFAULT_POLL_MS): number {
  const sec = Math.max(3, Math.round(durationSec))
  const maxWaitMs = sec <= 5 ? 8 * 60_000 : 15 * 60_000
  return Math.max(24, Math.ceil(maxWaitMs / Math.max(1000, pollIntervalMs)))
}

/** 轮询短视频任务直至成功/失败/取消（无 React 状态副作用） */
export async function pollShortVideoTask(
  taskId: string,
  opts?: {
    pollIntervalMs?: number
    pollMaxTries?: number
    durationSec?: number
    shouldCancel?: () => boolean
    onProgress?: (statusLabel: string) => void
  },
): Promise<
  | { ok: true; videoUrl: string }
  | { ok: false; message: string; hopable: boolean }
> {
  const pollMs = opts?.pollIntervalMs ?? DEFAULT_POLL_MS
  const dur = Math.max(3, Math.round(opts?.durationSec ?? 5))
  const maxTries = opts?.pollMaxTries ?? pollMaxTriesForVideoDuration(dur, pollMs)
  let tries = 0
  let lastFail = '生成失败，请稍后重试。'
  const startedAt = Date.now()
  let queuedSince: number | null = null
  let runningSince: number | null = null
  let finalizeSince: number | null = null
  const queuedStallMs = 3 * 60_000
  const runningStallMs = dur <= 5 ? 10 * 60_000 : 18 * 60_000
  const finalizeStallMs = 2 * 60_000

  opts?.onProgress?.('已提交，等待云端生成…')

  while (tries++ < maxTries) {
    if (opts?.shouldCancel?.()) {
      return { ok: false, message: '已取消等待', hopable: false }
    }
    await new Promise((r) => setTimeout(r, pollMs))

    const st = await fetchSeedanceVideoStatus(taskId)
    if (!st.ok) {
      return {
        ok: false,
        message: st.message,
        hopable: isVideoModelHopableError(st.message),
      }
    }
    const elapsedMin = Math.max(1, Math.round((Date.now() - startedAt) / 60_000))
    const statusUpper = String(st.statusLabel || st.phase || '').toUpperCase()
    const awaitingVideoUrl =
      !st.videoUrl &&
      (statusUpper === 'SUCCEEDED' ||
        statusUpper.includes('收尾') ||
        statusUpper.includes('等待视频地址'))
    if (awaitingVideoUrl) {
      if (finalizeSince === null) finalizeSince = Date.now()
      else if (Date.now() - finalizeSince >= finalizeStallMs) {
        return {
          ok: false,
          message: '任务已成功但未返回视频地址，将切换其它模型重试…',
          hopable: true,
        }
      }
      opts?.onProgress?.(`收尾中（等待视频地址）（已等待约 ${elapsedMin} 分钟）`)
    } else {
      finalizeSince = null
      opts?.onProgress?.(`${st.statusLabel || st.phase}（已等待约 ${elapsedMin} 分钟）`)
    }
    if (st.phase === 'succeeded' && st.videoUrl) {
      return { ok: true, videoUrl: st.videoUrl }
    }
    if (st.phase === 'failed') {
      lastFail = st.failReason ?? lastFail
      return {
        ok: false,
        message: lastFail,
        hopable: isVideoModelHopableError(lastFail),
      }
    }
    if (st.phase === 'queued') {
      if (queuedSince === null) queuedSince = Date.now()
      else if (Date.now() - queuedSince >= queuedStallMs) {
        return {
          ok: false,
          message: '任务长时间排队未开始，可能当前模型额度已满，将切换其它模型重试…',
          hopable: true,
        }
      }
      runningSince = null
    } else if (st.phase === 'running') {
      queuedSince = null
      if (runningSince === null) runningSince = Date.now()
      else if (Date.now() - runningSince >= runningStallMs) {
        return {
          ok: false,
          message: `生成超过 ${Math.round(runningStallMs / 60_000)} 分钟仍无结果，将切换其它模型重试…`,
          hopable: true,
        }
      }
    } else {
      queuedSince = null
      runningSince = null
    }
  }

  return {
    ok: false,
    message: '等待超时，可能当前模型额度不足或队列拥堵，将切换其它模型重试…',
    hopable: true,
  }
}

/**
 * 短视频生成：发起 + 轮询，额度/时长/限流时自动切换模型重试（与数字人口播一致）。
 * `allowAutoHalveDuration`：10 秒全部失败时自动改 5 秒（长视频多段请关闭，由页面加倍段数）。
 */
export async function runShortVideoJobWithFailover(opts: {
  engine: 'qwen' | 'seedance'
  body: ShortVideoGenRequestBody
  poolModels?: string[]
  maxAttempts?: number
  pollIntervalMs?: number
  pollMaxTries?: number
  shouldCancel?: () => boolean
  onProgress?: (text: string) => void
  allowAutoHalveDuration?: boolean
}): Promise<
  | {
      ok: true
      videoUrl: string
      modelUsed?: string | null
      engineUsed: 'qwen' | 'seedance'
      durationSecUsed?: number
    }
  | ShortVideoJobFail
> {
  const durationSec = parseVideoDurationFromFlags(opts.body.flags)
  const body =
    opts.engine === 'seedance'
      ? { ...opts.body, skip_qwen: true }
      : opts.body
  const first = await runShortVideoJobWithDurationInternal({ ...opts, body }, durationSec)
  if (first.ok) return { ...first, durationSecUsed: durationSec }

  const allowHalve = opts.allowAutoHalveDuration !== false
  if (
    allowHalve &&
    shouldFallbackVideoDurationToFiveSec(first.message, durationSec, {
      exhaustedAtDuration: first.exhaustedAtDuration,
      triedCount: first.triedCount,
    })
  ) {
    const flags5 = replaceVideoDurationInFlags(body.flags ?? '', 5)
    opts.onProgress?.('10秒模型额度已满，自动切换为5秒视频模型…')
    const second = await runShortVideoJobWithDurationInternal(
      { ...opts, body: { ...body, flags: flags5 } },
      5,
    )
    if (second.ok) return { ...second, durationSecUsed: 5 }
    return second
  }

  return first
}

async function runShortVideoJobWithDurationInternal(
  opts: {
    engine: 'qwen' | 'seedance'
    body: ShortVideoGenRequestBody
    poolModels?: string[]
    pollIntervalMs?: number
    pollMaxTries?: number
    shouldCancel?: () => boolean
    onProgress?: (text: string) => void
  },
  durationSec: number,
): Promise<
  | { ok: true; videoUrl: string; modelUsed?: string | null; engineUsed: 'qwen' | 'seedance' }
  | ShortVideoJobFail
> {
  const hasImages =
    Array.isArray(opts.body.images_base64) && opts.body.images_base64.some((x) => String(x).trim())
  const promptWithAspect = appendAspectToVideoPrompt(opts.body.prompt ?? '', opts.body.flags)
  const i2vMaxImages = parseI2vMaxImagesFromBody(opts.body)
  const apiBody = {
    ...opts.body,
    prompt: promptWithAspect,
    model: SEEDANCE_SERVER_AUTO,
    images_base64: clampI2vImagesForApi(opts.body.images_base64, i2vMaxImages),
  }
  const tryPlan = buildVideoDurationMatchedTryPlan({
    durationSec,
    hasImages,
    poolModels: opts.poolModels ?? [],
    preferred: SEEDANCE_SERVER_AUTO,
    preferQuotaStable: opts.body.prefer_quota_stable === true,
    skipQwen: opts.body.skip_qwen === true || opts.engine === 'seedance',
  })
  if (opts.engine === 'qwen' && !opts.body.skip_qwen) {
    const qwenFirst = [
      ...tryPlan.filter((s) => s.preferProvider === 'qwen'),
      ...tryPlan.filter((s) => s.preferProvider !== 'qwen'),
    ]
    tryPlan.splice(0, tryPlan.length, ...qwenFirst)
  } else if (opts.engine === 'seedance' || opts.body.skip_qwen === true) {
    const arkOnly = tryPlan.filter((s) => s.preferProvider !== 'qwen')
    tryPlan.splice(0, tryPlan.length, ...arkOnly)
  } else {
    const arkFirst = [
      ...tryPlan.filter((s) => s.preferProvider !== 'qwen'),
      ...tryPlan.filter((s) => s.preferProvider === 'qwen'),
    ]
    tryPlan.splice(0, tryPlan.length, ...arkFirst)
  }

  if (tryPlan.length === 0) {
    return {
      ok: false,
      message: formatVideoAiUserError(
        `没有支持 ${durationSec} 秒的视频模型，请改选 5 秒或联系管理员配置 Seedance 1.5 / 千问 wan2.6+。`,
      ),
    }
  }

  const plan = tryPlan
  let lastMsg = '视频生成失败'
  const tried: string[] = []

  for (let i = 0; i < plan.length; i++) {
    if (opts.shouldCancel?.()) {
      return { ok: false, message: '已取消' }
    }

    const step = plan[i]!
    opts.onProgress?.(
      i === 0
        ? `正在按 ${durationSec} 秒提交视频（共 ${plan.length} 路候选，额度或时长不符将自动切换）…`
        : `时长/额度受限，切换模型重试 ${i + 1}/${plan.length}：${step.label}…`,
    )

    const start = await postSeedanceVideoStart({
      ...apiBody,
      model: step.model,
      prefer_provider: step.preferProvider,
    })
    if (!start.ok) {
      lastMsg = start.message
      tried.push(step.label)
      if (isVideoInputValidationError(start.message)) {
        return { ok: false, message: formatVideoAiUserError(start.message) }
      }
      if (!isVideoModelHopableError(start.message)) {
        return { ok: false, message: formatVideoAiUserError(lastMsg) }
      }
      continue
    }

    const poll = await pollShortVideoTask(start.taskId, {
      pollIntervalMs: opts.pollIntervalMs,
      pollMaxTries: opts.pollMaxTries ?? pollMaxTriesForVideoDuration(durationSec, opts.pollIntervalMs),
      durationSec,
      shouldCancel: opts.shouldCancel,
      onProgress: opts.onProgress,
    })
    if (poll.ok) {
      const engineUsed: 'qwen' | 'seedance' =
        step.preferProvider === 'qwen' || start.provider === 'qwen' ? 'qwen' : 'seedance'
      const modelId = String(start.modelUsed || step.model || '')
      const looksQwenWan =
        engineUsed === 'qwen' ||
        step.preferProvider === 'qwen' ||
        /^wan[\d._-]/i.test(modelId) ||
        /wan2\.\d/i.test(modelId)
      if ((opts.engine === 'seedance' || opts.body.skip_qwen === true) && looksQwenWan) {
        lastMsg = 'Seedance 通道不可用，未回退到千问 wan 模型。请稍后重试或检查运营台方舟视频端点。'
        tried.push(step.label)
        continue
      }
      return {
        ok: true,
        videoUrl: poll.videoUrl,
        modelUsed: start.modelUsed,
        engineUsed,
      }
    }

    lastMsg = poll.message
    tried.push(step.label)
    if (isVideoInputValidationError(poll.message)) {
      return { ok: false, message: formatVideoAiUserError(poll.message) }
    }
    if (!poll.hopable && !isVideoModelHopableError(poll.message)) {
      return { ok: false, message: formatVideoAiUserError(lastMsg) }
    }
  }

  const summary =
    tried.length > 1
      ? `${formatVideoAiUserError(lastMsg)}（已按 ${durationSec} 秒尝试 ${tried.length} 路：${tried.join(' → ')}）`
      : formatVideoAiUserError(lastMsg)
  return {
    ok: false,
    message: summary,
    exhaustedAtDuration: durationSec,
    triedCount: tried.length,
  }
}
