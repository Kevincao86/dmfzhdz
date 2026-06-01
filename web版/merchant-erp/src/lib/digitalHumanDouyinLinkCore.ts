/** 抖音链接解析 → 提取口播文案 + 动作指令（服务端 / dev 中间件共用） */

import { runMeooAiChatCore } from '../../vite-plugins/aiGateway/meooAiChatCore.js'

export type DouyinLinkParseInput = {
  url: string
  tenantId?: string
}

export type DouyinLinkParseResult =
  | {
      ok: true
      normalizedUrl: string
      videoId: string | null
      sourceTitle: string | null
      script: string
      motionInstructions: string
      /** page=发布文案；asr=视频音频识别；ai_extract=AI 还原 */
      scriptSource: 'page' | 'asr' | 'ai_extract'
    }
  | { ok: false; message: string }

const DOUYIN_HOST =
  /(?:^|\.)?(?:douyin\.com|iesdouyin\.com|v\.douyin\.com)(?:\/|$)/i

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

export function isDouyinShareUrl(raw: string): boolean {
  const t = raw.trim()
  if (!t) return false
  try {
    const u = new URL(t.startsWith('http') ? t : `https://${t}`)
    return DOUYIN_HOST.test(u.hostname)
  } catch {
    return /douyin\.com|v\.douyin/i.test(t)
  }
}

export function normalizeDouyinShareUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(t.startsWith('http') ? t : `https://${t}`)
    if (!DOUYIN_HOST.test(u.hostname)) return null
    u.hash = ''
    return u.toString()
  } catch {
    return isDouyinShareUrl(t) ? t : null
  }
}

