/**
 * 探店成片 AI 违规检核（PR 审核 / 达人自检共用）。
 * 须接入运营台配置的 AI 模型（doubao / qwen / minimax / kimi / deepseek 轮询）。
 */
import type { AIProvider } from '../services/ai/types.js'
import { routeAiChat } from '../../vite-plugins/aiGateway/chatRouter.js'
import {
  type AiTokenUsageRecordOpts,
  coerceLlmUsage,
  voidRecordLlmTokenUsage,
} from '../../vite-plugins/aiTokenUsageCore.js'
import {
  DOUYIN_LIFE_VIDEO_COMPLIANCE_RULES,
  DOUYIN_LIFE_VIDEO_RISK_PHRASES,
} from './douyinLifeServiceVideoComplianceRules.js'
import {
  KUAISHOU_VIDEO_COMPLIANCE_RULES,
  KUAISHOU_VIDEO_RISK_PHRASES,
} from './kuaishouVideoComplianceRules.js'
import {
  WECHAT_CHANNELS_VIDEO_COMPLIANCE_RULES,
  WECHAT_CHANNELS_VIDEO_RISK_PHRASES,
} from './wechatChannelsVideoComplianceRules.js'
import { normalizeRecruitmentPlatform } from './deliveryReviewPlatform.js'
import { fetchDouyinPublishCaptionText } from './digitalHumanDouyinLinkCore.js'
import { extractVideoMediaForCompliance } from './recruitmentVideoComplianceMedia.js'
import {
  buildVideoComplianceChannelReport,
  buildVideoComplianceLocationMessage,
  buildVideoComplianceSummaryWithSuggestions,
  enrichVideoViolationsWithLocations,
  resolveVideoHitLocations,
  type VideoComplianceChannelReport,
  type VideoComplianceLocation,
  type VideoComplianceViolation,
} from './complianceHitLocations.js'
import { isRetryableAiProviderError } from './aiProviderRetryableError.js'
import { mpPointsCostForVideoSeconds } from './mpPointsEconomics.js'

export type VideoComplianceInput = {
  mpOrderId?: string
  applicantId?: string
  platform?: string
  orderTitle?: string
  recruitmentInfo?: string
  merchantRequirements?: string
  taskDetail?: string
  category?: string
  region?: string
  applicantName?: string
  videoUrl?: string
  douyinPublishUrl?: string
  extraText?: string
  /** 已提取的成片媒体（API 层预检积分后传入，避免重复抽帧） */
  preloadedMediaExtract?: Awaited<ReturnType<typeof extractVideoMediaForCompliance>> | null
}

export type { VideoComplianceViolation } from './complianceHitLocations.js'

export type VideoComplianceResult =
  | {
      ok: true
      verdict: 'normal' | 'suspect'
      message: string
      hits: string[]
      violations?: VideoComplianceViolation[]
      locations?: VideoComplianceLocation[]
      channelReport?: VideoComplianceChannelReport
      summary?: string
      provider: string
      scannedTextPreview?: string
      /** 成片时长（秒） */
      durationSec?: number
      /** 结算用视频分钟（向上取整秒→分展示） */
      videoMinutesBilled?: number
      /** 本次检核消耗积分 */
      pointsCharged?: number
    }
  | { ok: false; message: string }

