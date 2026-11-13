import {
  douyinCpsPlanNameFromRecruitment,
  douyinCpsPlanTimeRangeSec,
  extractDouyinTalentId,
  isLikelyDouyinTalentId,
} from '@merchant/lib/douyinCpsShared'
import type { MpLinkeLinkage, RecruitmentCpsLinkage } from '@merchant/lib/opsRegistryTypes'
import { patchMpRecruitmentOrder } from '../mpApi'
import {
  buildCpsTalentSettlements,
  douyinCpsCommissionRateFromPct,
  resolveCommissionPct,
} from './prApplicantSettlementPrice'
import { savePrDouyinVideoOrientedPlan } from './prDouyinLinkeApi'
import { findPrDouyinLinkeClient } from './prDouyinLinkeStore'

function readLinkeLinkage(mpOrder: Record<string, unknown>): MpLinkeLinkage | null {
  const meta =
    mpOrder.mpPublishMeta && typeof mpOrder.mpPublishMeta === 'object'
      ? (mpOrder.mpPublishMeta as Record<string, unknown>)
      : {}
  const raw = meta.linkeLinkage
  if (!raw || typeof raw !== 'object') return null
  const l = raw as MpLinkeLinkage
  if (!l.enabled || !l.clientId) return null
  return l
}

export function isPrLinkeOrder(mpOrder: Record<string, unknown>): boolean {
  return !!readLinkeLinkage(mpOrder)
}

export function shouldAutoSyncPrLinkeCps(
  mpOrder: Record<string, unknown>,
  selectedIds: string[],
): boolean {
  const linke = readLinkeLinkage(mpOrder)
  if (!linke) return false
  const recruitCount = Math.max(1, Number(mpOrder.recruitCount) || 1)
  return selectedIds.length >= recruitCount
}

export type PrLinkeCpsSyncResult =
  | { ok: true; planId: string; message: string }
  | { ok: false; message: string; skipped?: boolean }

