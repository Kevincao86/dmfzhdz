import type { AiTaskType } from './aiAgentTypes'

const ACTION_TO_TASK: Record<string, AiTaskType> = {
  create_product: 'create_product',
  recruit_influencer: 'recruit_influencer',
  handle_review: 'handle_review',
  sync_platform: 'sync_platform',
  analyze_exception: 'analyze_exception',
  generate_copywriting: 'generate_copywriting',
}

/** 从用户话术推断任务类型（与 scheduleTaskPreview 共用） */
export function inferTaskTypeFromText(t: string): AiTaskType | undefined {
  const x = t.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  if (/创建|商品|套餐|上架|双人|单人|火锅|团购|代金券|代\s*\d+|抵\s*\d+|券面|上传.*(商品|套餐|券)/.test(x)) {
    return 'create_product'
  }
  if (/达人|招募|探店|brief|Brief|种草|探店笔记/.test(x)) return 'recruit_influencer'
  if (/差评|评价|评论/.test(x)) return 'handle_review'
  if (/分析|原因|异常/.test(x)) return 'analyze_exception'
  if (/同步|失败/.test(x)) return 'sync_platform'
  return undefined
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  const t = raw.trim()
  const candidates: string[] = []
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) candidates.push(fence[1].trim())
  const brace = t.match(/\{[\s\S]*\}/)
  if (brace?.[0]) candidates.push(brace[0])
  candidates.push(t)
  for (const s of candidates) {
    try {
      const j = JSON.parse(s) as unknown
      if (j && typeof j === 'object' && !Array.isArray(j)) return j as Record<string, unknown>
    } catch {
      /* next */
    }
  }
  return null
}

/** 从助手回复中的 JSON 预览块解析 actionType */
export function parseAgentActionType(content: string): AiTaskType | undefined {
  const j = tryParseJsonObject(content)
  if (!j) return undefined
  const at = String(j.actionType ?? j.action_type ?? '').trim()
  return ACTION_TO_TASK[at]
}

export function parseAgentPreviewTitle(content: string): string | undefined {
  const j = tryParseJsonObject(content)
  if (!j) return undefined
  const title = j.title
  return typeof title === 'string' && title.trim() ? title.trim() : undefined
}

/** 助手返回结构化预览 JSON 时，用简短中文替代整段 JSON 展示 */
export function summarizeAssistantContent(content: string): string | null {
  const taskType = parseAgentActionType(content)
  if (!taskType) return null
  const title = parseAgentPreviewTitle(content)
  switch (taskType) {
    case 'create_product':
      return title || '已理解您的上架需求，请在下方核对抖音 C 端手机预览并确认。'
    case 'recruit_influencer':
      return title || '已理解您的达人招募需求，请在下方查看图文 Brief 并确认。'
    default:
      return title || '请在下方确认执行预览后继续。'
  }
}

/** 从用户描述提取商品名/标题草稿 */
export function briefProductNameHint(text: string): string {
  const x = text.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  const voucher = x.match(/\d+\s*代\s*\d+[^，。.\n]{0,12}?(?:代金券|券)?/)
  if (voucher?.[0]) return voucher[0].replace(/\s+/g, '')
  const m = x.match(/(?:上传|创建|上架)(?:一个|一款)?(.{2,40}?)(?:商品|套餐|券|$)/)
  if (m?.[1]) return m[1].trim().slice(0, 48)
  return x.slice(0, 48) || '商品方案'
}

export function inferVoucherPricesFromText(text: string): { price?: number; origin?: number } {
  const m = text.match(/(\d+)\s*代\s*(\d+)/)
  if (!m) return {}
  const price = Number(m[1])
  const origin = Number(m[2])
  if (!Number.isFinite(price) || !Number.isFinite(origin)) return {}
  return { price, origin }
}
