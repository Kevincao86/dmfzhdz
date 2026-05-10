import { postDouyinGoodsAiAssist, type AiModelId } from './douyinAiAssistApi'
import { readStoredAiModel } from './merchantAiModelStorage'

const FALLBACK_TAGS = [
  '招牌菜',
  '新品推荐',
  '限时特惠',
  '网红爆款',
  '健康轻食',
  '家庭套餐',
  '商务宴请',
  '情侣约会',
  '下午茶',
  '夜宵必点',
  '地方特色',
  '进口食材',
]

function parseJsonTags(text: string): string[] | null {
  const t = text.trim()
  const tryParse = (s: string) => {
    try {
      const j = JSON.parse(s) as unknown
      if (Array.isArray(j)) {
        return j.map((x) => String(x).trim()).filter(Boolean)
      }
      if (j && typeof j === 'object' && Array.isArray((j as { tags?: unknown }).tags)) {
        return ((j as { tags: unknown[] }).tags ?? []).map((x) => String(x).trim()).filter(Boolean)
      }
    } catch {
      /* ignore */
    }
    return null
  }
  const direct = tryParse(t)
  if (direct?.length) return direct.slice(0, 16)
  const m = t.match(/\[[\s\S]*\]/)
  if (m) {
    const inner = tryParse(m[0])
    if (inner?.length) return inner.slice(0, 16)
  }
  return null
}

/** 按当前绑定模型与行业，向 AI 请求 Brief 用商品/场景标签（失败则回退本地词表） */
export async function fetchIndustryProductTagsAi(industry: string): Promise<string[]> {
  const model = readStoredAiModel() as AiModelId
  const titleDraft = `经营行业：${industry || '餐饮'}。
请只输出一个 JSON 数组（字符串数组），包含 10～14 个适合「本地生活达人探店 Brief」的中文标签词。
示例：["招牌菜","限时特惠","商务宴请"]
除 JSON 外不要输出任何文字。`
  const r = await postDouyinGoodsAiAssist({
    model,
    action: 'operation_topic',
    product_name: `达人Brief标签｜${industry || '餐饮'}`,
    title_draft: titleDraft,
  })
  if (!r.ok || !r.description) return [...FALLBACK_TAGS]
  const parsed = parseJsonTags(r.description)
  if (parsed?.length) return Array.from(new Set(parsed))
  return [...FALLBACK_TAGS]
}

export type BriefProductPick = { id: string; name: string; priceYuan: number }

function splitThreeBriefs(description: string): [string, string, string] {
  const parts = description
    .split(/\|\|\|BREAK\|\|\|/g)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length >= 3) return [parts[0]!, parts[1]!, parts[2]!]
  const paras = description.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
  if (paras.length >= 3) return [paras[0]!, paras[1]!, paras[2]!]
  const one = description.trim() || '（模型未返回有效 Brief，请重试或检查 API Key）'
  const short = one.slice(0, Math.min(one.length, 420))
  return [
    `${short}\n\n【版本 A】侧重卖点与到店理由`,
    `${short}\n\n【版本 B】侧重场景体验与情绪共鸣`,
    `${short}\n\n【版本 C】侧重平台话题与传播钩子`,
  ]
}

/** 生成 3 版可复制的达人合作 Brief（单轮 operation_article，按分隔符解析） */
export async function generateThreeKolBriefs(args: {
  platformLabel: string
  industry: string
  main: BriefProductPick
  secondary?: BriefProductPick | null
  tags: string[]
}): Promise<[string, string, string]> {
  const model = readStoredAiModel() as AiModelId
  const sec = args.secondary
  const titleDraft = `你是达人商务与内容策划。请根据以下事实，写 3 个不同风格的「达人探店合作 Brief」，用于 ${args.platformLabel} 投放；行业：${args.industry || '餐饮'}。
主推商品：${args.main.name}（约 ¥${args.main.priceYuan}）
${sec ? `次推商品：${sec.name}（约 ¥${sec.priceYuan}）` : '无固定次推品。'}
已选标签：${args.tags.join('、')}

硬性输出格式：恰好三个文本块，块与块之间只用单独一行「|||BREAK|||」分隔（共出现两次分隔行）。不要 Markdown 标题符号，不要编号前缀。每块 200～380 字，语气与结构需明显不同。`

  const r = await postDouyinGoodsAiAssist({
    model,
    action: 'operation_article',
    product_name: `达人Brief｜${args.main.name}`,
    title_draft: titleDraft,
  })
  if (!r.ok || !r.description) {
    const tagLine = args.tags.slice(0, 5).join('、')
    const base = `【${args.main.name}｜¥${args.main.priceYuan}】围绕${tagLine}等标签，突出门店体验与转化点。`
    return [
      `${base}\n\n版本一：理性种草结构，先场景痛点再产品解决方案，适合测评口播。`,
      `${base}\n\n版本二：故事化叙事，强调同桌好友/家庭聚餐情绪，适合剧情短视频。`,
      `${base}\n\n版本三：热点话题+打卡清单体，适合图文与信息流切片。`,
    ]
  }
  return splitThreeBriefs(r.description)
}
