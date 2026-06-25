/**
 * 探店成片 AI 违规检核（PR 审核 / 达人自检共用）。
 * 须接入运营台配置的 AI 模型（doubao / qwen / minimax / kimi / deepseek 轮询）。
 */
import type { AIProvider } from '../services/ai/types.js'
import { routeAiChat } from '../../vite-plugins/aiGateway/chatRouter.js'
import {
  type AiTokenUsageRecordOpts,
  voidRecordLlmTokenUsage,
} from '../../vite-plugins/aiTokenUsageCore.js'
import {
  DOUYIN_LIFE_VIDEO_COMPLIANCE_RULES,
  DOUYIN_LIFE_VIDEO_RISK_PHRASES,
} from './douyinLifeServiceVideoComplianceRules.js'
import { fetchDouyinPublishCaptionText } from './digitalHumanDouyinLinkCore.js'

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
}

export type VideoComplianceResult =
  | {
      ok: true
      verdict: 'normal' | 'suspect'
      message: string
      hits: string[]
      provider: string
      scannedTextPreview?: string
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

function isRetryableAiError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
  return /429|quota|rate.?limit|余额|不足|insufficient|exhausted|limit exceeded|too many|resource|额度|欠费|over.?limit|capacity|does not exist|not have access|model.*not.*found|invalid.*model|endpoint.*not|unknown model|model.*unavailable|access.*denied/.test(
    msg,
  )
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
          usage: res.usage ?? undefined,
          inputText: `${system}\n${user}`,
          outputText: text,
          token: usageRecord?.token,
        })
        return { text, provider: res.provider || provider }
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (!isRetryableAiError(e)) throw e
    }
  }
  throw new Error(lastErr || 'all_providers_failed')
}

function localRiskScan(text: string): string[] {
  const t = text.toLowerCase()
  const hits: string[] = []
  for (const phrase of DOUYIN_LIFE_VIDEO_RISK_PHRASES) {
    if (t.includes(phrase.toLowerCase())) hits.push(phrase)
  }
  return hits
}

function parseComplianceJson(raw: string): {
  verdict?: 'normal' | 'suspect'
  message?: string
  hits?: string[]
} | null {
  const m = /\{[\s\S]*\}/.exec(String(raw || '').trim())
  if (!m) return null
  try {
    return JSON.parse(m[0]) as {
      verdict?: 'normal' | 'suspect'
      message?: string
      hits?: string[]
    }
  } catch {
    return null
  }
}

function buildScannedText(input: VideoComplianceInput, publishCaption: string): string {
  const parts = [
    input.orderTitle,
    input.recruitmentInfo,
    input.merchantRequirements,
    input.taskDetail,
    input.extraText,
    publishCaption,
  ]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
  return parts.join('\n').slice(0, 4000)
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

  const scannedText = buildScannedText(input, publishCaption)
  if (scannedText.length < 4) {
    return {
      ok: false,
      message: '缺少可检核的文字内容（商单 Brief / 口播文案 / 发布描述），请补充后再试',
    }
  }

  const localHits = localRiskScan(scannedText)
  const system = DOUYIN_LIFE_VIDEO_COMPLIANCE_RULES
  const user = [
    `【平台】${String(input.platform || '抖音').trim() || '抖音'}`,
    `【商单】${String(input.orderTitle || input.mpOrderId || '').trim()}`,
    `【类目/地区】${String(input.category || '').trim()} ${String(input.region || '').trim()}`.trim(),
    `【达人】${String(input.applicantName || input.applicantId || '').trim()}`,
    input.videoUrl ? `【成片地址】${String(input.videoUrl).trim().slice(0, 240)}` : '',
    '【待检核文字（口播/Brief/描述/标题等）】',
    scannedText.slice(0, 3200),
    '',
    '只输出 JSON，不要 Markdown：',
    '{"verdict":"normal"|"suspect","message":"15-80字结论","hits":["命中的违规词或表述，无则空数组"]}',
    'verdict=normal 时 message 写「视频正常」；verdict=suspect 时 message 写「可能违规请注意审核：…」',
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

    if (parsed?.verdict === 'suspect' || parsed?.verdict === 'normal') {
      verdict = parsed.verdict
      message =
        verdict === 'normal'
          ? String(parsed.message || '视频正常').trim() || '视频正常'
          : String(parsed.message || '可能违规请注意审核').trim() || '可能违规请注意审核'
      hits = Array.isArray(parsed.hits)
        ? parsed.hits.map((h) => String(h).trim()).filter(Boolean).slice(0, 12)
        : []
    } else if (/suspect|违规|风险|禁止|夸大|误导|绝对化/i.test(text)) {
      verdict = 'suspect'
      message = `可能违规请注意审核：${text.slice(0, 120)}`
    }

    if (localHits.length && verdict === 'normal') {
      verdict = 'suspect'
      hits = [...new Set([...hits, ...localHits])].slice(0, 12)
      message = `可能违规请注意审核：命中高风险用语「${localHits.slice(0, 3).join('、')}」`
    } else if (localHits.length) {
      hits = [...new Set([...hits, ...localHits])].slice(0, 12)
    }

    if (verdict === 'suspect' && !message.includes('可能违规')) {
      message = `可能违规请注意审核：${message}`
    }

    return {
      ok: true,
      verdict,
      message,
      hits,
      provider,
      scannedTextPreview: scannedText.slice(0, 200),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (localHits.length) {
      return {
        ok: true,
        verdict: 'suspect',
        message: `可能违规请注意审核：命中高风险用语「${localHits.slice(0, 3).join('、')}」（AI 暂不可用：${msg.slice(0, 80)}）`,
        hits: localHits,
        provider: 'local_scan',
        scannedTextPreview: scannedText.slice(0, 200),
      }
    }
    return { ok: false, message: msg.slice(0, 200) || 'AI 检核失败，请稍后重试' }
  }
}