/** 从抖音分享口令中提取 https 链接（用户常粘贴整段文案而非纯 URL） */
export function extractDouyinUrlFromText(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null

  const urlMatch = t.match(
    /https?:\/\/(?:v\.douyin\.com\/[A-Za-z0-9_-]+\/?|(?:www\.)?(?:douyin|iesdouyin)\.com\/[^\s\u4e00-\u9fff「」【】]+)/i,
  )
  if (urlMatch?.[0]) {
    let u = urlMatch[0].replace(/[/，。！？、；：'"）】\]>]+$/u, '')
    if (/v\.douyin\.com/i.test(u) && !u.endsWith('/')) u += '/'
    return u
  }

  return normalizeDouyinShareUrl(t)
}

export function extractDouyinVideoId(url: string): string | null {
  const m =
    /\/video\/(\d+)/.exec(url) ??
    /[?&]modal_id=(\d+)/.exec(url) ??
    /[?&]item_id=(\d+)/.exec(url) ??
    /\/share\/video\/(\d+)/.exec(url)
  return m?.[1] ?? null
}

/** iesdouyin 分享页 SSR 含 videoInfoRes，比 douyin.com 反爬页更易解析 */
function preferIesdouyinShareFetchUrl(url: string, videoId: string | null): string {
  if (videoId) return `https://www.iesdouyin.com/share/video/${videoId}/`
  if (/iesdouyin\.com/i.test(url)) return url
  return url
}

type DouyinAwemeItem = {
  desc?: string
  video_text?: string | null
  chapter_list?: Array<{ title?: string; desc?: string; content?: string }> | null
  video?: {
    duration?: number
    play_addr?: { url_list?: string[] }
    bit_rate?: Array<{ play_addr?: { url_list?: string[] } }>
    download_addr?: { url_list?: string[] }
  }
}

function parseJsonObjectFromScriptPrefix(raw: string): unknown | null {
  let depth = 0
  let end = -1
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end <= 0) return null
  try {
    return JSON.parse(raw.slice(0, end)) as unknown
  } catch {
    return null
  }
}

function parseRouterDataAwemeItem(html: string): DouyinAwemeItem | null {
  const m = /window\._ROUTER_DATA\s*=\s*(\{[\s\S]*)/.exec(html)
  if (!m?.[1]) return null
  const root = parseJsonObjectFromScriptPrefix(m[1])
  if (!root || typeof root !== 'object') return null
  const loader = (root as { loaderData?: Record<string, unknown> }).loaderData
  if (!loader || typeof loader !== 'object') return null
  const page = loader['video_(id)/page'] as { videoInfoRes?: { item_list?: DouyinAwemeItem[] } } | undefined
  const item = page?.videoInfoRes?.item_list?.[0]
  return item && typeof item === 'object' ? item : null
}

function stripDouyinMetaBoilerplate(raw: string): string {
  let t = normalizeCaptionText(raw)
  const dash = t.indexOf(' - ')
  if (dash > 0) {
    const tail = t.slice(dash + 3)
    if (/发布在抖音|来抖音，记录美好生活|已经收获了/.test(tail)) {
      t = t.slice(0, dash).trim()
    }
  }
  return t.replace(/#\S+/g, '').replace(/\s{2,}/g, ' ').trim()
}

function pickDouyinPlayUrl(item: DouyinAwemeItem | null): string | null {
  if (!item?.video) return null
  const candidates: string[] = []
  const push = (list?: string[]) => {
    for (const u of list ?? []) {
      if (!/^https?:\/\//i.test(u)) continue
      const normalized = u.replace(/\/playwm\//, '/play/')
      if (!candidates.includes(normalized)) candidates.push(normalized)
    }
  }
  push(item.video.play_addr?.url_list)
  push(item.video.download_addr?.url_list)
  for (const br of item.video.bit_rate ?? []) {
    push(br.play_addr?.url_list)
  }
  return candidates[0] ?? null
}

const MAX_DOUYIN_VIDEO_MS = 900_000
const MAX_DOUYIN_DOWNLOAD_BYTES = 120 * 1024 * 1024

function readDashScopeAsrKey(env: Record<string, string>): string {
  return (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
}

function extractAsrTextFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const o = payload as Record<string, unknown>
  const direct = o.text ?? o.transcript
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  const transcripts = o.transcripts
  if (Array.isArray(transcripts)) {
    const parts = transcripts
      .map((t) => {
        if (!t || typeof t !== 'object') return ''
        const row = t as Record<string, unknown>
        if (typeof row.text === 'string') return row.text
        const sentences = row.sentences
        if (Array.isArray(sentences)) {
          return sentences
            .map((s) => (s && typeof s === 'object' ? String((s as { text?: string }).text ?? '') : ''))
            .filter(Boolean)
            .join('')
        }
        return ''
      })
      .filter(Boolean)
    if (parts.length) return parts.join('\n').trim()
  }

  const results = o.results
  if (Array.isArray(results)) {
    for (const r of results) {
      const t = extractAsrTextFromPayload(r)
      if (t) return t
    }
  }

  const output = o.output
  if (output && typeof output === 'object') {
    const t = extractAsrTextFromPayload(output)
    if (t) return t
  }

  return ''
}

async function pollDashScopeAsrTask(
  taskId: string,
  apiKey: string,
  baseUrl: string,
  pollMs = 120_000,
): Promise<string | null> {
  const deadline = Date.now() + pollMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    try {
      const res = await fetch(`${baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-DashScope-Async': 'enable',
        },
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) continue
      const j = (await res.json()) as Record<string, unknown>
      const output = j.output as Record<string, unknown> | undefined
      const status = String(output?.task_status ?? j.task_status ?? '').toUpperCase()
      if (status === 'FAILED') return null
      if (status !== 'SUCCEEDED' && status !== 'SUCCESS') continue

      const result = output?.result as Record<string, unknown> | undefined
      const transcriptionUrl =
        (typeof result?.transcription_url === 'string' && result.transcription_url) ||
        (typeof output?.transcription_url === 'string' && output.transcription_url) ||
        null
      if (transcriptionUrl) {
        const tr = await fetch(transcriptionUrl, { signal: AbortSignal.timeout(15_000) })
        if (tr.ok) {
          const payload = (await tr.json()) as unknown
          const text = extractAsrTextFromPayload(payload)
          if (text.length >= 8) return text
        }
      }

      const inline = extractAsrTextFromPayload(j)
      if (inline.length >= 8) return inline
    } catch {
      /* retry */
    }
  }
  return null
}

async function transcribeDouyinVideoViaDashScope(
  fileUrl: string,
  env: Record<string, string>,
  pollMs = 120_000,
): Promise<string | null> {
  const apiKey = readDashScopeAsrKey(env)
  if (!apiKey) return null

  const baseUrl = 'https://dashscope.aliyuncs.com'
  const models = ['paraformer-v2', 'fun-asr', 'qwen3-asr-flash-filetrans']

  for (const model of models) {
    try {
      const input =
        model === 'qwen3-asr-flash-filetrans'
          ? { file_url: fileUrl }
          : { file_urls: [fileUrl] }

      const res = await fetch(`${baseUrl}/api/v1/services/audio/asr/transcription`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model,
          input,
          parameters: { channel_id: [0], enable_itn: true },
        }),
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) continue
      const j = (await res.json()) as Record<string, unknown>
      const output = j.output as Record<string, unknown> | undefined
      const taskId = String(output?.task_id ?? j.task_id ?? '').trim()
      if (!taskId) continue
      const text = await pollDashScopeAsrTask(taskId, apiKey, baseUrl, pollMs)
      if (text && text.length >= 8) return text
    } catch {
      /* try next model */
    }
  }
  return null
}

async function transcribeDouyinVideoAudio(
  playUrl: string,
  env: Record<string, string>,
  videoDurationMs?: number | null,
): Promise<string | null> {
  const pollMs = Math.min(
    180_000,
    Math.max(90_000, Math.round((videoDurationMs ?? 60_000) * 0.35) + 45_000),
  )
  const mediaUrl = await resolveMediaUrlForAsr(playUrl, env)
  return transcribeDouyinVideoViaDashScope(mediaUrl, env, pollMs)
}

async function downloadDouyinMediaBuffer(playUrl: string): Promise<Buffer | null> {
  const url = playUrl.replace(/\/playwm\//, '/play/')
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': MOBILE_UA,
        Referer: 'https://www.douyin.com/',
        Accept: '*/*',
      },
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 2048 || buf.length > MAX_DOUYIN_DOWNLOAD_BYTES) return null
    return buf
  } catch {
    return null
  }
}

async function uploadDouyinMediaForAsr(
  buffer: Buffer,
  env: Record<string, string>,
): Promise<string | null> {
  try {
    const { loadIceGatewayConfig } = await import('../../vite-plugins/aliyunIceGateway.js')
    const { putIceSourceObject } = await import('../../vite-plugins/aliyunOssIceUpload.js')
    const cfg = await loadIceGatewayConfig(process.cwd(), env)
    if (!cfg) return null
    const out = await putIceSourceObject(cfg, env, {
      fileName: `douyin-asr-${Date.now()}.mp4`,
      contentType: 'video/mp4',
      buffer,
    })
    return out.ok ? out.mediaUrl : null
  } catch {
    return null
  }
}

/** 抖音 CDN 常拦截外部 ASR 拉流：先服务端下载，再转存 OSS 供通义 ASR 读取 */
async function resolveMediaUrlForAsr(playUrl: string, env: Record<string, string>): Promise<string> {
  const direct = playUrl.replace(/\/playwm\//, '/play/')
  const buf = await downloadDouyinMediaBuffer(direct)
  if (buf) {
    const ossUrl = await uploadDouyinMediaForAsr(buf, env)
    if (ossUrl) return ossUrl
  }
  return direct
}

async function resolveDouyinShareUrl(url: string): Promise<string> {
  if (!/v\.douyin\.com/i.test(url)) return url
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': MOBILE_UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(15_000),
    })
    const finalUrl = res.url?.trim()
    if (finalUrl) {
      try {
        if (DOUYIN_HOST.test(new URL(finalUrl).hostname)) return finalUrl
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* 短链解析失败仍用原链接 */
  }
  return url
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

function unescapeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string
  } catch {
    return raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
}

function normalizeCaptionText(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function pickMetaContent(html: string, prop: string): string | null {
  const re = new RegExp(`property="${prop}" content="([^"]+)"`, 'i')
  const hit = re.exec(html)
  return hit?.[1]?.trim() ?? null
}

function extractEmbeddedDouyinCaption(html: string): string | null {
  const renderMatch = /id="RENDER_DATA"[^>]*>([^<]+)/i.exec(html)
  const blobs = [html, renderMatch?.[1] ? decodeURIComponent(renderMatch[1]) : ''].filter(Boolean)

  for (const blob of blobs) {
    const nested = /"desc"\s*:\s*\{[^}]*"text"\s*:\s*"((?:\\.|[^"\\])*)"/s.exec(blob)
    if (nested?.[1]) {
      const t = normalizeCaptionText(unescapeJsonString(nested[1]))
      if (t.length >= 12) return t
    }
    for (const field of ['desc', 'caption', 'content', 'text']) {
      const re = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 's')
      const m = re.exec(blob)
      if (!m?.[1]) continue
      const t = normalizeCaptionText(unescapeJsonString(m[1]))
      if (t.length >= 12 && !/^https?:\/\//i.test(t)) return t
    }
  }
  return null
}

type DouyinPageExtract = {
  title: string | null
  description: string | null
  caption: string | null
  awemeItem: DouyinAwemeItem | null
  playUrl: string | null
  videoDurationMs: number | null
}

async function tryExtractDouyinPageContent(url: string): Promise<DouyinPageExtract> {
  const empty: DouyinPageExtract = {
    title: null,
    description: null,
    caption: null,
    awemeItem: null,
    playUrl: null,
    videoDurationMs: null,
  }
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': MOBILE_UA,
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return empty
    const html = await res.text()
    const awemeItem = parseRouterDataAwemeItem(html)
    const title = pickMetaContent(html, 'og:title') ?? pickMetaContent(html, 'twitter:title')
    const description =
      pickMetaContent(html, 'og:description') ??
      pickMetaContent(html, 'description') ??
      pickMetaContent(html, 'twitter:description')
    const caption =
      extractEmbeddedDouyinCaption(html) ??
      (awemeItem?.desc ? stripDouyinMetaBoilerplate(awemeItem.desc) : null)
    const playUrl = pickDouyinPlayUrl(awemeItem)
    const videoDurationMs = awemeItem?.video?.duration ?? null
    return { title, description, caption, awemeItem, playUrl, videoDurationMs }
  } catch {
    return empty
  }
}

function parseAiJsonBlock(text: string): { script?: string; motionInstructions?: string } | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const raw = (fenced?.[1] ?? text).trim()
  try {
    const j = JSON.parse(raw) as { script?: string; motionInstructions?: string }
    if (j && typeof j === 'object') return j
  } catch {
    /* fall through */
  }
  return null
}

