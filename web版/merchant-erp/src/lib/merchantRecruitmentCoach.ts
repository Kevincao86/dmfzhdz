import {
  inferKolTierFromApplicant,
  usesPerTierCounterSelect,
  type KolTierKey,
} from './merchantRecruitmentTierPlan'
import type {
  RegistryMpRecruitmentApplicant,
  RegistryRecruitmentOrder,
  RecruitmentTierPlan,
  RecruitmentWorkflowStage,
} from './opsRegistryTypes'

export type MerchantRecruitHubScreen = 'createPick' | 'confirm' | 'schedule' | 'review' | 'payment'

export type MerchantRecruitCoach = {
  nextTitle: string
  nextHint: string
  nextView: MerchantRecruitHubScreen
  cta: string
}

const STAGE_RANK: Record<RecruitmentWorkflowStage, number> = {
  submitted: 0,
  recruiting: 1,
  selecting: 2,
  group_notify: 3,
  scheduling: 4,
  video_review: 5,
  payment_pending: 6,
  payment_ops: 7,
  completed: 8,
}

function stageOf(
  order: Pick<RegistryRecruitmentOrder, 'workflowStage' | 'linkedMpOrderId' | 'status'> | null,
): RecruitmentWorkflowStage | null {
  if (!order) return null
  if (order.status === 'done') return 'completed'
  if (order.workflowStage) return order.workflowStage
  if (order.linkedMpOrderId) return 'recruiting'
  if (order.status === 'accepted') return 'recruiting'
  return 'submitted'
}

function rank(stage: RecruitmentWorkflowStage | null): number {
  if (!stage) return -1
  return STAGE_RANK[stage] ?? -1
}

export function isHubScreenUnlocked(
  screen: MerchantRecruitHubScreen,
  order: Pick<RegistryRecruitmentOrder, 'workflowStage' | 'linkedMpOrderId' | 'status'> | null,
): boolean {
  if (screen === 'createPick') return true
  const r = rank(stageOf(order))
  if (screen === 'confirm') return r >= STAGE_RANK.recruiting || Boolean(order?.linkedMpOrderId)
  if (screen === 'schedule') return r >= STAGE_RANK.group_notify
  if (screen === 'review') return r >= STAGE_RANK.scheduling
  if (screen === 'payment') return r >= STAGE_RANK.video_review
  return false
}

export function coachFromOrder(
  order: Pick<RegistryRecruitmentOrder, 'workflowStage' | 'linkedMpOrderId' | 'status'> | null,
): MerchantRecruitCoach {
  const stage = stageOf(order)
  if (!order || !stage || stage === 'submitted') {
    return {
      nextTitle: '发布招募到星选大厅',
      nextHint: '用新手版或智能体生成 Brief 与档位，确认后达人即可在星选报名。',
      nextView: 'createPick',
      cta: '去发布',
    }
  }
  if (stage === 'recruiting' || stage === 'selecting') {
    return {
      nextTitle: '按档位反选达人',
      nextHint: '星选有人报名后，对照 AI 建议勾选，再上传群码通知入选达人。',
      nextView: 'confirm',
      cta: '去反选',
    }
  }
  if (stage === 'group_notify') {
    return {
      nextTitle: '上传群码并通知达人',
      nextHint: '反选已保存。上传项目群二维码后点通知，达人会在星选站内信收到群码。',
      nextView: 'confirm',
      cta: '继续通知',
    }
  }
  if (stage === 'scheduling') {
    return {
      nextTitle: '确认探店排期',
      nextHint: '填写餐食与时段，用 AI 生成排期并下发到星选达人日历。',
      nextView: 'schedule',
      cta: '去排期',
    }
  }
  if (stage === 'video_review') {
    return {
      nextTitle: '审核成片',
      nextHint: '达人在星选上传成片后，在本页通过或驳回重传。',
      nextView: 'review',
      cta: '去审片',
    }
  }
  if (stage === 'payment_pending' || stage === 'payment_ops') {
    return {
      nextTitle: '核对结算打款',
      nextHint: '导出支付宝明细并确认应付。运营确认已打款后订单完结。',
      nextView: 'payment',
      cta: '去结算',
    }
  }
  return {
    nextTitle: '本单已完结',
    nextHint: '可再发一单新的星选招募。',
    nextView: 'createPick',
    cta: '再发一单',
  }
}

function quoteYuan(raw: string | undefined): number {
  const n = Number(String(raw || '').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function applicantScore(a: RegistryMpRecruitmentApplicant, unitPriceYuan: number): number {
  let s = 40
  const fans = Number(a.followers) || 0
  if (fans >= 100_000) s += 18
  else if (fans >= 50_000) s += 14
  else if (fans >= 10_000) s += 10
  else if (fans >= 3_000) s += 6
  if (a.quotePrice) s += 8
  if (unitPriceYuan > 0 && quoteYuan(a.quotePrice) > 0) {
    const q = quoteYuan(a.quotePrice)
    if (q <= unitPriceYuan * 1.15) s += 10
    else if (q > unitPriceYuan * 1.6) s -= 12
  }
  if (a.alipayAccount) s += 6
  if (a.contact || a.wechatId) s += 4
  const lv = String(a.douyinSalesLevel || '')
  if (/L[4-9]|L6\+|L10/i.test(lv)) s += 6
  if (a.intro && a.intro.trim().length >= 12) s += 4
  return Math.max(0, Math.min(99, s))
}

export type ApplicantSuggest = {
  id: string
  score: number
  reason: string
}

/** 按档位配额给出建议入选名单，不自动勾选 */
export function suggestApplicantsForPlan(
  applicants: RegistryMpRecruitmentApplicant[],
  plan: RecruitmentTierPlan | undefined,
): ApplicantSuggest[] {
  const reasonOf = (score: number) =>
    score >= 70 ? '粉量与报价更贴近本档' : score >= 55 ? '资料较全，可优先考虑' : '备选'

  if (!plan || !usesPerTierCounterSelect(plan)) {
    const fallback = Math.max(1, Math.min(3, applicants.length))
    const cap = Math.max(1, plan?.totalHeadcount ?? fallback)
    const unit = plan?.fixedPriceYuan ?? 0
    return applicants
      .map((a) => ({
        id: String(a.id),
        score: applicantScore(a, unit),
        reason: '',
      }))
      .sort((x, y) => y.score - x.score)
      .slice(0, Math.min(cap, applicants.length))
      .map((row) => ({ ...row, reason: reasonOf(row.score) }))
  }

  const out: ApplicantSuggest[] = []
  const tiers: KolTierKey[] = ['v3', 'v4', 'v5', 'v5plus']
  for (const tier of tiers) {
    const cap = plan.tiers?.[tier]?.count ?? 0
    if (cap <= 0) continue
    const unit = plan.tiers?.[tier]?.unitPriceYuan ?? 0
    const ranked = applicants
      .filter((a) => inferKolTierFromApplicant(a) === tier)
      .map((a) => ({
        a,
        score: applicantScore(a, unit),
      }))
      .sort((x, y) => y.score - x.score || (y.a.followers || 0) - (x.a.followers || 0))
    for (const row of ranked.slice(0, cap)) {
      out.push({
        id: String(row.a.id),
        score: row.score,
        reason: reasonOf(row.score),
      })
    }
  }
  return out
}
