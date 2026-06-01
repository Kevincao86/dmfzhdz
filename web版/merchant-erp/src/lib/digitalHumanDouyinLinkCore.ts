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
      /** page=页面抓取原文；ai_extract=AI 在抓取信息基础上还原 */
      scriptSource: 'page' | 'ai_extract'
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
    /https?:\/\/(?:v\.douyin\.com\/[A-Za-z0-9_-]+\/?|(?:www\.)?douyin\.com\/[^\s\u4e00-\u9fff「」【】]+)/i,
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
}

async function tryExtractDouyinPageContent(url: string): Promise<DouyinPageExtract> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': MOBILE_UA,
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return { title: null, description: null, caption: null }
    const html = await res.text()
    const title = pickMetaContent(html, 'og:title') ?? pickMetaContent(html, 'twitter:title')
    const description =
      pickMetaContent(html, 'og:description') ??
      pickMetaContent(html, 'description') ??
      pickMetaContent(html, 'twitter:description')
    const caption = extractEmbeddedDouyinCaption(html)
    return { title, description, caption }
  } catch {
    return { title: null, description: null, caption: null }
  }
}

function pickBestScriptFromPage(page: DouyinPageExtract): string | null {
  const candidates = [page.caption, page.description, page.title]
    .map((s) => (s ? normalizeCaptionText(s) : ''))
    .filter((s) => s.length >= 12 && !/^抖音$/i.test(s) && !/^@\S+$/.test(s))
  if (!candidates.length) return null
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null
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

async function extractScriptAndMotionWithAi(
  page: DouyinPageExtract,
  normalizedUrl: string,
  videoId: string | null,
  env: Record<string, string>,
  authHeader?: string,
  tenantIdHint?: string,
): Promise<
  | { script: string; motionInstructions: string }
  | { ok: false; message: string }
> {
  const prompt = `你是短视频口播文案还原助手。用户给出抖音短视频链接及页面抓取到的原始信息，请**提取/还原原视频口播文案**，禁止编造视频中不存在的产品、价格或情节。

链接：${normalizedUrl}
视频ID：${videoId ?? '未知'}
页面标题：${page.title ?? '未抓取到'}
页面描述/字幕：${page.description ?? '未抓取到'}
嵌入 Caption：${page.caption ?? '未抓取到'}

规则：
1. script 必须基于上述抓取信息还原，优先保留原文措辞，仅做标点与分段整理（\\n 分段）
2. 不得改写成另一篇全新种草稿；若信息不足以还原口播，script 留空并在 motionInstructions 写 "insufficient_source"
3. motionInstructions 仅描述数字人动作/镜头/表情时间轴，不要重复口播全文

请严格输出 JSON（不要 markdown）：
{"script":"...","motionInstructions":"..."}`

  const aiOut = await generateLinkParseContent(prompt, env, authHeader, tenantIdHint)
  if (!aiOut.ok) return { ok: false, message: aiOut.message }

  const content = aiOut.content
  const parsed = parseAiJsonBlock(content)
  let script = parsed?.script?.trim() ?? ''
  let motionInstructions = parsed?.motionInstructions?.trim() ?? ''

  if (!script) {
    const scriptMatch = /"script"\s*:\s*"((?:\\.|[^"\\])*)"/s.exec(content)
    const motionMatch = /"motionInstructions"\s*:\s*"((?:\\.|[^"\\])*)"/s.exec(content)
    if (scriptMatch?.[1]) script = unescapeJsonString(scriptMatch[1]).trim()
    if (motionMatch?.[1]) motionInstructions = unescapeJsonString(motionMatch[1]).trim()
  }

  if (/insufficient_source/i.test(motionInstructions) || /insufficient_source/i.test(content)) {
    return { ok: false, message: '未能从该链接抓取到足够口播信息，请换链接或改用手动输入/文本驱动' }
  }

  if (script.length < 12) {
    return { ok: false, message: '未能从链接还原有效口播文案，请换链接或改用手动输入' }
  }

  if (!motionInstructions || /insufficient/i.test(motionInstructions)) {
    motionInstructions = await inferMotionInstructionsFromScript(script, env, authHeader, tenantIdHint)
  }

  return { script, motionInstructions }
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
  const page = await tryExtractDouyinPageContent(normalizedUrl)
  const pageScript = pickBestScriptFromPage(page)

  if (pageScript && pageScript.length >= 12) {
    const motionInstructions = await inferMotionInstructionsFromScript(
      pageScript,
      env,
      authHeader,
      input.tenantId?.trim(),
    )
    return {
      ok: true,
      normalizedUrl,
      videoId,
      sourceTitle: page.title,
      script: pageScript,
      motionInstructions,
      scriptSource: 'page',
    }
  }

  const aiResult = await extractScriptAndMotionWithAi(
    page,
    normalizedUrl,
    videoId,
    env,
    authHeader,
    input.tenantId?.trim(),
  )
  if ('ok' in aiResult) {
    return { ok: false, message: aiResult.message }
  }

  const { script, motionInstructions } = aiResult

  if (script.length < 12) {
    return { ok: false, message: '未能从链接抓取有效口播文案，请换链接或改用手动输入' }
  }

  return {
    ok: true,
    normalizedUrl,
    videoId,
    sourceTitle: page.title,
    script,
    motionInstructions: motionInstructions.trim() || defaultMotionInstructions(),
    scriptSource: 'ai_extract',
  }
}
