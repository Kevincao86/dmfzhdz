import type { RegistryMpRecruitmentOrder } from './opsRegistryTypes'

export type RecruitOrderPickerRow = {
  id: string
  title: string
  platform: string
  region: string
  category: string
  recruitContent: string
  searchText: string
}

export function buildRecruitContentForAi(mp: RegistryMpRecruitmentOrder): string {
  const parts: string[] = []
  const title = String(mp.title || '').trim()
  if (title) parts.push(`招募标题：${title}`)
  const req = String(mp.merchantRequirements || '').trim()
  if (req) parts.push(`招募要求：${req}`)
  const info = String(mp.recruitmentInfo || '').trim()
  if (info) parts.push(`招募说明：${info}`)
  const task = String(mp.taskDetail || '').trim()
  if (task) parts.push(`任务详情：${task}`)
  return parts.join('\n').slice(0, 2400)
}

export function mapRecruitOrderPickerRow(mp: RegistryMpRecruitmentOrder): RecruitOrderPickerRow {
  const platform = String(mp.platform || mp.recruitmentPlatform || '抖音').trim() || '抖音'
  const title = String(mp.title || mp.customerName || mp.id || '').trim()
  const region = String(mp.region || mp.storeName || '').trim()
  const category = String(mp.category || '本地生活').trim()
  const recruitContent = buildRecruitContentForAi(mp)
  return {
    id: String(mp.id || '').trim(),
    title,
    platform,
    region,
    category,
    recruitContent,
    searchText: [mp.id, title, region, category, mp.merchantRequirements, mp.recruitmentInfo, mp.taskDetail]
      .join(' ')
      .toLowerCase(),
  }
}

export function filterRecruitOrderRows(rows: RecruitOrderPickerRow[], keyword: string): RecruitOrderPickerRow[] {
  const q = String(keyword || '').trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => r.searchText.includes(q))
}

export function buildContextProductName(order: RecruitOrderPickerRow | null): string {
  if (!order) return '抖音；招募订单：（未选择）'
  return `${order.platform}；招募订单：${order.title || order.id}；区域：${order.region || '—'}；品类：${order.category || '—'}`
}

export function buildTitleDraftFromOrder(
  order: RecruitOrderPickerRow | null,
  mode: 'article' | 'topic' | 'brief',
  extra?: string,
): string {
  const base = String(order?.recruitContent || '').trim()
  const hint = String(extra || '').trim()
  if (mode === 'article') {
    return [
      '请根据下列招募订单实际情况，撰写适合抖音发布的图文稿件。',
      hint ? `补充要点：${hint}` : '',
      '',
      base || '（订单详情为空）',
    ]
      .filter(Boolean)
      .join('\n')
  }
  if (mode === 'topic') {
    return [
      '请根据下列招募订单实际情况，推荐 5–8 条本周短视频选题。',
      hint ? `经营侧重：${hint}` : '',
      '',
      base || '（订单详情为空）',
    ]
      .filter(Boolean)
      .join('\n')
  }
  return [
    '请输出云剪 Brief：【剪辑指令】与【字幕文案】两段。',
    hint ? `补充：${hint}` : '',
    '',
    base,
  ]
    .filter(Boolean)
    .join('\n')
}
