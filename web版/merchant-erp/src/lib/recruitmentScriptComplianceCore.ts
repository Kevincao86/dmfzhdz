/**
 * 探店文稿 AI 违规检核（小红书/大众点评笔记规范）
 */
import type { AIProvider } from '../services/ai/types.js'
import { routeAiChat } from '../../vite-plugins/aiGateway/chatRouter.js'
import {
  type AiTokenUsageRecordOpts,
  coerceLlmUsage,
  voidRecordLlmTokenUsage,
} from '../../vite-plugins/aiTokenUsageCore.js'
import {
  XIAOHONGSHU_NOTE_COMPLIANCE_RULES,
  XIAOHONGSHU_NOTE_RISK_PHRASES,
} from './xiaohongshuNoteComplianceRules.js'
import {
  DIANPING_NOTE_COMPLIANCE_RULES,
  DIANPING_NOTE_RISK_PHRASES,
} from './dianpingNoteComplianceRules.js'
import { normalizeRecruitmentPlatform } from './deliveryReviewPlatform.js'
import {
  buildNumberedScriptBody,
  buildScriptComplianceLocationMessage,
  findParagraphNoForExcerpt,
  splitScriptParagraphs,
} from './complianceHitLocations.js'

export type ScriptComplianceInput = {
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
  scriptUrl?: string
  scriptLinkUrl?: string
  scriptText?: string
  extraText?: string
}

export type ScriptComplianceViolation = {
  excerpt: string
  rule: string
  suggestion: string
  paragraphNo?: number
}

export type ScriptComplianceResult =
  | {
      ok: true
      verdict: 'normal' | 'suspect'
      message: string
      hits: string[]
      violations: ScriptComplianceViolation[]
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
          usage: coerceLlmUsage(res.usage),
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
  violations?: ScriptComplianceViolation[]
} | null {
  const m = /\{[\s\S]*\}/.exec(String(raw || '').trim())
  if (!m) return null
  try {
    return JSON.parse(m[0]) as {
      verdict?: 'normal' | 'suspect'
      message?: string
      hits?: string[]
      violations?: ScriptComplianceViolation[]
    }
  } catch {
    return null
  }
}

function enrichViolationsWithParagraph(
  violations: ScriptComplianceViolation[],
  paragraphs: ReturnType<typeof splitScriptParagraphs>,
): ScriptComplianceViolation[] {
  return violations.map((v) => {
    const paragraphNo =
      typeof v.paragraphNo === 'number' && v.paragraphNo > 0
        ? v.paragraphNo
        : findParagraphNoForExcerpt(v.excerpt, paragraphs)
    return paragraphNo ? { ...v, paragraphNo } : v
  })
}

function buildScannedText(input: ScriptComplianceInput): {
  fullText: string
  numberedBody: string
  paragraphs: ReturnType<typeof splitScriptParagraphs>
} {
  const scriptRaw = String(input.scriptText ?? '').trim()
  const paragraphs = splitScriptParagraphs(scriptRaw)
  const numberedBody = paragraphs.length ? buildNumberedScriptBody(paragraphs) : scriptRaw
  const parts = [
    input.orderTitle,
    input.recruitmentInfo,
    input.merchantRequirements,
    input.taskDetail,
    numberedBody || scriptRaw,
    input.extraText,
    input.scriptLinkUrl ? `文档链接：${input.scriptLinkUrl}` : '',
  ]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
  const fullText = parts.join('\n').slice(0, 12000)
  return { fullText, numberedBody: numberedBody || scriptRaw, paragraphs }
}

function complianceRulesForPlatform(platform: string): { system: string; phrases: string[] } {
  const n = normalizeRecruitmentPlatform(platform)
  if (n === '大众点评') {
    return { system: DIANPING_NOTE_COMPLIANCE_RULES, phrases: DIANPING_NOTE_RISK_PHRASES }
  }
  return { system: XIAOHONGSHU_NOTE_COMPLIANCE_RULES, phrases: XIAOHONGSHU_NOTE_RISK_PHRASES }
}

