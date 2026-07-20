/**
 * 探店/云剪回链 AI 核查：对比「审核通过成片」与「发布链接作品」的画面与口播文案。
 */
import { routeAiChat } from '../../vite-plugins/aiGateway/chatRouter.js'
import { coerceLlmUsage, voidRecordLlmTokenUsage } from '../../vite-plugins/aiTokenUsageCore.js'
import {
  extractComplianceSampleFramesFromBuffer,
  extractLastFrameJpegFromBuffer,
  extractLastFrameJpegFromUrl,
} from '../../vite-plugins/videoConcatServer.js'
import { fetchRemoteVideoBuffer } from '../../vite-plugins/videoDownloadProxyCore.js'
import {
  downloadDouyinVideoBufferForVerify,
  extractDouyinShareCaptionText,
  fetchDouyinPublishMediaContext,
  resolveDouyinVideoPublishUrl,
  transcribeRemoteVideoAudioDetailed,
} from './digitalHumanDouyinLinkCore.js'
import { extractVideoMediaForCompliance } from './recruitmentVideoComplianceMedia.js'

export type PublishLinkMatchResult =
  | { passed: true; note: string; normalizedUrl: string }
  | { passed: false; note: string }

export const PUBLISH_LINK_UNRELATED_NOTE = 'AI核查不通过，视频与订单无关'

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const XHS_HOST = /(?:^|\.)?(?:xiaohongshu\.com|xhslink\.com|xhs\.cn)(?:\/|$)/i
const KUAISHOU_HOST = /(?:^|\.)?(?:kuaishou\.com|chenzhongtech\.com|gifshow\.com|ksurl\.cn)(?:\/|$)/i
const WEIXIN_VIDEO_HOST = /(?:^|\.)?channels\.weixin\.qq\.com(?:\/|$)/i
const DIANPING_HOST = /(?:^|\.)?(?:dianping\.com|meituan\.com)(?:\/|$)/i

type FrameSlot = 'opening' | 'middle' | 'closing'

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
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return 0.92
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
  const na = normalizeScriptText(a)
  const np = normalizeScriptText(p)
  if (na.length < 4 || np.length < 4) return null
  if (na.includes(np) || np.includes(na)) return true
  const sim = scriptSimilarity(a, p)
  if (na.length < 8 || np.length < 8) return sim >= 0.5 ? true : null
  return sim >= 0.38
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

function frameSlotToBase64(
  frames: Array<{ slot: FrameSlot; buffer: Buffer }>,
  slot: FrameSlot,
): string | null {
  const hit = frames.find((f) => f.slot === slot)
  if (!hit || hit.buffer.length < 256) return null
  return `data:image/jpeg;base64,${hit.buffer.toString('base64')}`
}

async function frameBase64FromBuffer(buf: Buffer, slot: FrameSlot): Promise<string | null> {
  const extracted = await extractComplianceSampleFramesFromBuffer(buf)
  if (extracted.ok) {
    const fromSample = frameSlotToBase64(
      extracted.frames as Array<{ slot: FrameSlot; buffer: Buffer }>,
      slot,
    )
    if (fromSample) return fromSample
  }
  if (slot === 'closing') {
    const last = await extractLastFrameJpegFromBuffer(buf)
    if (last.ok && last.buffer.length > 256) {
      return `data:image/jpeg;base64,${last.buffer.toString('base64')}`
    }
  }
  return null
}

async function downloadVideoBufferForFrame(
  url: string,
  env: Record<string, string>,
  douyinPlayUrl?: boolean,
): Promise<Buffer | null> {
  if (douyinPlayUrl) return downloadDouyinVideoBufferForVerify(url)
  const fetched = await fetchRemoteVideoBuffer(url, { bearer: readVisionBearer(env) })
  return fetched.ok ? fetched.buffer : null
}