function defaultMotionInstructions(): string {
  return [
    '[0-3s] 开场：微笑注视镜头，轻微点头',
    '[3-10s] 手势：单手强调关键词，半身构图',
    '[10-结束] 结尾：双手合十或指向左下角引导互动',
  ].join('\n')
}

function formatLinkParseAiError(raw: string): string {
  const t = raw.trim()
  if (!t) return 'AI 解析失败，请稍后重试'
  if (/auth_lookup_failed|supabase_anon_not_configured/i.test(t)) {
    return '无法校验登录态。请在 ECS auth-api 配置 SUPABASE_JWT_SECRET（与 ~/stack/db-credentials.txt 中 JWT_SECRET 一致），商户前端 Vercel 也需配置同名 SUPABASE_JWT_SECRET 后 Redeploy。'
  }
  if (/tokenmix_not_configured|未配置.*api key|not_configured|no.*key/i.test(t) && !/fetch failed/i.test(t)) {
    return '未配置可用 AI 密钥。请在商家管理后台「AI 模型」保存通义（千问）/ 豆包 / MiniMax 至少一项（与智能体共用），保存后无需改商户端。'
  }
  if (/fetch failed|failed to fetch|econnrefused|enotfound|etimedout|502|erp-api|503/i.test(t)) {
    return '无法连接 AI 服务。请确认已登录；AI Key 请在商家管理后台「AI 模型」保存（与智能体共用），并确认 ECS 已启动 meoo-auth-api（https://mofangdianai.com/erp-api/meoo-erp-api-health）。'
  }
  if (/unauthorized|invalid_jwt|auth_lookup|supabase_anon/i.test(t)) {
    return '登录已失效。请重新登录；若仍失败请检查 ECS/Vercel 的 SUPABASE_JWT_SECRET 与运营台配置。'
  }
  if (/tenant_not_found/i.test(t)) {
    return '未找到租户，无法调用 AI。请确认账号已完成商户注册；生产环境请走 erp-api（勿将 SUPABASE_URL 指到 127.0.0.1）。'
  }
  if (/plan_model_restricted|free_ai_quota|tokenmix_not_configured/i.test(t)) {
    return t
  }
  if (/未配置.*API Key|not_configured|401|invalid api key/i.test(t)) {
    return t.includes('运营') ? t : `${t} 请在商家管理后台配置通义/豆包/MiniMax Key 后重试。`
  }
  return t.slice(0, 400)
}

