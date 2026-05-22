import { parseRecruitmentIntentFromText } from '../lib/aiAgentRecruitmentParse'
import type { AiRecruitmentBriefPreview } from '../lib/aiAgentTypes'
import {
  fallbackXiaohongshuNoviceAllocation,
  generateNoviceKolAllocation,
  resolveCityKolTierBandsSmart,
  type NoviceAllocation,
} from './recruitmentNoviceAllocationAi'

export type AgentRecruitmentAllocationResult = {
  intent: ReturnType<typeof parseRecruitmentIntentFromText>
  allocation: NoviceAllocation
  cityTierSource?: 'ai' | 'static'
}

/** 智能体确认招募单前：按用户需求 AI 分配达人档位人数 */
export async function buildAgentRecruitmentAllocation(
  userBrief: string,
  brief: AiRecruitmentBriefPreview,
): Promise<AgentRecruitmentAllocationResult> {
  const intent = parseRecruitmentIntentFromText(userBrief)
  const packageNote = [brief.mainProductName, brief.briefText.slice(0, 400)].filter(Boolean).join('；')
  const city = intent.city || '本地'

  if (intent.platform === '小红书') {
    const allocation = fallbackXiaohongshuNoviceAllocation(intent.budgetYuan)
    if (intent.headcountHint && intent.headcountHint > 0) {
      const total = intent.headcountHint
      return {
        intent,
        allocation: {
          ...allocation,
          v5plus: total,
          costHint: `按您的目标约 ${total} 位小红书达人，预算 ¥${intent.budgetYuan.toLocaleString('zh-CN')}（智能体解析）。`,
        },
      }
    }
    return { intent, allocation }
  }

  let cityTierBands
  let cityTierSource: 'ai' | 'static' | undefined
  try {
    const tier = await resolveCityKolTierBandsSmart({ city, industry: intent.industry })
    cityTierBands = tier.bands
    cityTierSource = tier.source
  } catch {
    /* ignore */
  }

  let allocation = await generateNoviceKolAllocation({
    city,
    industry: intent.industry,
    packageNote,
    budgetYuan: intent.budgetYuan,
    strategy: intent.strategy,
    kolCommissionPct: intent.kolCommissionPct,
    cityTierBands,
  })

  if (intent.headcountHint && intent.headcountHint > 0) {
    const target = intent.headcountHint
    const cur = allocation.v3 + allocation.v4 + allocation.v5 + allocation.v5plus
    if (cur > 0 && cur !== target) {
      const scale = target / cur
      allocation = {
        ...allocation,
        v3: Math.max(0, Math.round(allocation.v3 * scale)),
        v4: Math.max(0, Math.round(allocation.v4 * scale)),
        v5: Math.max(0, Math.round(allocation.v5 * scale)),
        v5plus: Math.max(0, Math.round(allocation.v5plus * scale)),
        notes: [allocation.notes, `已按您指定的约 ${target} 人目标微调档位人数。`].filter(Boolean).join(' '),
      }
      let gap = target - (allocation.v3 + allocation.v4 + allocation.v5 + allocation.v5plus)
      let guard = 0
      while (gap !== 0 && guard++ < 48) {
        if (gap > 0) {
          allocation = { ...allocation, v5plus: allocation.v5plus + 1 }
          gap -= 1
        } else if (allocation.v3 > 0) {
          allocation = { ...allocation, v3: allocation.v3 - 1 }
          gap += 1
        } else if (allocation.v4 > 0) {
          allocation = { ...allocation, v4: allocation.v4 - 1 }
          gap += 1
        } else {
          break
        }
      }
    }
  }

  return { intent, allocation, cityTierSource }
}
