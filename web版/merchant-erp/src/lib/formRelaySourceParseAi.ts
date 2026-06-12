/**
 * 转发工具：规则/HTML 解析不足时，用 LLM 从页面文本摘要任务详情与招募要求。
 */
import { merchantAgentChatFromMessages } from '../../vite-plugins/merchantAiUpstream.js'
import type { FormRelaySourceParseOk } from './formRelaySourceParseCore.js'

function extractJsonObject(text: string): Record<string, unknown> {
  const raw = String(text || '').trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fence?.[1] ?? raw).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
  }
  return JSON.parse(candidate) as Record<string, unknown>
}

function pickStr(obj: Record<string, unknown>, key: string): string {
  const v = obj[key]
  return typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : ''
}

const SYSTEM = `你是灵祺 ERP「转发代收」助手。用户粘贴了外部报名表/派单表链接，服务端已抓取页面文本（可能不完整）。
请从文本中提炼可用于达人招募的关键信息，输出严格 JSON（不要 markdown）：
{
  "titleHint": "商家或活动简称，20字内",
  "taskDetail": "任务说明，保留平台/内容形式/时间等要点，多行用\\n",
  "merchantRequirements": "达人要求：粉丝、等级、地域、账号类型、报价等",
  "city": "城市名，如杭州；全国则空字符串",
  "region": "展示用地区，如杭州或全国",
  "budgetHint": "预算/报价摘要，如百粉20元；无则面议",
  "recruitPlatform": "抖音|小红书|快手|视频号|B站|微博|不限 之一"
}
若文本几乎为空，仅根据 URL 域名与路径做保守推断，不要编造具体商家名；taskDetail 可写「原表为 SPA 页面，请 PR 核对原表补充详情」。`

export type FormRelayAiSummarizeInput = {
  url: string
  platformLabel: string
  pageText: string
  htmlTitle?: string
  metaHints?: string
}

export async function summarizeFormRelaySourceWithAi(
  env: Record<string, string>,
  input: FormRelayAiSummarizeInput,
): Promise<Partial<FormRelaySourceParseOk> | null> {
  const qwenKey = (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
  const doubaoKey = (env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY ?? '').trim()
  if (!qwenKey && !doubaoKey) return null

  const chunks = [
    `原表链接：${input.url}`,
    `平台类型：${input.platformLabel}`,
    input.htmlTitle ? `页面标题：${input.htmlTitle}` : '',
    input.metaHints ? `页面摘要：${input.metaHints}` : '',
    `页面正文（节选）：\n${String(input.pageText || '').slice(0, 12000)}`,
  ].filter(Boolean)

  const user = chunks.join('\n\n')
  const errors: string[] = []

  for (const provider of ['doubao', 'qwen'] as const) {
    const key = provider === 'doubao' ? doubaoKey : qwenKey
    if (!key) continue
    try {
      const { text } = await merchantAgentChatFromMessages(env, provider, undefined, SYSTEM, user)
      const row = extractJsonObject(text)
      const taskDetail = pickStr(row, 'taskDetail')
      const merchantRequirements = pickStr(row, 'merchantRequirements')
      const titleHint = pickStr(row, 'titleHint')
      if (!taskDetail && !merchantRequirements && !titleHint) continue
      return {
        titleHint,
        taskDetail,
        merchantRequirements,
        city: pickStr(row, 'city'),
        region: pickStr(row, 'region') || pickStr(row, 'city'),
        budgetHint: pickStr(row, 'budgetHint') || '面议',
        recruitPlatform: pickStr(row, 'recruitPlatform') || undefined,
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  if (errors.length) {
    console.warn('[form-relay-ai]', errors.slice(0, 2).join('; '))
  }
  return null
}