async function frameBase64FromVideoUrl(
  url: string,
  env: Record<string, string>,
  opts?: { douyinPlayUrl?: boolean; slot?: FrameSlot },
): Promise<string | null> {
  const slot = opts?.slot ?? 'closing'
  const buf = await downloadVideoBufferForFrame(url, env, opts?.douyinPlayUrl)
  if (buf) return frameBase64FromBuffer(buf, slot)
  if (!opts?.douyinPlayUrl && slot === 'closing') {
    const extracted = await extractLastFrameJpegFromUrl(url, { bearer: readVisionBearer(env) })
    if (extracted.ok && extracted.buffer.length > 256) {
      return `data:image/jpeg;base64,${extracted.buffer.toString('base64')}`
    }
  }
  return null
}

async function askVisionSame(
  imgA: string,
  imgB: string,
  env: Record<string, string>,
  mpOrderId?: string,
  sampleMode: 'opening' | 'full' = 'full',
): Promise<boolean | null> {
  const provider = (env.MERCHANT_AI_ICE_VERIFY_PROVIDER || env.MERCHANT_AI_DEFAULT_PROVIDER || 'doubao').trim()
  const model = (env.MERCHANT_AI_ICE_VERIFY_MODEL || '').trim() || undefined
  const prompt = [
    sampleMode === 'opening'
      ? '图1是商单审核通过的探店成片开头画面，图2是达人提交的发布链接视频开头画面。'
      : '图1是商单审核通过的探店成片尾帧，图2是达人提交的发布链接视频尾帧。',
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
    void voidRecordLlmTokenUsage(
      mpOrderId ? { env, mpOrderId } : { env },
      {
        provider: res.provider || provider,
        model: res.model,
        usage: coerceLlmUsage(res.usage),
        inputText: prompt,
        outputText: String(res.content ?? ''),
      },
    )
    const parsed = parseVisionSameJson(res.content || '')
    if (!parsed || typeof parsed.same !== 'boolean') return null
    return parsed.same
  } catch {
    return null
  }
}

async function compareVideoVisuals(
  approvedVideoUrl: string,
  publishVideoUrl: string,
  env: Record<string, string>,
  publishIsDouyinCdn = false,
  mpOrderId?: string,
  sampleMode: 'opening' | 'full' = 'full',
): Promise<boolean | null> {
  const slots: FrameSlot[] = sampleMode === 'opening' ? ['opening'] : ['closing', 'opening']
  for (const slot of slots) {
    const [imgA, imgB] = await Promise.all([
      frameBase64FromVideoUrl(approvedVideoUrl, env, { slot }),
      frameBase64FromVideoUrl(publishVideoUrl, env, { douyinPlayUrl: publishIsDouyinCdn, slot }),
    ])
    if (!imgA || !imgB) continue
    const same = await askVisionSame(imgA, imgB, env, mpOrderId, sampleMode)
    if (same !== null) return same
  }
  return null
}

async function collectApprovedScript(approvedVideoUrl: string, env: Record<string, string>): Promise<string> {
  const detailed = await transcribeRemoteVideoAudioDetailed(approvedVideoUrl, env)
  const fromAsr = String(detailed?.text || '').trim()
  if (fromAsr.length >= 4) return fromAsr
  try {
    const media = await extractVideoMediaForCompliance(approvedVideoUrl, env)
    const text = String(media.asrText || '').trim()
    if (text.length >= 4) return text
  } catch {
    /* ASR/OCR 失败不阻断 */
  }
  return fromAsr
}

