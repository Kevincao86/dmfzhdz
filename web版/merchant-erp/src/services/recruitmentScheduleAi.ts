import { postDouyinGoodsAiAssist, type AiModelId } from './douyinAiAssistApi'
import type { RegistryScheduleRow } from '../lib/opsRegistryTypes'
import { readStoredAiModel } from './merchantAiModelStorage'

function parseScheduleJson(text: string): RegistryScheduleRow[] {
  const t = text.trim()
  const tryArr = (s: string): unknown[] | null => {
    try {
      const j = JSON.parse(s) as unknown
      return Array.isArray(j) ? j : null
    } catch {
      return null
    }
  }
  let arr = tryArr(t)
  if (!arr) {
    const m = t.match(/\[[\s\S]*\]/)
    if (m) arr = tryArr(m[0])
  }
  if (!arr?.length) return []
  const out: RegistryScheduleRow[] = []
  let i = 0
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const time = String(o.time ?? o.slot ?? '').trim()
    const talentName = String(o.talentName ?? o.name ?? '').trim()
    if (!time || !talentName) continue
    i += 1
    out.push({
      id: `sch-ai-${Date.now()}-${i}`,
      time,
      talentName,
      storeName: String(o.storeName ?? o.store ?? '门店').trim() || '门店',
      tableNote: String(o.tableNote ?? o.note ?? '').trim() || '—',
    })
  }
  return out.slice(0, 50)
}

/** 根据招募上下文生成排期行（调用已绑定文本模型；失败返回空数组） */
export async function generateRecruitmentScheduleRowsAi(context: string): Promise<RegistryScheduleRow[]> {
  const model = readStoredAiModel() as AiModelId
  const titleDraft = `你是本地生活达人探店排期助手。根据以下「招募上下文」生成按时间先后排序的探店排期表。
仅输出 JSON 数组，不要 Markdown、不要解释。每个元素字段：time（如 "5/10 17:00-20:00"）、talentName、storeName、tableNote。
若信息不足，仍按合理假设补全 talentName 与时段，至少 2 条、至多 12 条。

招募上下文：
${context.slice(0, 6000)}`

  const r = await postDouyinGoodsAiAssist({
    model,
    action: 'operation_article',
    product_name: '达人探店排期',
    title_draft: titleDraft,
  })
  if (!r.ok || !r.description) return []
  return parseScheduleJson(r.description)
}
