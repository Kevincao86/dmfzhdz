import type { RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import { routeAiChat } from '../vite-plugins/aiGateway/chatRouter.js'
import { extractDouyinVideoId, resolveDouyinVideoPublishUrl } from './digitalHumanDouyinLinkCore.js'

export type IceDouyinAiVerifyResult =
  | { passed: true; note: string }
  | { passed: false; note: string }

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

async function fetchDouyinItemDesc(videoId: string): Promise<string> {
  const apiUrl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?reflow_source=reflow_page&item_ids=${encodeURIComponent(videoId)}`
  try {
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': MOBILE_UA,
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://www.douyin.com/',
      },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return ''
    const j = (await res.json()) as { item_list?: { desc?: string; video_text?: string }[] }
    const item = j.item_list?.[0]
    return String(item?.desc || item?.video_text || '').trim()
  } catch {
    return ''
  }
}

function orderContextLines(mp: RegistryMpRecruitmentOrder): string[] {
  const meta = (mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
    ? mp.mpPublishMeta
    : {}) as Record<string, unknown>
  const lines = [
    String(mp.title || '').trim(),
    String(mp.recruitmentInfo || mp.merchantRequirements || '').trim().slice(0, 400),
    String(meta.iceVideoUrl || '').trim(),
    String(meta.materialUrl || '').trim(),
  ].filter(Boolean)
  return lines
}

function keywordOverlapScore(orderText: string, publishText: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2)
  const a = new Set(norm(orderText))
  const b = norm(publishText)
  if (!a.size || !b.length) return 0
  let hit = 0
  for (const w of b) if (a.has(w)) hit += 1
  return hit / Math.max(1, Math.min(a.size, b.length))
}

function parseAiRelatedJson(raw: string): { related?: boolean; reason?: string } | null {
  const t = raw.trim()
  const m = /\{[\s\S]*\}/.exec(t)
  if (!m) return null
  try {
    return JSON.parse(m[0]) as { related?: boolean; reason?: string }
  } catch {
    return null
  }
}

async function runMinimalAiRelatedCheck(
  orderContext: string,
  publishDesc: string,
  env: Record<string, string>,
): Promise<{ related: boolean; reason: string } | null> {
  const provider = (env.MERCHANT_AI_ICE_VERIFY_PROVIDER || env.MERCHANT_AI_DEFAULT_PROVIDER || 'doubao').trim()
  const model = (env.MERCHANT_AI_ICE_VERIFY_MODEL || '').trim() || undefined
  const prompt = [
    '你是云剪履约审核助手。仅判断抖音作品是否与商单相关。',
    `【商单】${orderContext.slice(0, 500)}`,
    `【抖音作品文案】${publishDesc.slice(0, 280)}`,
    '若作品与商单标题/素材/门店主题完全无关，related=false。',
    '只输出 JSON：{"related":true|false,"reason":"10字内"}',
  ].join('\n')
  try {
    const res = await routeAiChat(
      {
        provider: provider as 'doubao',
        model,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      },
      env,
    )
    const parsed = parseAiRelatedJson(res.content || '')
    if (!parsed || typeof parsed.related !== 'boolean') return null
    return { related: parsed.related, reason: String(parsed.reason || '').trim() || 'AI 判定' }
  } catch {
    return null
  }
}

/** 云剪回链 AI 核查：最小 token，校验作品与商单素材/标题关联度 */
export async function verifyIceDouyinPublishWithAi(
  mp: RegistryMpRecruitmentOrder,
  rawPublishInput: string,
  env: Record<string, string> = process.env as Record<string, string>,
): Promise<IceDouyinAiVerifyResult> {
  const resolved = await resolveDouyinVideoPublishUrl(rawPublishInput)
  if (!resolved.ok) return { passed: false, note: resolved.error }

  const videoId = extractDouyinVideoId(resolved.normalizedUrl)
  const publishDesc = videoId ? await fetchDouyinItemDesc(videoId) : ''
  const orderContext = orderContextLines(mp).join(' | ')

  if (!publishDesc) {
    return { passed: false, note: '无法读取抖音作品信息，请确认链接可公开访问后重试' }
  }

  const ai = await runMinimalAiRelatedCheck(orderContext, publishDesc, env)
  if (ai) {
    if (!ai.related) {
      return { passed: false, note: 'AI核查不通过，视频与订单无关' }
    }
    return { passed: true, note: ai.reason || 'AI 核查通过' }
  }

  const score = keywordOverlapScore(orderContext, publishDesc)
  if (score < 0.08) {
    return { passed: false, note: 'AI核查不通过，视频与订单无关' }
  }
  return { passed: true, note: '作品与商单主题相关' }
}
