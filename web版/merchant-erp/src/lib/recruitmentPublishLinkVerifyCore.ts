import type { RegistryMpRecruitmentApplicant, RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import {
  extractDouyinShareFromText,
  resolveDouyinVideoPublishUrl,
} from './digitalHumanDouyinLinkCore.js'
import { verifyIceDouyinPublishWithAi } from './iceDouyinAiVerifyCore.js'
import { routeAiChat } from '../../vite-plugins/aiGateway/chatRouter.js'

export type PublishLinkVerifyResult =
  | { passed: true; note: string; normalizedUrl: string }
  | { passed: false; note: string }

const XHS_HOST = /(?:^|\.)?(?:xiaohongshu\.com|xhslink\.com|xhs\.cn)(?:\/|$)/i
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

function resolveRecruitPlatform(
  mp: RegistryMpRecruitmentOrder,
  applicant?: RegistryMpRecruitmentApplicant | null,
): string {
  return String(applicant?.platform || mp.platform || '抖音').trim() || '抖音'
}

function orderContextLines(mp: RegistryMpRecruitmentOrder): string[] {
  const meta = (mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
    ? mp.mpPublishMeta
    : {}) as Record<string, unknown>
  return [
    String(mp.title || '').trim(),
    String(mp.recruitmentInfo || mp.merchantRequirements || '').trim().slice(0, 400),
    String(meta.referenceUrl || '').trim(),
  ].filter(Boolean)
}

function extractXhsShareUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const re =
    /https?:\/\/(?:www\.)?(?:xiaohongshu\.com\/[^\s\u4e00-\u9fff「」【】《》]+|xhslink\.com\/[A-Za-z0-9_-]+\/?)/gi
  for (const m of t.matchAll(re)) {
    const url = String(m[0] || '').trim().replace(/[/，。！？、；：'"）】\]>]+$/u, '')
    if (url) return url
  }
  if (/^https?:\/\//i.test(t) && XHS_HOST.test(t)) return t
  return null
}

function isXhsPublishUrl(url: string): boolean {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return XHS_HOST.test(u.hostname)
  } catch {
    return XHS_HOST.test(url)
  }
}

async function fetchHtmlCaption(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': MOBILE_UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return ''
    const html = await res.text()
    const ogTitle = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)
    const ogDesc = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(html)
    const title = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
    return [ogTitle?.[1], ogDesc?.[1], title?.[1]].filter(Boolean).join(' ').trim()
  } catch {
    return ''
  }
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
  const m = /\{[\s\S]*\}/.exec(raw.trim())
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
    '你是探店履约审核助手。仅判断平台作品是否与商单相关。',
    `【商单】${orderContext.slice(0, 500)}`,
    `【作品文案】${publishDesc.slice(0, 280)}`,
    '若作品与商单标题/门店主题完全无关，related=false。',
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

async function verifyXhsPublishWithAi(
  mp: RegistryMpRecruitmentOrder,
  rawPublishInput: string,
  env: Record<string, string>,
): Promise<PublishLinkVerifyResult> {
  const url = extractXhsShareUrl(rawPublishInput)
  if (!url || !isXhsPublishUrl(url)) {
    return { passed: false, note: '未识别到小红书作品链接，请粘贴「分享」复制的整段文案（含链接）' }
  }
  const publishDesc =
    (await fetchHtmlCaption(url)) || rawPublishInput.replace(url, '').trim().slice(0, 280)
  const orderContext = orderContextLines(mp).join(' | ')
  if (!publishDesc) {
    return { passed: true, note: '链接已识别，作品文案暂不可读，已按链接格式通过', normalizedUrl: url }
  }
  const ai = await runMinimalAiRelatedCheck(orderContext, publishDesc, env)
  if (ai) {
    if (!ai.related) return { passed: false, note: 'AI核查不通过，作品与订单无关' }
    return { passed: true, note: ai.reason || 'AI 核查通过', normalizedUrl: url }
  }
  const score = keywordOverlapScore(orderContext, publishDesc)
  if (score < 0.06) return { passed: false, note: 'AI核查不通过，作品与订单无关' }
  return { passed: true, note: '作品与商单主题相关', normalizedUrl: url }
}

/** 探店招募：达人回传平台发布链接后 AI 核查标题/内容与商单关联度 */
export async function verifyRecruitmentPublishWithAi(
  mp: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant | null | undefined,
  rawPublishInput: string,
  env: Record<string, string> = process.env as Record<string, string>,
): Promise<PublishLinkVerifyResult> {
  const platform = resolveRecruitPlatform(mp, applicant)
  if (platform.includes('抖音')) {
    const ai = await verifyIceDouyinPublishWithAi(mp, rawPublishInput, env)
    if (!ai.passed) return { passed: false, note: ai.note }
    const resolved = await resolveDouyinVideoPublishUrl(rawPublishInput)
    const normalizedUrl = resolved.ok ? resolved.normalizedUrl : extractDouyinShareFromText(rawPublishInput).url || rawPublishInput.trim()
    return { passed: true, note: ai.note, normalizedUrl }
  }
  if (platform.includes('红')) {
    return verifyXhsPublishWithAi(mp, rawPublishInput, env)
  }
  const url = String(rawPublishInput || '').trim()
  if (!/^https?:\/\//i.test(url)) {
    return { passed: false, note: '请粘贴平台作品分享链接' }
  }
  const publishDesc = (await fetchHtmlCaption(url)) || url
  const orderContext = orderContextLines(mp).join(' | ')
  const ai = await runMinimalAiRelatedCheck(orderContext, publishDesc, env)
  if (ai) {
    if (!ai.related) return { passed: false, note: 'AI核查不通过，作品与订单无关' }
    return { passed: true, note: ai.reason || 'AI 核查通过', normalizedUrl: url }
  }
  return { passed: true, note: '链接格式符合要求', normalizedUrl: url }
}