function hasKey(env: Record<string, string>, provider: AIProvider): boolean {
  if (provider === 'doubao') {
    return Boolean((env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY ?? '').trim())
  }
  if (provider === 'qwen') {
    return Boolean((env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim())
  }
  if (provider === 'minimax') {
    return Boolean((env.MINIMAX_API_KEY ?? env.MERCHANT_AI_MINIMAX_KEY ?? '').trim())
  }
  if (provider === 'kimi') {
    return Boolean((env.MOONSHOT_API_KEY ?? env.MERCHANT_AI_KIMI_KEY ?? env.KIMI_API_KEY ?? '').trim())
  }
  if (provider === 'deepseek') {
    return Boolean((env.DEEPSEEK_API_KEY ?? '').trim())
  }
  return false
}

function providerChain(env: Record<string, string>, preferred?: string): AIProvider[] {
  const chain: AIProvider[] = []
  const add = (p: AIProvider) => {
    if (hasKey(env, p) && !chain.includes(p)) chain.push(p)
  }
  const want = String(preferred || env.MERCHANT_MP_AI_PROVIDER || 'doubao').trim() as AIProvider
  add(want)
  for (const p of ['doubao', 'qwen', 'minimax', 'kimi', 'deepseek'] as AIProvider[]) add(p)
  return chain
}

async function callLlmWithFallback(
  env: Record<string, string>,
  preferred: string | undefined,
  system: string,
  user: string,
  usageRecord?: AiTokenUsageRecordOpts & { token?: string },
): Promise<{ text: string; provider: string }> {
  const chain = providerChain(env, preferred)
  let lastErr = 'ai_not_configured'
  for (const provider of chain) {
    try {
      const res = await routeAiChat(
        {
          provider,
          temperature: 0,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        },
        env,
      )
      const text = String(res.content ?? '').trim()
      if (text) {
        void voidRecordLlmTokenUsage(usageRecord, {
          provider: res.provider || provider,
          model: res.model,
          usage: coerceLlmUsage(res.usage),
          inputText: `${system}\n${user}`,
          outputText: text,
          token: usageRecord?.token,
        })
        return { text, provider: res.provider || provider }
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (!isRetryableAiProviderError(e)) throw e
    }
  }
  throw new Error(lastErr || 'all_providers_failed')
}

function videoComplianceRulesForPlatform(platform: string): { system: string; phrases: string[] } {
  const n = normalizeRecruitmentPlatform(platform)
  if (n === '快手') {
    return { system: KUAISHOU_VIDEO_COMPLIANCE_RULES, phrases: KUAISHOU_VIDEO_RISK_PHRASES }
  }
  if (n === '微信视频号') {
    return { system: WECHAT_CHANNELS_VIDEO_COMPLIANCE_RULES, phrases: WECHAT_CHANNELS_VIDEO_RISK_PHRASES }
  }
  return { system: DOUYIN_LIFE_VIDEO_COMPLIANCE_RULES, phrases: DOUYIN_LIFE_VIDEO_RISK_PHRASES }
}

function localRiskScan(text: string, phrases: string[]): string[] {
  const t = text.toLowerCase()
  const hits: string[] = []
  for (const phrase of phrases) {
    if (t.includes(phrase.toLowerCase())) hits.push(phrase)
  }
  return hits
}

function parseComplianceJson(raw: string): {
  verdict?: 'normal' | 'suspect'
  message?: string
  hits?: string[]
  violations?: VideoComplianceViolation[]
} | null {
  const m = /\{[\s\S]*\}/.exec(String(raw || '').trim())
  if (!m) return null
  try {
    return JSON.parse(m[0]) as {
      verdict?: 'normal' | 'suspect'
      message?: string
      hits?: string[]
      violations?: VideoComplianceViolation[]
    }
  } catch {
    return null
  }
}

function normalizeVideoViolationChannel(
  raw: unknown,
): VideoComplianceViolation['channel'] | undefined {
  const ch = String(raw || '').trim().toLowerCase()
  if (ch === 'asr' || ch === '口播') return 'asr'
  if (ch === 'subtitle' || ch === '字幕' || ch === 'ocr') return 'subtitle'
  if (ch === 'visual' || ch === '画面') return 'visual'
  if (ch === 'brief') return 'brief'
  return undefined
}

function parseVideoViolations(raw: unknown): VideoComplianceViolation[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((v) => {
      const row = v as Record<string, unknown>
      return {
        excerpt: String(row.excerpt || '').trim(),
        rule: String(row.rule || '').trim(),
        suggestion: String(row.suggestion || '').trim(),
        channel: normalizeVideoViolationChannel(row.channel),
        timeLabel: String(row.timeLabel || '').trim() || undefined,
        atSec: typeof row.atSec === 'number' && row.atSec >= 0 ? row.atSec : undefined,
      }
    })
    .filter((v) => v.excerpt || v.rule || v.suggestion)
    .slice(0, 8)
}

function defaultLocalHitSuggestion(phrase: string): string {
  if (/最/.test(phrase)) return '「价格实惠」「性价比不错」'
  if (/100%|百分百|零风险|永久|万能|根治|速效/.test(phrase)) {
    return '删除夸大承诺，改为可核实的效果描述'
  }
  if (/微信|加V|加薇|加微|薇信|私信|扫码|线下|私下|站外|绕过|脱离|VX|wx|电话|淘宝|天猫|下载抖音/.test(phrase)) {
    return '删除站外联系/导流话术，改为引导平台内团购核销或到店体验'
  }
  if (/着装擦边|姿态擦边|二维码特写|打码指认|联系方式露出|色情导流|低俗导流/.test(phrase)) {
    return '调整出镜着装与构图，去掉二维码/打码指认，避免擦边导流观感'
  }
  return '删除或改写该表述，避免绝对化/夸大宣传'
}

function defaultSemanticHitSuggestion(phrase: string): string {
  if (/快来|赶紧|速来|必来/.test(phrase)) return '「适合来逛逛」「值得来体验一下」'
  if (/超有|超级|非常有格调|格调/.test(phrase)) return '「装修很有质感」「氛围挺舒服的」'
  if (/肥美|擦边|导流|二维码|打码|私信|微信/.test(phrase)) {
    return '改为客观探店描述；去掉站外导流与擦边暗示，美食夸赞对准菜品而非人'
  }
  return '改为客观、可证实的体验描述，避免夸大或强引导'
}

function ensureViolationsForHits(
  hits: string[],
  violations: VideoComplianceViolation[],
  localPhrases: string[],
): VideoComplianceViolation[] {
  const localSet = new Set(localPhrases.map((p) => p.toLowerCase()))
  const covered = new Set(
    violations.map((v) => String(v.excerpt || '').trim()).filter(Boolean),
  )
  const out = [...violations]
  for (const h of hits) {
    if (!h || covered.has(h)) continue
    const isLocal = localSet.has(h.toLowerCase())
    out.push({
      excerpt: h,
      rule: isLocal ? '命中平台高风险词库' : '语义风险表述（AI复核）',
      suggestion: isLocal ? defaultLocalHitSuggestion(h) : defaultSemanticHitSuggestion(h),
    })
    covered.add(h)
  }
  return out.slice(0, 8)
}

function buildBriefOnlyText(input: VideoComplianceInput, publishCaption: string): string {
  return [
    input.orderTitle,
    input.recruitmentInfo,
    input.merchantRequirements,
    input.taskDetail,
    input.extraText,
    publishCaption,
  ]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .join('\n')
}

function attachVideoComplianceMeta(
  hits: string[],
  mediaExtract: Awaited<ReturnType<typeof extractVideoMediaForCompliance>> | null,
  briefText: string,
  violations: VideoComplianceViolation[] = [],
): {
  locations: VideoComplianceLocation[]
  channelReport: VideoComplianceChannelReport
  summary: string
  briefHits: string[]
  violations: VideoComplianceViolation[]
} {
  const briefHits = hits.filter(
    (p) => briefText.includes(p) && !(mediaExtract?.asrText || '').includes(p),
  )
  const channelReport = buildVideoComplianceChannelReport({
    phrases: hits,
    asrText: mediaExtract?.asrText,
    asrSegments: mediaExtract?.asrSegments,
    frameSlotHits: mediaExtract?.frameSlotHits,
    durationSec: mediaExtract?.durationSec,
    briefText,
  })
  const locations = resolveVideoHitLocations({
    phrases: hits,
    asrText: mediaExtract?.asrText,
    asrSegments: mediaExtract?.asrSegments,
    frameSlotHits: mediaExtract?.frameSlotHits,
    briefText,
    durationSec: mediaExtract?.durationSec,
  })
  const enrichedViolations = enrichVideoViolationsWithLocations(violations, locations)
  const summary =
    buildVideoComplianceSummaryWithSuggestions(enrichedViolations, channelReport, briefHits) ||
    buildVideoComplianceLocationMessage(locations, channelReport, briefHits)
  return { locations, channelReport, summary, briefHits, violations: enrichedViolations }
}

function buildScannedText(
  input: VideoComplianceInput,
  publishCaption: string,
  media?: { asrText: string; ocrText: string },
): string {
  const parts = [
    input.orderTitle,
    input.recruitmentInfo,
    input.merchantRequirements,
    input.taskDetail,
    input.extraText,
    publishCaption,
    media?.asrText ? `【口播 ASR】\n${media.asrText}` : '',
    media?.ocrText ? `【画面 OCR】\n${media.ocrText}` : '',
  ]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
  return parts.join('\n').slice(0, 8000)
}

function videoComplianceBilling(mediaExtract: { durationSec?: number } | null | undefined): {
  durationSec?: number
  videoMinutesBilled?: number
  pointsCharged?: number
} {
  const durationSec = mediaExtract?.durationSec
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) {
    return { durationSec: undefined, videoMinutesBilled: undefined, pointsCharged: mpPointsCostForVideoSeconds(1) }
  }
  const sec = Math.max(1, Math.ceil(durationSec))
  return {
    durationSec: sec,
    videoMinutesBilled: Math.max(1, Math.ceil(sec / 60)),
    pointsCharged: mpPointsCostForVideoSeconds(sec),
  }
}

export async function preloadVideoComplianceMedia(
  input: Pick<VideoComplianceInput, 'videoUrl' | 'mpOrderId'>,
  env: Record<string, string>,
  usageRecord?: AiTokenUsageRecordOpts & { token?: string; env?: Record<string, string> },
): Promise<Awaited<ReturnType<typeof extractVideoMediaForCompliance>> | null> {
  const videoUrl = String(input.videoUrl || '').trim()
  if (!/^https?:\/\//i.test(videoUrl)) return null
  return extractVideoMediaForCompliance(
    videoUrl,
    env,
    usageRecord
      ? {
          ...usageRecord,
          env,
          mpOrderId: usageRecord.mpOrderId || input.mpOrderId,
        }
      : input.mpOrderId
        ? { env, mpOrderId: input.mpOrderId }
        : undefined,
  )
}

export async function runRecruitmentVideoComplianceCheck(
  input: VideoComplianceInput,
  env: Record<string, string>,
  preferredProvider?: string,
  usageRecord?: AiTokenUsageRecordOpts & { token?: string },
): Promise<VideoComplianceResult> {
  if (!providerChain(env, preferredProvider).length) {
    return {
      ok: false,
      message: '未配置 AI 模型 Key，请在运营台「AI 模型」保存至少一个厂商密钥',
    }
  }

  let publishCaption = ''
  const publishRaw = String(input.douyinPublishUrl || '').trim()
  if (publishRaw) {
    try {
      publishCaption = await fetchDouyinPublishCaptionText(publishRaw, publishRaw)
    } catch {
      publishCaption = ''
    }
  }

  const videoUrl = String(input.videoUrl || '').trim()
  let mediaExtract: Awaited<ReturnType<typeof extractVideoMediaForCompliance>> | null = null
  if (input.preloadedMediaExtract !== undefined) {
    mediaExtract = input.preloadedMediaExtract
  } else if (/^https?:\/\//i.test(videoUrl)) {
    mediaExtract = await extractVideoMediaForCompliance(
      videoUrl,
      env,
      usageRecord
        ? {
            ...usageRecord,
            env,
            mpOrderId: usageRecord.mpOrderId || input.mpOrderId,
          }
        : input.mpOrderId
          ? { env, mpOrderId: input.mpOrderId }
          : undefined,
    )
  }

  const scannedText = buildScannedText(input, publishCaption, mediaExtract ?? undefined)
  const mediaOnlyText = [
    mediaExtract?.asrText,
    mediaExtract?.ocrText,
  ]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .join('\n')

  if (scannedText.length < 4 && mediaOnlyText.length < 4) {
    const hasVideo = /^https?:\/\//i.test(videoUrl)
    return {
      ok: false,
      message: hasVideo
        ? '未能从成片提取口播/画面文字，且缺少商单 Brief，请补充文案或更换可访问的成片地址后再试'
        : '缺少可检核内容：请上传成片或补充商单 Brief / 口播文案 / 发布描述后再试',
    }
  }

  const platformNorm = normalizeRecruitmentPlatform(String(input.platform || '抖音').trim() || '抖音')
  const { system, phrases } = videoComplianceRulesForPlatform(platformNorm)
  const localHits = localRiskScan(scannedText, phrases)
  const visualHits = mediaExtract?.visualHits ?? []
  const mergedLocalHits = [...new Set([...localHits, ...visualHits])].slice(0, 12)
  const mediaNotes = mediaExtract?.mediaNotes?.length
    ? `\n【成片检核说明】${mediaExtract.mediaNotes.join('；')}`
    : ''
  const user = [
    `【平台】${platformNorm}`,
    `【商单】${String(input.orderTitle || input.mpOrderId || '').trim()}`,
    `【类目/地区】${String(input.category || '').trim()} ${String(input.region || '').trim()}`.trim(),
    `【达人】${String(input.applicantName || input.applicantId || '').trim()}`,
    videoUrl ? `【成片地址】${videoUrl.slice(0, 240)}` : '',
    mediaNotes,
    '【待检核文字（商单 Brief / 口播 ASR / 画面 OCR / 发布描述等）】',
    scannedText.slice(0, 6000),
    '',
    '只输出 JSON，不要 Markdown：',
    '{"verdict":"normal"|"suspect","message":"15-80字结论","hits":["命中的违规词或表述，无则空数组"],"violations":[{"excerpt":"原文违规片段（须来自口播/字幕/画面，20字内）","rule":"违反的规则要点","suggestion":"「替换词1」「替换词2」","channel":"asr"|"subtitle"|"visual"|"brief"}]}',
    'verdict=normal 时 violations 为空数组；verdict=suspect 时须为每条风险表述给出 violations（含未命中本地词库的语义风险词）。',
    'suggestion 须给出 1-2 个可直接替换的短语，用「」包裹，格式示例：「适合来逛逛」「值得来体验一下」。',
    '须综合口播、画面文字、画面视觉与 Brief 判断；任一路径出现绝对化/虚假/误导，或擦边×导流/站外联系 → suspect。',
    '美食语境客观描述可豁免双关误伤；擦边出镜与二维码特写/打码指认/站外话术组合须标「色情导流/低俗导流」或「违规导流」。',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { text, provider } = await callLlmWithFallback(
      env,
      preferredProvider,
      system,
      user,
      usageRecord
        ? {
            ...usageRecord,
            env,
            mpOrderId: usageRecord.mpOrderId || input.mpOrderId,
          }
        : input.mpOrderId
          ? { env, mpOrderId: input.mpOrderId }
          : undefined,
    )
    const parsed = parseComplianceJson(text)
    let verdict: 'normal' | 'suspect' = 'normal'
    let message = '视频正常'
    let hits: string[] = []
    let violations: VideoComplianceViolation[] = []

    if (parsed?.verdict === 'suspect' || parsed?.verdict === 'normal') {
      verdict = parsed.verdict
      message =
        verdict === 'normal'
          ? String(parsed.message || '视频正常').trim() || '视频正常'
          : String(parsed.message || '可能违规请注意审核').trim() || '可能违规请注意审核'
      hits = Array.isArray(parsed.hits)
        ? parsed.hits.map((h) => String(h).trim()).filter(Boolean).slice(0, 12)
        : []
      violations = parseVideoViolations(parsed.violations)
    } else if (/suspect|违规|风险|禁止|夸大|误导|绝对化/i.test(text)) {
      verdict = 'suspect'
      message = `可能违规请注意审核：${text.slice(0, 120)}`
    }

    if (mergedLocalHits.length && verdict === 'normal') {
      verdict = 'suspect'
      hits = [...new Set([...hits, ...mergedLocalHits])].slice(0, 12)
      message = `可能违规请注意审核：命中高风险用语「${mergedLocalHits.slice(0, 3).join('、')}」`
    } else if (mergedLocalHits.length) {
      hits = [...new Set([...hits, ...mergedLocalHits])].slice(0, 12)
    }

    if (verdict === 'suspect') {
      violations = ensureViolationsForHits(hits, violations, phrases)
    }

    if (verdict === 'suspect' && !message.includes('可能违规')) {
      message = `可能违规请注意审核：${message}`
    }

    const briefText = buildBriefOnlyText(input, publishCaption)
    const meta =
      verdict === 'suspect'
        ? attachVideoComplianceMeta(hits, mediaExtract, briefText, violations)
        : null
    if (meta?.summary) {
      message = meta.summary
    }

    return {
      ok: true,
      verdict,
      message,
      hits,
      violations: meta?.violations,
      locations: meta?.locations,
      channelReport: meta?.channelReport,
      summary: meta?.summary,
      provider,
      scannedTextPreview: scannedText.slice(0, 200),
      ...videoComplianceBilling(mediaExtract),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (mergedLocalHits.length) {
      const briefText = buildBriefOnlyText(input, publishCaption)
      const fallbackViolations = ensureViolationsForHits(mergedLocalHits, [], phrases)
      const meta = attachVideoComplianceMeta(
        mergedLocalHits,
        mediaExtract,
        briefText,
        fallbackViolations,
      )
      return {
        ok: true,
        verdict: 'suspect',
        message: meta.summary
          ? `${meta.summary}（AI 暂不可用：${msg.slice(0, 60)}）`
          : `可能违规请注意审核：命中高风险用语「${mergedLocalHits.slice(0, 3).join('、')}」（AI 暂不可用：${msg.slice(0, 80)}）`,
        hits: mergedLocalHits,
        violations: meta.violations,
        locations: meta.locations,
        channelReport: meta.channelReport,
        summary: meta.summary,
        provider: 'local_scan',
        scannedTextPreview: scannedText.slice(0, 200),
        ...videoComplianceBilling(mediaExtract),
      }
    }
    return { ok: false, message: msg.slice(0, 200) || 'AI 检核失败，请稍后重试' }
  }
}