function readAiKeysPresence(env: Record<string, string>): { vision: boolean; asr: boolean } {
  return {
    vision: Boolean(
      (env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY ?? '').trim() ||
        (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim() ||
        (env.TOKENMIX_API_KEY ?? '').trim(),
    ),
    asr: Boolean((env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()),
  }
}

async function collectPublishScriptFromMedia(
  captionText: string,
  playUrl: string | null,
  durationMs: number | null | undefined,
  rawShareInput: string,
  shareCaptionExtract: (raw: string) => string,
  env: Record<string, string>,
): Promise<string> {
  let asrText = ''
  if (playUrl) {
    const detailed = await transcribeRemoteVideoAudioDetailed(playUrl, env, durationMs)
    asrText = String(detailed?.text || '').trim()
  }
  return pickRicherScript(captionText, asrText, shareCaptionExtract(rawShareInput))
}

function cleanShareUrl(raw: string): string {
  return raw.trim().replace(/[/，。！？、；：'"）】\]>]+$/u, '')
}

function extractUrlFromShareText(
  raw: string,
  re: RegExp,
  hostTest?: (url: string) => boolean,
): string | null {
  const t = raw.trim()
  if (!t) return null
  for (const m of t.matchAll(re)) {
    const url = cleanShareUrl(String(m[0] || ''))
    if (url && (!hostTest || hostTest(url))) return url
  }
  if (/^https?:\/\//i.test(t) && (!hostTest || hostTest(t))) return t
  return null
}

function extractXhsShareUrl(raw: string): string | null {
  return extractUrlFromShareText(
    raw,
    /https?:\/\/(?:www\.)?(?:xiaohongshu\.com\/[^\s\u4e00-\u9fff「」【】《》]+|xhslink\.com\/[A-Za-z0-9_-]+\/?)/gi,
    (url) => XHS_HOST.test(url),
  )
}

function extractKuaishouShareUrl(raw: string): string | null {
  return extractUrlFromShareText(
    raw,
    /https?:\/\/(?:v\.kuaishou\.com\/[^\s\u4e00-\u9fff「」【】《》]+|(?:www\.)?(?:kuaishou|chenzhongtech|gifshow)\.com\/[^\s\u4e00-\u9fff「」【】《》]+)/gi,
    (url) => KUAISHOU_HOST.test(url),
  )
}

function extractWeixinVideoShareUrl(raw: string): string | null {
  return extractUrlFromShareText(
    raw,
    /https?:\/\/channels\.weixin\.qq\.com\/[^\s\u4e00-\u9fff「」【】《》]+/gi,
    (url) => WEIXIN_VIDEO_HOST.test(url),
  )
}

function extractDianpingShareUrl(raw: string): string | null {
  return extractUrlFromShareText(
    raw,
    /https?:\/\/(?:www\.)?(?:dianping|meituan)\.com\/[^\s\u4e00-\u9fff「」【】《》]+/gi,
    (url) => DIANPING_HOST.test(url),
  )
}

function extractGenericShareCaption(raw: string): string {
  const t = String(raw || '').trim()
  if (!t) return ''
  const bracket = /【([^】]{2,80})】/.exec(t)
  const fromBracket = bracket?.[1]?.trim()
  const cleaned = t
    .replace(/^\d+(?:\.\d+)?\s*/, '')
    .replace(/复制打开(?:抖音|快手)[，,]?/g, '')
    .replace(/^看看/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const combined = fromBracket ? `${fromBracket} ${cleaned}`.trim() : cleaned
  return combined.length >= 4 ? combined.slice(0, 400) : ''
}

function parseVideoUrlFromHtml(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:video(?::url|:secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::url|:secure_url)?["']/i,
    /"playUrl"\s*:\s*"([^"]+)"/i,
    /"mainMvUrl"\s*:\s*"([^"]+)"/i,
    /"photoUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/i,
  ]
  for (const re of patterns) {
    const m = re.exec(html)
    const url = m?.[1]?.replace(/\\u002F/g, '/').replace(/\\\//g, '/').trim()
    if (url && /^https?:\/\//i.test(url)) return url
  }
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]!) as { contentUrl?: string; embedUrl?: string }
      const url = j.contentUrl || j.embedUrl
      if (url && /^https?:\/\//i.test(url)) return url
    } catch {
      /* ignore */
    }
  }
  return null
}

async function fetchOgPublishMeta(url: string): Promise<{ caption: string; videoUrl: string | null }> {
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
    const title = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
    const caption = [ogTitle?.[1], ogDesc?.[1], title?.[1]].filter(Boolean).join(' ').trim()
    const videoUrl = parseVideoUrlFromHtml(html)
    return { caption, videoUrl: videoUrl && /^https?:\/\//i.test(videoUrl) ? videoUrl : null }
  } catch {
    return { caption: '', videoUrl: null }
  }
}

function finalizePublishLinkMatch(
  visualSame: boolean | null,
  scriptSame: boolean | null,
  normalizedUrl: string,
  env?: Record<string, string>,
): PublishLinkMatchResult {
  if (visualSame === false || scriptSame === false) {
    return { passed: false, note: PUBLISH_LINK_UNRELATED_NOTE }
  }
  if (visualSame === null && scriptSame === null) {
    const keys = env ? readAiKeysPresence(env) : { vision: true, asr: true }
    if (!keys.vision) {
      return {
        passed: false,
        note: '未配置 AI 视觉模型密钥，请在运营台「AI 模型」保存豆包/通义 Key 后重试',
      }
    }
    return { passed: false, note: '无法读取作品画面或文案，请确认链接可公开访问后重试' }
  }
  return { passed: true, note: '发布链接与审核通过成片一致', normalizedUrl }
}

async function verifyVideoPlatformPublishLink(input: {
  approvedVideoUrl: string
  rawPublishInput: string
  normalizedUrl: string
  playUrl: string | null
  captionText: string
  videoDurationMs?: number | null
  publishIsDouyinCdn?: boolean
  shareCaptionExtract: (raw: string) => string
  env: Record<string, string>
  mpOrderId?: string
  sampleMode?: 'opening' | 'full'
}): Promise<PublishLinkMatchResult> {
  if (!input.playUrl) {
    return { passed: false, note: '无法读取作品视频，请确认链接可公开访问后重试' }
  }

  if (input.sampleMode === 'opening') {
    const visualSame = await compareVideoVisuals(
      input.approvedVideoUrl,
      input.playUrl,
      input.env,
      Boolean(input.publishIsDouyinCdn),
      input.mpOrderId,
      'opening',
    )
    if (visualSame === true) {
      return {
        passed: true,
        note: '发布链接开头画面与审核通过成片一致',
        normalizedUrl: input.normalizedUrl,
      }
    }
    if (visualSame === false) {
      return { passed: false, note: PUBLISH_LINK_UNRELATED_NOTE }
    }
    return finalizePublishLinkMatch(visualSame, null, input.normalizedUrl, input.env)
  }

  const [approvedScript, publishScript, visualSame] = await Promise.all([
    collectApprovedScript(input.approvedVideoUrl, input.env),
    collectPublishScriptFromMedia(
      input.captionText,
      input.playUrl,
      input.videoDurationMs,
      input.rawPublishInput,
      input.shareCaptionExtract,
      input.env,
    ),
    compareVideoVisuals(
      input.approvedVideoUrl,
      input.playUrl,
      input.env,
      Boolean(input.publishIsDouyinCdn),
      input.mpOrderId,
      input.sampleMode ?? 'full',
    ),
  ])

  const scriptSame = scriptsConsistent(approvedScript, publishScript)
  return finalizePublishLinkMatch(visualSame, scriptSame, input.normalizedUrl, input.env)
}

async function verifyScriptPlatformPublishLink(input: {
  approvedVideoUrl: string
  rawPublishInput: string
  normalizedUrl: string
  captionText: string
  videoUrl: string | null
  env: Record<string, string>
  mpOrderId?: string
  sampleMode?: 'opening' | 'full'
}): Promise<PublishLinkMatchResult> {
  const publishScript = pickRicherScript(input.captionText, extractGenericShareCaption(input.rawPublishInput))
  const approvedScript = await collectApprovedScript(input.approvedVideoUrl, input.env)
  const scriptSame = scriptsConsistent(approvedScript, publishScript)

  let visualSame: boolean | null = null
  if (input.videoUrl) {
    visualSame = await compareVideoVisuals(
      input.approvedVideoUrl,
      input.videoUrl,
      input.env,
      false,
      input.mpOrderId,
      input.sampleMode ?? 'full',
    )
  }

  return finalizePublishLinkMatch(visualSame, scriptSame, input.normalizedUrl, input.env)
}

export async function verifyApprovedVideoMatchesPublishLink(input: {
  approvedVideoUrl: string
  rawPublishInput: string
  platform: string
  env?: Record<string, string>
  mpOrderId?: string
  sampleMode?: 'opening' | 'full'
}): Promise<PublishLinkMatchResult> {
  const env = input.env ?? (process.env as Record<string, string>)
  const sampleMode = input.sampleMode ?? 'full'
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
    return verifyVideoPlatformPublishLink({
      approvedVideoUrl,
      rawPublishInput,
      normalizedUrl: resolved.normalizedUrl,
      playUrl: media.playUrl,
      captionText: media.captionText,
      videoDurationMs: media.videoDurationMs,
      publishIsDouyinCdn: true,
      shareCaptionExtract: extractDouyinShareCaptionText,
      env,
      mpOrderId: input.mpOrderId,
      sampleMode,
    })
  }

  if (platform.includes('快手')) {
    const url = extractKuaishouShareUrl(rawPublishInput)
    if (!url) {
      return { passed: false, note: '未识别到快手作品链接，请粘贴「分享」复制的整段文案（含链接）' }
    }
    const meta = await fetchOgPublishMeta(url)
    return verifyVideoPlatformPublishLink({
      approvedVideoUrl,
      rawPublishInput,
      normalizedUrl: url,
      playUrl: meta.videoUrl,
      captionText: meta.caption,
      shareCaptionExtract: extractGenericShareCaption,
      env,
      mpOrderId: input.mpOrderId,
      sampleMode,
    })
  }

  if (platform.includes('视频号') || platform.includes('微信视频')) {
    const url = extractWeixinVideoShareUrl(rawPublishInput)
    if (!url) {
      return { passed: false, note: '未识别到微信视频号作品链接，请粘贴「分享」复制的整段文案（含链接）' }
    }
    const meta = await fetchOgPublishMeta(url)
    return verifyVideoPlatformPublishLink({
      approvedVideoUrl,
      rawPublishInput,
      normalizedUrl: url,
      playUrl: meta.videoUrl,
      captionText: meta.caption,
      shareCaptionExtract: extractGenericShareCaption,
      env,
      mpOrderId: input.mpOrderId,
      sampleMode,
    })
  }

  if (platform.includes('红')) {
    const url = extractXhsShareUrl(rawPublishInput)
    if (!url) {
      return { passed: false, note: '未识别到小红书作品链接，请粘贴「分享」复制的整段文案（含链接）' }
    }
    const meta = await fetchOgPublishMeta(url)
    return verifyScriptPlatformPublishLink({
      approvedVideoUrl,
      rawPublishInput,
      normalizedUrl: url,
      captionText: meta.caption,
      videoUrl: meta.videoUrl,
      env,
      mpOrderId: input.mpOrderId,
      sampleMode,
    })
  }

  if (platform.includes('大众') || platform.includes('点评') || platform.includes('美团')) {
    const url = extractDianpingShareUrl(rawPublishInput)
    if (!url) {
      return { passed: false, note: '未识别到大众点评/美团作品链接，请粘贴「分享」复制的整段文案（含链接）' }
    }
    const meta = await fetchOgPublishMeta(url)
    return verifyScriptPlatformPublishLink({
      approvedVideoUrl,
      rawPublishInput,
      normalizedUrl: url,
      captionText: meta.caption,
      videoUrl: meta.videoUrl,
      env,
      mpOrderId: input.mpOrderId,
      sampleMode,
    })
  }

  const url =
    extractKuaishouShareUrl(rawPublishInput) ||
    extractWeixinVideoShareUrl(rawPublishInput) ||
    extractXhsShareUrl(rawPublishInput) ||
    extractDianpingShareUrl(rawPublishInput) ||
    (/^https?:\/\//i.test(rawPublishInput.trim()) ? rawPublishInput.trim() : null)

  if (!url) {
    return { passed: false, note: '请粘贴平台作品分享链接或完整分享口令' }
  }

  const meta = await fetchOgPublishMeta(url)
  if (meta.videoUrl) {
    return verifyVideoPlatformPublishLink({
      approvedVideoUrl,
      rawPublishInput,
      normalizedUrl: url,
      playUrl: meta.videoUrl,
      captionText: meta.caption,
      shareCaptionExtract: extractGenericShareCaption,
      env,
      mpOrderId: input.mpOrderId,
      sampleMode,
    })
  }

  return verifyScriptPlatformPublishLink({
    approvedVideoUrl,
    rawPublishInput,
    normalizedUrl: url,
    captionText: meta.caption,
    videoUrl: null,
    env,
      mpOrderId: input.mpOrderId,
      sampleMode,
    })
}
