/**
 * 探店/云剪回链 AI 核查：对比「审核通过成片」与「发布链接作品」的画面与口播文案。
 */
import { routeAiChat } from '../../vite-plugins/aiGateway/chatRouter.js'
import { extractLastFrameJpegFromBuffer, extractLastFrameJpegFromUrl } from '../../vite-plugins/videoConcatServer.js'
import {
  downloadDouyinVideoBufferForVerify,
  fetchDouyinPublishMediaContext,
  resolveDouyinVideoPublishUrl,
  transcribeRemoteVideoAudio,
} from './digitalHumanDouyinLinkCore.js'

export type PublishLinkMatchResult =
  | { passed: true; note: string; normalizedUrl: string }
  | { passed: false; note: string }

export const PUBLISH_LINK_UNRELATED_NOTE = 'AI核查不通过，视频与订单无关'

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const XHS_HOST = /(?:^|\.)?(?:xiaohongshu\.com|xhslink\.com|xhs\.cn)(?:\/|$)/i

function readVisionBearer(env: Record<string, string>): string | undefined {
  const t = (env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY ?? '').trim()
  return t || undefined
}

function normalizeScriptText(raw: string): string {
  return String(raw || '')
    .replace(/#[^\s#]+/g, ' ')
    .replace(/@[^\s@]+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase()
}

function scriptSimilarity(a: string, b: string): number {
  const na = normalizeScriptText(a)
  const nb = normalizeScriptText(b)
  if (!na || !nb) return 0
  if (na.length >= 8 && nb.length >= 8 && (na.includes(nb) || nb.includes(na))) return 0.92
  const grams = (s: string) => {
    const out = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
    return out
  }
  const ga = grams(na)
  const gb = grams(nb)
  if (!ga.size || !gb.size) return 0
  let inter = 0
  for (const g of ga) if (gb.has(g)) inter += 1
  return inter / Math.max(1, ga.size + gb.size - inter)
}

function pickRicherScript(...parts: Array<string | null | undefined>): string {
  const rows = parts.map((p) => String(p || '').trim()).filter((p) => p.length >= 4)
  if (!rows.length) return ''
  return rows.sort((a, b) => b.length - a.length)[0]!
}

function scriptsConsistent(approvedScript: string, publishScript: string): boolean | null {
  const a = pickRicherScript(approvedScript)
  const p = pickRicherScript(publishScript)
  if (!a || !p) return null
  if (normalizeScriptText(a).length < 8 || normalizeScriptText(p).length < 8) return null
  return scriptSimilarity(a, p) >= 0.42
}

function parseVisionSameJson(raw: string): { same?: boolean; reason?: string } | null {
  const m = /\{[\s\S]*\}/.exec(String(raw || '').trim())
  if (!m) return null
  try {
    return JSON.parse(m[0]) as { same?: boolean; reason?: string }
  } catch {
    return null
  }
}

async function frameBase64FromVideoUrl(
  url: string,
  env: Record<string, string>,
  opts?: { douyinPlayUrl?: boolean },
): Promise<string | null> {
  if (opts?.douyinPlayUrl) {
    const buf = await downloadDouyinVideoBufferForVerify(url)
    if (!buf) return null
    const extracted = await extractLastFrameJpegFromBuffer(buf)
    if (!extracted.ok) return null
    return `data:image/jpeg;base64,${extracted.buffer.toString('base64')}`
  }
  const extracted = await extractLastFrameJpegFromUrl(url, { bearer: readVisionBearer(env) })
  if (!extracted.ok) return null
  return `data:image/jpeg;base64,${extracted.buffer.toString('base64')}`
}

async function compareVideoVisuals(
  approvedVideoUrl: string,
  publishVideoUrl: string,
  env: Record<string, string>,
  publishIsDouyinCdn = false,
): Promise<boolean | null> {
  const [imgA, imgB] = await Promise.all([
    frameBase64FromVideoUrl(approvedVideoUrl, env),
    frameBase64FromVideoUrl(publishVideoUrl, env, { douyinPlayUrl: publishIsDouyinCdn }),
  ])
  if (!imgA || !imgB) return null

  const provider = (env.MERCHANT_AI_ICE_VERIFY_PROVIDER || env.MERCHANT_AI_DEFAULT_PROVIDER || 'doubao').trim()
  const model = (env.MERCHANT_AI_ICE_VERIFY_MODEL || '').trim() || undefined
  const prompt = [
    '图1是商单审核通过的探店成片尾帧，图2是达人提交的发布链接视频尾帧。',
    '判断是否为同一支视频（允许分辨率/压缩/平台水印差异，但主体画面须一致）。',
    '只输出 JSON：{"same":true|false,"reason":"10字内"}',
  ].join('\n')
  try {
    const res = await routeAiChat(
      {
        provider: provider as 'doubao',
        model,
        temperature: 0,
        imageDataUrls: [imgA, imgB],
        messages: [{ role: 'user', content: prompt }],
      },
      env,
    )
    const parsed = parseVisionSameJson(res.content || '')
    if (!parsed || typeof parsed.same !== 'boolean') return null
    return parsed.same
  } catch {
    return null
  }
}

async function collectApprovedScript(approvedVideoUrl: string, env: Record<string, string>): Promise<string> {
  const asr = await transcribeRemoteVideoAudio(approvedVideoUrl, env)
  return String(asr || '').trim()
}

async function collectDouyinPublishScript(
  normalizedUrl: string,
  rawPublishInput: string,
  playUrl: string | null,
  durationMs: number | null | undefined,
  env: Record<string, string>,
): Promise<string> {
  const ctx = await fetchDouyinPublishMediaContext(normalizedUrl, rawPublishInput)
  const asr = playUrl ? await transcribeRemoteVideoAudio(playUrl, env, durationMs) : null
  return pickRicherScript(ctx.captionText, asr, extractShareCaptionFallback(rawPublishInput))
}

function extractShareCaptionFallback(raw: string): string {
  const t = String(raw || '').trim()
  if (!t) return ''
  return t
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/复制打开抖音[，,]?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)
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

async function fetchXhsPublishMeta(url: string): Promise<{ caption: string; videoUrl: string | null }> {
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
    if (!res.ok) return { caption: '', videoUrl: null }
    const html = await res.text()
    const ogTitle = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)
    const ogDesc = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(html)
    const ogVideo = /<meta[^>]+property=["']og:video(?::url)?["'][^>]+content=["']([^"']+)["']/i.exec(html)
    const title = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
    const caption = [ogTitle?.[1], ogDesc?.[1], title?.[1]].filter(Boolean).join(' ').trim()
    const videoUrl = ogVideo?.[1]?.trim() || null
    return { caption, videoUrl: videoUrl && /^https?:\/\//i.test(videoUrl) ? videoUrl : null }
  } catch {
    return { caption: '', videoUrl: null }
  }
}

export async function verifyApprovedVideoMatchesPublishLink(input: {
  approvedVideoUrl: string
  rawPublishInput: string
  platform: string
  env?: Record<string, string>
}): Promise<PublishLinkMatchResult> {
  const env = input.env ?? (process.env as Record<string, string>)
  const approvedVideoUrl = String(input.approvedVideoUrl || '').trim()
  const rawPublishInput = String(input.rawPublishInput || '').trim()
  const platform = String(input.platform || '抖音').trim()

  if (!approvedVideoUrl || !/^https?:\/\//i.test(approvedVideoUrl)) {
    return { passed: false, note: '未找到审核通过的成片，请先上传并通过 PR 审核' }
  }
  if (!rawPublishInput) {
    return { passed: false, note: '请填写发布链接' }
  }

  if (platform.includes('抖音')) {
    const resolved = await resolveDouyinVideoPublishUrl(rawPublishInput)
    if (!resolved.ok) return { passed: false, note: resolved.error }

    const media = await fetchDouyinPublishMediaContext(resolved.normalizedUrl, rawPublishInput)
    if (!media.playUrl) {
      return { passed: false, note: '无法读取抖音作品视频，请确认链接可公开访问后重试' }
    }

    const [approvedScript, publishScript, visualSame] = await Promise.all([
      collectApprovedScript(approvedVideoUrl, env),
      collectDouyinPublishScript(
        resolved.normalizedUrl,
        rawPublishInput,
        media.playUrl,
        media.videoDurationMs,
        env,
      ),
      compareVideoVisuals(approvedVideoUrl, media.playUrl, env, true),
    ])

    const scriptSame = scriptsConsistent(approvedScript, publishScript)
    if (visualSame === false || scriptSame === false) {
      return { passed: false, note: PUBLISH_LINK_UNRELATED_NOTE }
    }
    if (visualSame === null && scriptSame === null) {
      return { passed: false, note: '无法读取作品画面或文案，请确认链接可公开访问后重试' }
    }
    return {
      passed: true,
      note: '发布链接与审核通过成片一致',
      normalizedUrl: resolved.normalizedUrl,
    }
  }

  if (platform.includes('红')) {
    const url = extractXhsShareUrl(rawPublishInput)
    if (!url) {
      return { passed: false, note: '未识别到小红书作品链接，请粘贴「分享」复制的整段文案（含链接）' }
    }
    const meta = await fetchXhsPublishMeta(url)
    const publishScript = pickRicherScript(meta.caption, extractShareCaptionFallback(rawPublishInput))
    const approvedScript = await collectApprovedScript(approvedVideoUrl, env)
    const scriptSame = scriptsConsistent(approvedScript, publishScript)

    let visualSame: boolean | null = null
    if (meta.videoUrl) {
      visualSame = await compareVideoVisuals(approvedVideoUrl, meta.videoUrl, env, false)
    }

    if (visualSame === false || scriptSame === false) {
      return { passed: false, note: PUBLISH_LINK_UNRELATED_NOTE }
    }
    if (visualSame === null && scriptSame === null) {
      return { passed: false, note: '无法读取作品画面或文案，请确认链接可公开访问后重试' }
    }
    return { passed: true, note: '发布链接与审核通过成片一致', normalizedUrl: url }
  }

  const url = rawPublishInput
  if (!/^https?:\/\//i.test(url)) {
    return { passed: false, note: '请粘贴平台作品分享链接' }
  }
  const meta = await fetchXhsPublishMeta(url)
  const publishScript = pickRicherScript(meta.caption, url)
  const approvedScript = await collectApprovedScript(approvedVideoUrl, env)
  const scriptSame = scriptsConsistent(approvedScript, publishScript)
  let visualSame: boolean | null = null
  if (meta.videoUrl) {
    visualSame = await compareVideoVisuals(approvedVideoUrl, meta.videoUrl, env, false)
  }
  if (visualSame === false || scriptSame === false) {
    return { passed: false, note: PUBLISH_LINK_UNRELATED_NOTE }
  }
  if (visualSame === null && scriptSame === null) {
    return { passed: false, note: '无法读取作品画面或文案，请确认链接可公开访问后重试' }
  }
  return { passed: true, note: '发布链接与审核通过成片一致', normalizedUrl: url }
}