const LINK_PARSE_AI_PROVIDERS: Array<{ provider: 'qwen' | 'doubao' | 'minimax'; model?: string }> = [
  { provider: 'qwen', model: 'qwen-plus' },
  { provider: 'doubao' },
  { provider: 'minimax' },
]

/** 与 /api/meoo-ai-chat 同源：运营台 vendorKeys + 租户权益 + routeAiChat */
async function generateLinkParseContent(
  prompt: string,
  env: Record<string, string>,
  authHeader?: string,
  tenantIdHint?: string,
): Promise<{ ok: true; content: string } | { ok: false; message: string }> {
  const system = 'You are a helpful assistant that outputs strict JSON only.'
  let lastErr = 'AI 解析失败，请稍后重试'

  for (const { provider, model } of LINK_PARSE_AI_PROVIDERS) {
    const bodyRaw = JSON.stringify({
      provider,
      ...(model ? { model } : {}),
      ...(tenantIdHint ? { tenantId: tenantIdHint } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    })
    const out = await runMeooAiChatCore(bodyRaw, authHeader, env)
    if (out.status === 200 && out.body.ok === true && typeof out.body.content === 'string') {
      const text = out.body.content.trim()
      if (text) return { ok: true, content: text }
    }
    const parts = [
      typeof out.body.error === 'string' ? out.body.error : '',
      typeof out.body.detail === 'string' ? out.body.detail : '',
      typeof out.body.hint === 'string' ? out.body.hint : '',
      typeof out.body.message === 'string' ? out.body.message : '',
    ].filter(Boolean)
    if (parts.length) lastErr = parts.join(' — ')
    if (out.status === 401) {
      return { ok: false, message: '请先登录后再使用链接抓取' }
    }
    if (out.status === 503 && /auth_lookup_failed/i.test(lastErr)) {
      return {
        ok: false,
        message: formatLinkParseAiError(lastErr),
      }
    }
  }

  return { ok: false, message: formatLinkParseAiError(lastErr) }
}

function parseMotionFromAi(content: string): string {
  const parsed = parseAiJsonBlock(content)
  if (parsed?.motionInstructions?.trim()) return parsed.motionInstructions.trim()
  const motionMatch = /"motionInstructions"\s*:\s*"((?:\\.|[^"\\])*)"/s.exec(content)
  if (motionMatch?.[1]) return unescapeJsonString(motionMatch[1]).trim()
  const plain = content.replace(/```[\s\S]*?```/g, '').trim()
  if (plain.includes('[0-') || plain.includes('s]')) return plain
  return ''
}

