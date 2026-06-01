/** 抖音链接解析 → 口播文案 + 动作指令（服务端 / dev 中间件共用） */

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

async function tryFetchDouyinPageMeta(url: string): Promise<{ title: string | null; description: string | null }> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': MOBILE_UA,
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return { title: null, description: null }
    const html = await res.text()
    const pick = (prop: string) => {
      const re = new RegExp(`property="${prop}" content="([^"]+)"`, 'i')
      const hit = re.exec(html)
      return hit?.[1]?.trim() ?? null
    }
    const title = pick('og:title') ?? pick('twitter:title')
    const description = pick('og:description') ?? pick('description')
    return { title, description }
  } catch {
    return { title: null, description: null }
  }
}

function parseAiJsonBlock(text: string): { script?: string; motionInstructions?: string } | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const raw = (fenced?.[1] ?? text).trim()
  try {
    const j = JSON.parse(raw) as { script?: string; motionInstructions?: string }
    if (j && typeof j === 'object') return j
  } catch {
    /* fall through split */
  }
  return null
}

function formatLinkParseAiError(raw: string): string {
  const t = raw.trim()
  if (!t) return 'AI 解析失败，请稍后重试'
  if (/fetch failed|failed to fetch|econnrefused|enotfound|etimedout|502|erp-api/i.test(t)) {
    return '无法连接 AI 服务。请确认已登录；AI Key 请在商家管理后台「AI 模型」保存（与智能体共用），并优先经 ECS erp-api 访问。'
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
    ].filter(Boolean)
    if (parts.length) lastErr = parts.join(' — ')
    if (out.status === 401) {
      return { ok: false, message: '请先登录后再使用链接抓取' }
    }
  }

  return { ok: false, message: formatLinkParseAiError(lastErr) }
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
  const meta = await tryFetchDouyinPageMeta(normalizedUrl)

  const prompt = `你是本地生活短视频拆解助手。用户给出一条抖音短视频链接，请根据链接、视频 ID 与页面元信息，生成适合「数字人口播翻拍」的两部分内容。

链接：${normalizedUrl}
视频ID：${videoId ?? '未知'}
页面标题：${meta.title ?? '未抓取到'}
页面描述：${meta.description ?? '未抓取到'}

请严格输出 JSON（不要 markdown 包裹），格式：
{
  "script": "口播文案，150~320字，口语化，分2~4段用\\n分隔，适合门店/团购种草",
  "motionInstructions": "动作指令，按时间轴，每行一条，格式如 [0-3s] 动作描述；含表情、手势、镜头（半身/特写）、与文案节奏配合"
}

若元信息不足，请根据链接与常见抖音探店/团购短视频结构合理推断，但仍要具体可执行。`

  const aiOut = await generateLinkParseContent(prompt, env, authHeader, input.tenantId?.trim())
  if (!aiOut.ok) {
    return { ok: false, message: aiOut.message }
  }

  const content = aiOut.content
  const parsed = parseAiJsonBlock(content)
  let script = parsed?.script?.trim() ?? ''
  let motionInstructions = parsed?.motionInstructions?.trim() ?? ''

  if (!script) {
    const scriptMatch = /"script"\s*:\s*"((?:\\.|[^"\\])*)"/s.exec(content)
    const motionMatch = /"motionInstructions"\s*:\s*"((?:\\.|[^"\\])*)"/s.exec(content)
    if (scriptMatch?.[1]) script = JSON.parse(`"${scriptMatch[1]}"`) as string
    if (motionMatch?.[1]) motionInstructions = JSON.parse(`"${motionMatch[1]}"`) as string
  }

  if (!script) {
    script = content.replace(/```[\s\S]*?```/g, '').trim().slice(0, 800)
  }
  if (!motionInstructions) {
    motionInstructions = [
      '[0-3s] 开场：微笑注视镜头，轻微点头',
      '[3-10s] 手势：单手强调关键词，半身构图',
      '[10-结束] 结尾：双手合十或指向左下角引导互动',
    ].join('\n')
  }

  if (script.length < 20) {
    return { ok: false, message: '未能从链接生成有效口播文案，请换链接或改用手动输入' }
  }

  return {
    ok: true,
    normalizedUrl,
    videoId,
    sourceTitle: meta.title,
    script,
    motionInstructions,
  }
}