/** 通知已选达人且满员后：自动在林客端创建定向招募 */
export async function autoSyncPrLinkeCpsOnNotify(params: {
  mpOrder: Record<string, unknown>
  selectedApplicantIds: string[]
  applicants: Record<string, unknown>[]
  merchantPhoneFallback?: string
}): Promise<PrLinkeCpsSyncResult> {
  const { mpOrder, selectedApplicantIds, applicants, merchantPhoneFallback } = params
  const linke = readLinkeLinkage(mpOrder)
  if (!linke) return { ok: false, message: '未挂接林客', skipped: true }

  const existing = mpOrder.cpsLinkage as RecruitmentCpsLinkage | undefined
  if (existing?.syncStatus === 'synced' && existing.planId) {
    return { ok: true, planId: existing.planId, message: '林客定向计划已同步' }
  }

  const client = findPrDouyinLinkeClient(linke.clientId)
  if (!client) return { ok: false, message: '林客客户商家绑定已失效，请重新绑定' }

  const idSet = new Set(selectedApplicantIds.map(String))
  const selected = applicants.filter((a) => idSet.has(String(a.id)))
  const douyinIds = [
    ...new Set(
      selected
        .map((a) =>
          extractDouyinTalentId({
            platformAccount: String(a.platformAccount || ''),
            platformNickname: String(a.platformNickname || a.name || ''),
            name: String(a.name || ''),
          }),
        )
        .filter((id) => id && isLikelyDouyinTalentId(id)),
    ),
  ]
  if (!douyinIds.length) {
    return { ok: false, message: '已选达人缺少有效抖音号，无法同步林客定向招募' }
  }

  const productIds = (linke.productIds ?? []).map(String).filter(Boolean)
  if (!productIds.length) {
    return { ok: false, message: '发单时未选择林客团购商品，请在发单编辑中补全商品后再通知' }
  }

  const phone = String(linke.merchantPhone || merchantPhoneFallback || '').trim()
  if (!/^1\d{10}$/.test(phone)) {
    return { ok: false, message: '缺少有效商家联系电话（11 位手机号）' }
  }

  const commissionPct = resolveCommissionPct(mpOrder)
  const rate = douyinCpsCommissionRateFromPct(commissionPct)
  const talentSettlements = buildCpsTalentSettlements(mpOrder, selected)
  const mpId = String(mpOrder.id || '')
  const planName = douyinCpsPlanNameFromRecruitment(
    String(mpOrder.title || mpOrder.customerName || ''),
    mpId,
  )
  const { startSec, endSec } = douyinCpsPlanTimeRangeSec({
    recruitStart: String(mpOrder.createdAt || ''),
    recruitEnd: String(mpOrder.deadline || ''),
  })

  const pendingLinkage: RecruitmentCpsLinkage = {
    provider: 'douyin',
    planType: 'video_oriented',
    planId: existing?.planId,
    productIds,
    douyinIds,
    commissionRatePct: commissionPct,
    commissionDurationDays: 30,
    merchantPhone: phone,
    linkeMerchantAccountId: client.merchantAccountId,
    linkeMerchantDisplayName: linke.merchantDisplayName || client.accountDisplayName,
    talentSettlements,
    syncStatus: 'pending',
    lastSyncAt: new Date().toISOString(),
  }

  await patchMpRecruitmentOrder({ id: mpId, cpsLinkage: pendingLinkage })

  const save = await savePrDouyinVideoOrientedPlan(client, {
    plan_id: existing?.planId,
    plan_name: planName,
    merchant_phone: phone,
    douyin_id_list: douyinIds,
    product_list: productIds.map((product_id) => ({ product_id, commission_rate: rate })),
    start_time: startSec,
    end_time: endSec,
    commission_duration: 30,
  })

  if (!save.ok) {
    await patchMpRecruitmentOrder({
      id: mpId,
      cpsLinkage: { ...pendingLinkage, syncStatus: 'failed', lastError: save.message },
    })
    return { ok: false, message: save.message }
  }

  await patchMpRecruitmentOrder({
    id: mpId,
    cpsLinkage: {
      ...pendingLinkage,
      planId: save.planId,
      syncStatus: 'synced',
      lastError: undefined,
    },
  })

  return {
    ok: true,
    planId: save.planId,
    message: `已在林客端创建定向招募（计划 ${save.planId}），达人佣金 ${commissionPct}%`,
  }
}

/** 全部已选达人回传视频后，标记需林客结算提醒 */
export async function maybeFlagPrLinkeSettlementReminder(
  mpOrder: Record<string, unknown>,
  applicants: Record<string, unknown>[],
): Promise<boolean> {
  const linke = readLinkeLinkage(mpOrder)
  const cps = mpOrder.cpsLinkage as RecruitmentCpsLinkage | undefined
  if (!linke || !cps || cps.syncStatus !== 'synced') return false
  if (cps.linkeSettlementDone || cps.linkeSettlementReminderAt) return false

  const selectedIds = Array.isArray(mpOrder.selectedApplicantIds)
    ? (mpOrder.selectedApplicantIds as string[]).map(String)
    : []
  if (!selectedIds.length) return false

  const idSet = new Set(selectedIds)
  const selected = applicants.filter((a) => idSet.has(String(a.id)))
  const allUploaded = selected.every((a) => !!String(a.videoUrl || '').trim())
  if (!allUploaded || selected.length < selectedIds.length) return false

  await patchMpRecruitmentOrder({
    id: String(mpOrder.id || ''),
    cpsLinkage: {
      ...cps,
      linkeSettlementReminderAt: new Date().toISOString(),
    },
  })
  return true
}

export function readLinkeLinkageFromOrder(mpOrder: Record<string, unknown>): MpLinkeLinkage | null {
  return readLinkeLinkage(mpOrder)
}
