import { inferCityFromChineseAddress } from '../lib/douyinStoreCityResolve'
import { parseRecruitmentIntentFromText } from '../lib/aiAgentRecruitmentParse'
import type { AiRecruitmentBriefPreview } from '../lib/aiAgentTypes'
import {
  parseRegionToCityState,
  primaryRecruitmentCity,
} from '../lib/recruitmentCityPicker'
import type { RecruitmentPlatform } from '../lib/recruitmentPlatformOptions'
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
  opts?: {
    storeCity?: string
    budgetYuan?: number
    headcount?: number
    platform?: '抖音' | '小红书'
    platforms?: RecruitmentPlatform[]
    commissionPct?: number
  },
): Promise<AgentRecruitmentAllocationResult> {
  const intent = parseRecruitmentIntentFromText(userBrief)
  if (opts?.budgetYuan && opts.budgetYuan > 0) intent.budgetYuan = Math.round(opts.budgetYuan)
  if (opts?.headcount && opts.headcount > 0) intent.headcountHint = Math.round(opts.headcount)
  if (opts?.platform) intent.platform = opts.platform
  if (opts?.platforms?.length) {
    intent.platforms = opts.platforms
    intent.platform = opts.platforms.includes('抖音')
      ? '抖音'
      : opts.platforms.includes('小红书')
        ? '小红书'
        : intent.platform
  }
  if (opts?.commissionPct != null && Number.isFinite(opts.commissionPct)) {
    intent.kolCommissionPct = opts.commissionPct
  }
  const packageNote = [brief.mainProductName, brief.briefText.slice(0, 400)].filter(Boolean).join('；')

  const storeCityRaw =
    String(opts?.storeCity || '').trim() || (await resolveStoreCityFromMerchantStores())
  const cityState = storeCityRaw.trim()
    ? parseRegionToCityState(storeCityRaw)
    : { cityNational: false, selectedCities: [] as string[] }
  const region = cityState.cityNational
    ? '全国'
    : cityState.selectedCities.length
      ? cityState.selectedCities.join('、')
      : storeCityRaw
  const pricingCity = primaryRecruitmentCity(cityState.cityNational, cityState.selectedCities)
  // 写死：向导/星选城市（全国或多选）> 话术解析城市；档位测算用首城或全国
  const city = region || intent.city || ''
  intent.city = city || intent.city || '全国'
  const cityForAlloc = pricingCity || city || '全国'

  const useDouyinTiers = (intent.platforms?.length ? intent.platforms : [intent.platform]).includes('抖音')

  if (!useDouyinTiers) {
    const allocation = fallbackXiaohongshuNoviceAllocation(intent.budgetYuan)
    if (intent.headcountHint && intent.headcountHint > 0) {
      const total = intent.headcountHint
      const per = total > 0 ? Math.round(intent.budgetYuan / total) : 0
      return {
        intent,
        allocation: {
          ...allocation,
          v5plus: total,
          unitPrices: { v3: 0, v4: 0, v5: 0, v5plus: per },
          costHint: `招募 ${total} 人，车马费 ¥${per}/人。`,
        },
        storeCityResolved: region || storeCityRaw || undefined,
      }
    }
    return { intent, allocation, storeCityResolved: region || storeCityRaw || undefined }
  }

  let cityTierBands
  let cityTierSource: 'ai' | 'static' | undefined
  try {
    const tier = await resolveCityKolTierBandsSmart({
      city: cityForAlloc,
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
    city: cityForAlloc,
    industry: intent.industry,
    packageNote,
    budgetYuan: intent.budgetYuan,
    targetHeadcount: headcount,
    feeType: 'tier',
    kolCommissionPct: intent.kolCommissionPct,
    cityTierBands,
    platform: intent.platforms?.[0] || intent.platform,
  })

  return { intent, allocation, cityTierSource, storeCityResolved: region || storeCityRaw || undefined }
}
