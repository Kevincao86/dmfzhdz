import { postDouyinGoodsAiAssist, type AiModelId } from './douyinAiAssistApi'
import { readStoredAiModel } from './merchantAiModelStorage'

/** 达人档位分配策略（影响 AI / 离线估算权重） */
export type KolTierStrategy = 'more_v3' | 'more_v4' | 'more_v5'

export type NoviceAllocation = {
  v3: number
  v4: number
  v5: number
  v5plus: number
  notes?: string
  costHint?: string
  source: 'ai' | 'fallback'
}

export function kolTierStrategyLabel(s: KolTierStrategy): string {
  if (s === 'more_v3') return 'V3 多一些（V4 / V5 相对较少）'
  if (s === 'more_v4') return 'V4 多一些（V3 / V5 相对较少）'
  return 'V5 及 V5 以上多一些（V3 / V4 相对较少）'
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)))
}

/** 离线估算：按预算与策略拆分档位人数（AI 不可用时使用） */
export function fallbackNoviceKolAllocation(budgetYuan: number, strategy: KolTierStrategy): NoviceAllocation {
  const b = Number.isFinite(budgetYuan) && budgetYuan > 0 ? budgetYuan : 0
  const totalPeople = clampInt(b / 1200, 3, 36)
  const w =
    strategy === 'more_v3'
      ? ([0.42, 0.32, 0.16, 0.1] as const)
      : strategy === 'more_v4'
        ? ([0.18, 0.42, 0.22, 0.18] as const)
        : ([0.12, 0.18, 0.3, 0.4] as const)
  let v3 = Math.round(totalPeople * w[0])
  let v4 = Math.round(totalPeople * w[1])
  let v5 = Math.round(totalPeople * w[2])
  let v5plus = Math.round(totalPeople * w[3])
  let gap = totalPeople - (v3 + v4 + v5 + v5plus)
  let guard = 0
  while (gap !== 0 && guard++ < 48) {
    if (gap > 0) {
      v5plus += 1
      gap -= 1
    } else if (v3 > 0) {
      v3 -= 1
      gap += 1
    } else if (v4 > 0) {
      v4 -= 1
      gap += 1
    } else if (v5 > 0) {
      v5 -= 1
      gap += 1
    } else if (v5plus > 0) {
      v5plus -= 1
      gap += 1
    } else {
      break
    }
  }
  return {
    v3: Math.max(0, v3),
    v4: Math.max(0, v4),
    v5: Math.max(0, v5),
    v5plus: Math.max(0, v5plus),
    notes: '当前为离线规则估算；连接 AI 成功后将结合城市行情优化。',
    costHint: `按总预算约 ¥${b.toLocaleString('zh-CN')}、合计约 ${v3 + v4 + v5 + v5plus} 人次档位建议（仅供参考）。`,
    source: 'fallback',
  }
}

function parseAllocationJson(text: string): Omit<NoviceAllocation, 'source'> | null {
  const t = text.trim()
  const tryObj = (s: string): Record<string, unknown> | null => {
    try {
      const j = JSON.parse(s) as unknown
      return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  let o = tryObj(t)
  if (!o) {
    const m = t.match(/\{[\s\S]*\}/)
    if (m) o = tryObj(m[0])
  }
  if (!o) return null
  const num = (k: string, alt: string[]) => {
    const keys = [k, ...alt]
    for (const key of keys) {
      const v = o![key]
      if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v))
      if (typeof v === 'string' && v.trim()) {
        const n = Number.parseInt(v.replace(/\D/g, ''), 10)
        if (Number.isFinite(n)) return Math.max(0, n)
      }
    }
    return null
  }
  const v3 = num('v3', ['V3', 'tier_v3'])
  const v4 = num('v4', ['V4', 'tier_v4'])
  const v5 = num('v5', ['V5', 'tier_v5'])
  const v5plus = num('v5plus', ['v5_plus', 'V5+', 'v5以上', 'tier_v5plus'])
  if (v3 === null || v4 === null || v5 === null || v5plus === null) return null
  const notes = typeof o.notes === 'string' ? o.notes : typeof o.summary === 'string' ? o.summary : undefined
  const costHint =
    typeof o.cost_hint === 'string'
      ? o.cost_hint
      : typeof o.costHint === 'string'
        ? o.costHint
        : undefined
  return { v3, v4, v5, v5plus, notes, costHint }
}

/**
 * 调用已绑定文本模型，结合城市 / 行业 / 套餐 / 预算与策略输出 JSON 档位人数。
 * 失败或未配置时由上层改用 fallback。
 */
export async function requestNoviceKolAllocationAi(params: {
  city: string
  industry: string
  packageNote: string
  budgetYuan: number
  strategy: KolTierStrategy
}): Promise<NoviceAllocation | null> {
  const model = readStoredAiModel() as AiModelId
  const stratZh = kolTierStrategyLabel(params.strategy)
  const titleDraft = `你是本地生活达人招募成本顾问。根据城市达人撮合的行情（可合理假设），为商家做一次「档位人数」分配建议。

硬性要求：
1. 仅输出一个 JSON 对象，不要 Markdown、不要代码围栏、不要解释正文外的文字。
2. 字段必须为：v3、v4、v5、v5plus（均为非负整数），可选 notes（一句话）、cost_hint（一句话说明成本假设）。
3. 总人数应与总预算量级相符；档位越高通常单人成本越高。
4. 策略偏好：${stratZh}

输入：
- 城市：${params.city.trim() || '未填'}
- 行业：${params.industry.trim()}
- 套餐/项目说明：${params.packageNote.trim().slice(0, 800)}
- 总预算（元）：${params.budgetYuan}

请输出 JSON。`

  const r = await postDouyinGoodsAiAssist({
    model,
    action: 'operation_article',
    product_name: '达人档位分配',
    title_draft: titleDraft,
  })
  if (!r.ok || !r.description) return null
  const parsed = parseAllocationJson(r.description)
  if (!parsed) return null
  const sum = parsed.v3 + parsed.v4 + parsed.v5 + parsed.v5plus
  if (sum <= 0) return null
  return { ...parsed, source: 'ai' }
}

/** AI + 离线兜底 */
export async function generateNoviceKolAllocation(params: {
  city: string
  industry: string
  packageNote: string
  budgetYuan: number
  strategy: KolTierStrategy
}): Promise<NoviceAllocation> {
  try {
    const ai = await requestNoviceKolAllocationAi(params)
    if (ai) return ai
  } catch {
    /* ignore */
  }
  return fallbackNoviceKolAllocation(params.budgetYuan, params.strategy)
}