export async function runRecruitmentScriptComplianceCheck(
  input: ScriptComplianceInput,
  env: Record<string, string>,
  preferredProvider?: string,
  usageRecord?: AiTokenUsageRecordOpts & { token?: string },
): Promise<ScriptComplianceResult> {
  if (!providerChain(env, preferredProvider).length) {
    return {
      ok: false,
      message: '未配置 AI 模型 Key，请在运营台「AI 模型」保存至少一个厂商密钥',
    }
  }

  const { fullText: scannedText, paragraphs } = buildScannedText(input)
  if (scannedText.length < 4) {
    return {
      ok: false,
      message: '缺少可检核的文稿内容，请上传 doc/txt 或粘贴文档链接后再试',
    }
  }

  const platform = normalizeRecruitmentPlatform(String(input.platform || '小红书').trim() || '小红书')
  const { system, phrases } = complianceRulesForPlatform(platform)
  const localHits = localRiskScan(scannedText, phrases)

  const user = [
    `【平台】${platform}`,
    `【商单】${String(input.orderTitle || input.mpOrderId || '').trim()}`,
    `【类目/地区】${String(input.category || '').trim()} ${String(input.region || '').trim()}`.trim(),
    `【达人】${String(input.applicantName || input.applicantId || '').trim()}`,
    input.scriptLinkUrl ? `【文档链接】${String(input.scriptLinkUrl).trim().slice(0, 240)}` : '',
    '【待检核文稿全文】',
    scannedText.slice(0, 8000),
    '',
    '只输出 JSON，不要 Markdown：',
    '{"verdict":"normal"|"suspect","message":"15-80字结论","hits":["命中的违规词，无则空数组"],"violations":[{"excerpt":"原文违规片段（20字内）","rule":"违反的规则要点","suggestion":"修改建议（可执行）","paragraphNo":1}]}',
    'verdict=normal 时 violations 为空数组；verdict=suspect 时至少给出 1 条 violations，excerpt 必须来自原文，paragraphNo 为【第N段】编号。',
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
    let message = '文稿正常'
    let hits: string[] = []
    let violations: ScriptComplianceViolation[] = []

    if (parsed?.verdict === 'suspect' || parsed?.verdict === 'normal') {
      verdict = parsed.verdict
      message =
        verdict === 'normal'
          ? String(parsed.message || '文稿正常').trim() || '文稿正常'
          : String(parsed.message || '可能违规请注意修改').trim() || '可能违规请注意修改'
      hits = Array.isArray(parsed.hits)
        ? parsed.hits.map((h) => String(h).trim()).filter(Boolean).slice(0, 12)
        : []
      violations = Array.isArray(parsed.violations)
        ? parsed.violations
            .map((v) => ({
              excerpt: String(v?.excerpt || '').trim(),
              rule: String(v?.rule || '').trim(),
              suggestion: String(v?.suggestion || '').trim(),
              paragraphNo:
                typeof v?.paragraphNo === 'number' && v.paragraphNo > 0 ? v.paragraphNo : undefined,
            }))
            .filter((v) => v.excerpt || v.rule || v.suggestion)
            .slice(0, 8)
        : []
    } else if (/suspect|违规|风险|禁止|夸大|误导|绝对化/i.test(text)) {
      verdict = 'suspect'
      message = '可能违规请注意修改'
    }

    if (localHits.length && verdict === 'normal') {
      verdict = 'suspect'
      hits = [...new Set([...localHits, ...hits])].slice(0, 12)
      message = `可能违规请注意修改：${localHits.slice(0, 2).join('、')}`
      if (!violations.length) {
        violations = localHits.slice(0, 2).map((h) => ({
          excerpt: h,
          rule: '命中平台高风险词库',
          suggestion: '删除或改写该表述，避免绝对化/夸大宣传',
          paragraphNo: findParagraphNoForExcerpt(h, paragraphs),
        }))
      }
    }

    violations = enrichViolationsWithParagraph(violations, paragraphs)
    if (verdict === 'suspect' && violations.length) {
      const located = buildScriptComplianceLocationMessage(violations)
      if (located) message = located
    }

    return {
      ok: true,
      verdict,
      message,
      hits,
      violations,
      provider,
      scannedTextPreview: scannedText.slice(0, 400),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (localHits.length) {
      let violations: ScriptComplianceViolation[] = localHits.slice(0, 2).map((h) => ({
        excerpt: h,
        rule: '命中平台高风险词库',
        suggestion: '删除或改写该表述，避免绝对化/夸大宣传',
        paragraphNo: findParagraphNoForExcerpt(h, paragraphs),
      }))
      violations = enrichViolationsWithParagraph(violations, paragraphs)
      const message = buildScriptComplianceLocationMessage(violations) || `可能违规请注意修改：${localHits.slice(0, 2).join('、')}`
      return {
        ok: true,
        verdict: 'suspect',
        message,
        hits: localHits,
        violations,
        provider: 'local_scan',
        scannedTextPreview: scannedText.slice(0, 400),
      }
    }
    return { ok: false, message: msg.slice(0, 400) || 'AI 检核失败' }
  }
}
