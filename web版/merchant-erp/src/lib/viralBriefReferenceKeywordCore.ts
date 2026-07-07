/**
 * 根据已生成 Brief 正文，用 AI 提炼外网视频/图片检索关键词（不用招募单名称）。
 */
import type { ViralBriefPlatform } from '../services/viralBriefAi.js'
import {
  merchantChatCompletionWithVendorFailover,
  type MerchantAiEnv,
} from '../../vite-plugins/merchantAiUpstream.js'

const PLAT_LABELS: Record<ViralBriefPlatform, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  dianping: '大众点评',
  channels: '微信视频号',
  kuaishou: '快手',
}

export type BriefContentForSearch = {
  platform: ViralBriefPlatform
  styleLabel?: string
  requirementSummary?: string
  hooks?: string[]
  titles?: string[]
  topics?: string[]
  mustMention?: string[]
  forbidden?: string[]
  structure?: Array<{ scene?: string; visual?: string; voice?: string }>
  openingParagraph?: string
  bodySections?: Array<{ heading?: string; content?: string }>
  fullCopy?: string
}

function norm(s: unknown): string {
  return String(s || '').trim()
}

function uniqueStrings(items: string[]): string[] {
  const out: string[] = []
  for (const raw of items) {
    const t = norm(raw)
    if (!t || out.includes(t)) continue
    out.push(t)
  }
  return out
}

/** 将 Brief 正文压成 AI 可读摘要（不含招募标题/门店名优先） */
export function buildBriefDigestForKeywordAi(brief: BriefContentForSearch): string {
  const lines: string[] = []
  if (brief.styleLabel) lines.push(`内容风格：${brief.styleLabel}`)
  if (brief.requirementSummary) lines.push(`需求摘要：${brief.requirementSummary}`)
  if (brief.hooks?.length) lines.push(`钩子：${brief.hooks.slice(0, 3).join('；')}`)
  if (brief.titles?.length) lines.push(`标题方向：${brief.titles.slice(0, 3).join('；')}`)
  if (brief.topics?.length) lines.push(`话题标签：${brief.topics.slice(0, 6).join(' ')}`)
  if (brief.mustMention?.length) lines.push(`必提卖点：${brief.mustMention.slice(0, 5).join('；')}`)
  if (brief.structure?.length) {
    const scenes = brief.structure
      .slice(0, 4)
      .map((s) => `${norm(s.scene)}｜画面:${norm(s.visual)}`)
      .filter((x) => x.length > 2)
    if (scenes.length) lines.push(`分镜场景：${scenes.join('；')}`)
  }
  if (brief.openingParagraph) lines.push(`开篇：${brief.openingParagraph.slice(0, 200)}`)
  if (brief.bodySections?.length) {
    const sec = brief.bodySections
      .slice(0, 2)
      .map((s) => `${norm(s.heading)}:${norm(s.content).slice(0, 120)}`)
      .join('；')
    if (sec) lines.push(`正文段落：${sec}`)
  }
  if (brief.fullCopy) lines.push(`完整文稿摘录：${brief.fullCopy.slice(0, 280)}`)
  return lines.join('\n').slice(0, 1800)
}

function parseAiQueryJson(text: string): string[] {
  const t = norm(text)
  if (!t) return []
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as Record<string, unknown>
    } catch {
      return null
    }
  }
  let j = tryParse(t)
  if (!j) {
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence) j = tryParse(fence[1]!.trim())
  }
  if (!j) {
    const obj = t.match(/\{[\s\S]*\}/)
    if (obj) j = tryParse(obj[0]!)
  }
  if (!j) return []
  const raw = j.queries ?? j.keywords ?? j.searchQueries
  if (!Array.isArray(raw)) return []
  return uniqueStrings(raw.map((x) => norm(x)).filter((x) => x.length >= 2 && x.length <= 40)).slice(0, 3)
}

const KEYWORD_SYSTEM = `你是短视频内容检索助手。根据用户给出的「已生成 Brief 正文」，提炼 2～3 条适合在抖音/小红书搜索同类参考视频的关键词。

要求：
1. 只根据 Brief 里的场景、氛围、活动类型、拍摄手法、受众、话题标签提炼，不要把商家门店全名、招募单标题原样当作检索词。
2. 每条 4～14 个汉字（可含 1～2 个核心英文/数字），适合平台搜索框。
3. 覆盖：①视频案例检索词 ②可再有一条偏「拍摄场景/氛围」的检索词。
4. 只输出一个 JSON 对象，不要其它文字：{"queries":["词1","词2","词3"]}`

/** AI 提炼检索词；失败返回空数组 */
export async function extractBriefSearchQueriesWithAi(
  env: MerchantAiEnv,
  brief: BriefContentForSearch,
): Promise<string[]> {
  const digest = buildBriefDigestForKeywordAi(brief)
  if (digest.length < 12) return []

  const platLabel =
    brief.platform === 'douyin'
      ? '抖音'
      : brief.platform === 'xiaohongshu'
        ? '小红书'
        : brief.platform === 'kuaishou'
          ? '快手'
          : '短视频'

  const user = [
    `目标平台：${platLabel}`,
    '',
    '【Brief 正文】',
    digest,
    '',
    '请输出 JSON：{"queries":["...","..."]}',
  ].join('\n')

  const r = await merchantChatCompletionWithVendorFailover(env, {}, 'doubao', KEYWORD_SYSTEM, user)
  if (!r.ok) return []
  return parseAiQueryJson(r.text)
}

/** 无 AI 时：仅从 Brief 字段规则提炼（不用招募单名） */
export function buildBriefWebSearchQueriesFromContent(input: {
  platform: ViralBriefPlatform
  brief: BriefContentForSearch
}): string[] {
  const plat = PLAT_LABELS[input.platform] || '短视频'
  const b = input.brief
  const bits = uniqueStrings([
    ...(b.hooks || []).slice(0, 2),
    ...(b.topics || []).map((t) => t.replace(/^#/, '')).slice(0, 3),
    ...(b.titles || []).slice(0, 1),
    ...(b.mustMention || []).slice(0, 2),
    ...(b.structure || []).map((s) => norm(s.visual) || norm(s.scene)).slice(0, 2),
    b.styleLabel || '',
  ])
  const summary = norm(b.requirementSummary).replace(/招募|探店|达人/g, '').slice(0, 60)
  const queries = uniqueStrings([
    bits.filter((x) => x.length >= 2).slice(0, 3).join(' '),
    summary.length >= 4 ? `${summary} ${plat}` : '',
    bits.length >= 2 ? `${bits[0]} ${bits[1]} ${plat}` : '',
  ]).slice(0, 3)
  return queries.length ? queries : [`${plat} 氛围感 短视频`]
}
