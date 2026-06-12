/**
 * 招募单分享海报：LLM 生成配色与主视觉文案（模版仍由前端 Canvas 绘制）
 */
import { merchantAgentChatFromMessages } from '../../vite-plugins/merchantAiUpstream.js'
import type { PosterDesignTokens } from './recruitmentSharePosterCore.js'
import {
  defaultPosterDesign,
  extractPosterFieldsFromOrder,
  mergePosterDesign,
} from './recruitmentSharePosterCore.js'

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

const SYSTEM = `你是灵祺星选招募单分享海报设计助手。根据商单信息输出严格 JSON（不要 markdown）：
{
  "templateId": "default-v1",
  "accentColor": "#FE2C55",
  "accentLight": "#FFF1F2",
  "heroTitle": "小红书\\n达人招募",
  "heroSubtitle": "可选副标题，8字内；无则空字符串",
  "inviterSuffix": "邀请你报名通告!"
}
规则：
- accentColor 须为 6 位 hex，与平台/行业气质匹配（小红书偏红、抖音偏黑、餐饮偏暖色）
- heroTitle 两行时用 \\n 分隔，第一行平台或品类，第二行「达人招募」或「探店招募」等
- 勿编造金额；inviterSuffix 保持礼貌简短
- 无法判断时用平台默认色`

export async function designRecruitmentSharePosterWithAi(
  env: Record<string, string>,
  order: Record<string, unknown>,
): Promise<PosterDesignTokens> {
  const fields = extractPosterFieldsFromOrder(order)
  const fallback = defaultPosterDesign(order, fields)
  const qwenKey = (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
  const doubaoKey = (env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY ?? '').trim()
  if (!qwenKey && !doubaoKey) return fallback

  const info = String(order.recruitmentInfo || order.taskDetail || '').slice(0, 2000)
  const user = [
    `标题：${fields.title}`,
    `平台：${fields.platform}`,
    `城市：${fields.cityText}`,
    `费用：${fields.feeTypeText}`,
    `粉丝：${fields.fansText}`,
    `发布方：${fields.inviterName}`,
    `招募信息节选：\n${info}`,
  ].join('\n')

  for (const provider of ['doubao', 'qwen'] as const) {
    const key = provider === 'doubao' ? doubaoKey : qwenKey
    if (!key) continue
    try {
      const { text } = await merchantAgentChatFromMessages(env, provider, undefined, SYSTEM, user)
      const row = extractJsonObject(text)
      return mergePosterDesign(
        {
          templateId: pickStr(row, 'templateId'),
          accentColor: pickStr(row, 'accentColor'),
          accentLight: pickStr(row, 'accentLight'),
          heroTitle: pickStr(row, 'heroTitle'),
          heroSubtitle: pickStr(row, 'heroSubtitle'),
          inviterSuffix: pickStr(row, 'inviterSuffix'),
        },
        fallback,
      )
    } catch {
      /* try next provider */
    }
  }
  return fallback
}
