/** 抖音链接解析 → 口播文案 + 动作指令（服务端 / dev 中间件共用） */

import { runMeooAiChatCore } from '../../vite-plugins/aiGateway/meooAiChatCore.js'

export type DouyinLinkParseInput = {
  url: string
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

export function extractDouyinVideoId(url: string): string | null {
  const m =
    /\/video\/(\d+)/.exec(url) ??
    /[?&]modal_id=(\d+)/.exec(url) ??
    /[?&]item_id=(\d+)/.exec(url) ??
    /\/share\/video\/(\d+)/.exec(url)
  return m?.[1] ?? null
}

async function tryFetchDouyinPageMeta(url: string): Promise<{ title: string | null; description: string | null }> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
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

export async function runDouyinLinkParseCore(
  input: DouyinLinkParseInput,
  env: Record<string, string>,
  authHeader?: string,
): Promise<DouyinLinkParseResult> {
  const normalizedUrl = normalizeDouyinShareUrl(input.url)
  if (!normalizedUrl) {
    return { ok: false, message: '请输入有效的抖音分享链接（v.douyin.com 或 www.douyin.com/video/…）' }
  }

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

  const aiOut = await runMeooAiChatCore(
    JSON.stringify({
      provider: 'qwen',
      model: 'qwen-plus',
      messages: [{ role: 'user', content: prompt }],
    }),
    authHeader,
    env,
  )

  if (aiOut.status !== 200 || !aiOut.body || (aiOut.body as { ok?: boolean }).ok !== true) {
    const detail =
      typeof (aiOut.body as { detail?: string })?.detail === 'string'
        ? (aiOut.body as { detail: string }).detail
        : 'AI 解析失败'
    return { ok: false, message: detail.slice(0, 400) }
  }

  const content = String((aiOut.body as { content?: string }).content ?? '').trim()
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