async function inferMotionInstructionsFromScript(
  script: string,
  env: Record<string, string>,
  authHeader?: string,
  tenantIdHint?: string,
): Promise<string> {
  const prompt = `你是数字人口播导演。以下是从抖音短视频提取/还原的口播文案，请**仅**根据这段文案推断数字人动作指令（不要改写口播文案）。

口播文案：
${script}

请严格输出 JSON（不要 markdown），格式：
{"motionInstructions":"按时间轴每行一条，如 [0-3s] 半身镜头微笑点头；与文案节奏、手势、表情对应"}`

  const aiOut = await generateLinkParseContent(prompt, env, authHeader, tenantIdHint)
  if (!aiOut.ok) return defaultMotionInstructions()
  const motion = parseMotionFromAi(aiOut.content)
  return motion.trim() || defaultMotionInstructions()
}

export async function runDouyinLinkParseCore(
  input: DouyinLinkParseInput,
  env: Record<string, string>,
  authHeader?: string,
): Promise<DouyinLinkParseResult> {
  const extracted = extractDouyinUrlFromText(input.url)
  if (!extracted) {
    return {
      ok: false,
      message: '未识别到抖音链接。请粘贴分享链接（含 https://v.douyin.com/…），或整段分享口令。',
    }
  }

  const resolvedUrl = await resolveDouyinShareUrl(extracted)
  const normalizedUrl = normalizeDouyinShareUrl(resolvedUrl) ?? extracted

  const videoId = extractDouyinVideoId(normalizedUrl)
  const fetchUrl = preferIesdouyinShareFetchUrl(normalizedUrl, videoId)
  const page = await tryExtractDouyinPageContent(fetchUrl)

  const durationMs = page.videoDurationMs ?? 0
  const asrKey = readDashScopeAsrKey(env)

  if (!page.playUrl) {
    return {
      ok: false,
      message: '未能解析该视频播放地址，请换链接或改用手动输入/文本驱动',
    }
  }

  if (!asrKey) {
    return {
      ok: false,
      message:
        '未配置通义 ASR（MERCHANT_AI_QWEN_KEY 或 DASHSCOPE_API_KEY）。链接驱动仅支持从视频音频识别口播，不会使用发布标题代替。',
    }
  }

  if (durationMs > MAX_DOUYIN_VIDEO_MS) {
    const mins = Math.ceil(durationMs / 60_000)
    const maxMins = Math.floor(MAX_DOUYIN_VIDEO_MS / 60_000)
    return {
      ok: false,
      message: `视频约 ${mins} 分钟，超过当前支持的 ${maxMins} 分钟上限。请换更短视频或改用手动输入/文本驱动`,
    }
  }

  const asrScript = await transcribeDouyinVideoAudio(page.playUrl, env, durationMs)
  if (asrScript && asrScript.length >= 12) {
    const motionInstructions = await inferMotionInstructionsFromScript(
      asrScript,
      env,
      authHeader,
      input.tenantId?.trim(),
    )
    return {
      ok: true,
      normalizedUrl,
      videoId,
      sourceTitle: page.title,
      script: asrScript,
      motionInstructions,
      scriptSource: 'asr',
    }
  }

  const postCaption = page.awemeItem?.desc ? stripDouyinMetaBoilerplate(page.awemeItem.desc) : ''
  const hint = postCaption
    ? `（页面发布文案为：「${postCaption.slice(0, 36)}${postCaption.length > 36 ? '…' : ''}」，不会当作口播使用）`
    : ''

  return {
    ok: false,
    message: `未能从视频音频识别出口播文案，请确认链接可播放、通义 ASR 可用，或改用手动输入/文本驱动${hint}`,
  }
}
