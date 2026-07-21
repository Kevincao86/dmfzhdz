import { inferCityFromChineseAddress } from '../lib/douyinStoreCityResolve'
import { parseRecruitmentIntentFromText } from '../lib/aiAgentRecruitmentParse'
import type { AiRecruitmentBriefPreview } from '../lib/aiAgentTypes'
import { readMerchantSession } from '../lib/merchantSession'
import { getDouyinStores } from './douyinMerchantApi'
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
  /** 门店城市（地址推断）优先于话术城市 */
  storeCityResolved?: string
}

/**
 * 从抖音来客已认领门店地址推断城市（与 AI 运营方案同源）。
 * 达人方案写死：须先按此城读达人库，无同城则全国本地生活。
 */
export async function resolveStoreCityFromMerchantStores(): Promise<string> {
  try {
    const tok = readMerchantSession('meoo_douyin_merchant_token')
    if (!tok) return ''
    const mid = readMerchantSession('meoo_douyin_merchant_id') || undefined
    const r = await getDouyinStores({
      accessToken: tok,
      page: 1,
      pageSize: 30,
      merchantId: mid,
      claimScope: 'claimed',
      relationType: 'all',
    })
    if (!r.ok || !r.items.length) return ''
    for (const s of r.items) {
      const direct = String(s.city || '').trim()
      if (direct) return direct
      if (s.address) {
        const inferred = inferCityFromChineseAddress(s.address)
        if (inferred) return inferred
      }
      if (s.addressHierarchy) {
        const inferred = inferCityFromChineseAddress(s.addressHierarchy)
        if (inferred) return inferred
      }
    }
  } catch {
    /* ignore */
  }
  return ''
}

/** 智能体确认招募单前：按门店城市优先读达人库并分配档位人数 */
export async function buildAgentRecruitmentAllocation(
  userBrief: string,
  brief: AiRecruitmentBriefPreview,
  opts?: { storeCity?: string },
): Promise<AgentRecruitmentAllocationResult> {
  const intent = parseRecruitmentIntentFromText(userBrief)
  const packageNote = [brief.mainProductName, brief.briefText.slice(0, 400)].filter(Boolean).join('；')

  const storeCity =
    String(opts?.storeCity || '').trim() || (await resolveStoreCityFromMerchantStores())
  // 写死：门店地址城市 > 话术解析城市；都没有则空串，由库侧回退全国本地生活
  const city = storeCity || intent.city || ''
  intent.city = city || intent.city || '全国'

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
        storeCityResolved: storeCity || undefined,
      }
    }
    return { intent, allocation, storeCityResolved: storeCity || undefined }
  }

  let cityTierBands
  let cityTierSource: 'ai' | 'static' | undefined
  try {
    const tier = await resolveCityKolTierBandsSmart({
      city: city || '全国',
      industry: intent.industry,
    })
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
    city: city || '全国',
    industry: intent.industry,
    packageNote,
    budgetYuan: intent.budgetYuan,
    targetHeadcount: headcount,
    feeType: 'tier',
    kolCommissionPct: intent.kolCommissionPct,
    cityTierBands,
    platform: intent.platform,
  })

  return { intent, allocation, cityTierSource, storeCityResolved: storeCity || undefined }
}
