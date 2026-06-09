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

  const headcount =
    intent.headcountHint && intent.headcountHint > 0
      ? intent.headcountHint
      : Math.max(3, Math.min(36, Math.round(intent.budgetYuan / 1200)))

  const allocation = await generateNoviceKolAllocation({
    city,
    industry: intent.industry,
    packageNote,
    budgetYuan: intent.budgetYuan,
    targetHeadcount: headcount,
    feeType: 'tier',
    kolCommissionPct: intent.kolCommissionPct,
    cityTierBands,
  })

  return { intent, allocation, cityTierSource }
}
