const cps = require('./douyinCpsShared.js')
const settlement = require('./prApplicantSettlementPrice.js')
const linkeApi = require('./prDouyinLinkeApi.js')
const linkeStore = require('./prDouyinLinkeStore.js')
const mpOrderRegistryOps = require('./mpOrderRegistryOps.js')

function readLinkeLinkage(mpOrder) {
  const meta =
    mpOrder.mpPublishMeta && typeof mpOrder.mpPublishMeta === 'object' ? mpOrder.mpPublishMeta : {}
  const raw = meta.linkeLinkage
  if (!raw || typeof raw !== 'object') return null
  if (!raw.enabled || !raw.clientId) return null
  return raw
}

function isPrLinkeOrder(mpOrder) {
  return !!readLinkeLinkage(mpOrder)
}

function shouldAutoSyncPrLinkeCps(mpOrder, selectedIds) {
  const linke = readLinkeLinkage(mpOrder)
  if (!linke) return false
  const recruitCount = Math.max(1, Number(mpOrder.recruitCount) || 1)
  return (selectedIds || []).length >= recruitCount
}

async function autoSyncPrLinkeCpsOnNotify(params) {
  const { mpOrder, selectedApplicantIds, applicants, merchantPhoneFallback } = params
  const linke = readLinkeLinkage(mpOrder)
  if (!linke) return { ok: false, message: '未挂接林客', skipped: true }

  const existing = mpOrder.cpsLinkage
  if (existing && existing.syncStatus === 'synced' && existing.planId) {
    return { ok: true, planId: existing.planId, message: '林客定向计划已同步' }
  }

  const client = linkeStore.findPrDouyinLinkeClient(linke.clientId)
  if (!client) return { ok: false, message: '林客客户商家绑定已失效，请重新绑定' }

  const idSet = new Set((selectedApplicantIds || []).map(String))
  const selected = (applicants || []).filter((a) => idSet.has(String(a.id)))
  const douyinIds = [
    ...new Set(
      selected
        .map((a) =>
          cps.extractDouyinTalentId({
            platformAccount: String(a.platformAccount || ''),
            platformNickname: String(a.platformNickname || a.name || ''),
            name: String(a.name || ''),
          }),
        )
        .filter((id) => id && cps.isLikelyDouyinTalentId(id)),
    ),
  ]
  if (!douyinIds.length) {
    return { ok: false, message: '已选达人缺少有效抖音号，无法同步林客定向招募' }
  }

  const productIds = (linke.productIds || []).map(String).filter(Boolean)
  if (!productIds.length) {
    return { ok: false, message: '发单时未选择林客团购商品，请在发单编辑中补全商品后再通知' }
  }

  const phone = String(linke.merchantPhone || merchantPhoneFallback || '').trim()
  if (!/^1\d{10}$/.test(phone)) {
    return { ok: false, message: '缺少有效商家联系电话（11 位手机号）' }
  }

  const commissionPct = settlement.resolveCommissionPct(mpOrder)
  const rate = settlement.douyinCpsCommissionRateFromPct(commissionPct)
  const talentSettlements = settlement.buildCpsTalentSettlements(mpOrder, selected)
  const mpId = String(mpOrder.id || '')
  const planName = cps.douyinCpsPlanNameFromRecruitment(
    String(mpOrder.title || mpOrder.customerName || ''),
    mpId,
  )
  const { startSec, endSec } = cps.douyinCpsPlanTimeRangeSec({
    recruitStart: String(mpOrder.createdAt || ''),
    recruitEnd: String(mpOrder.deadline || ''),
  })

  const pendingLinkage = {
    provider: 'douyin',
    planType: 'video_oriented',
    planId: existing && existing.planId,
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

  await mpOrderRegistryOps.patchMpRecruitmentOrder({ id: mpId, cpsLinkage: pendingLinkage })

  const save = await linkeApi.savePrDouyinVideoOrientedPlan(client, {
    plan_id: existing && existing.planId,
    plan_name: planName,
    merchant_phone: phone,
    douyin_id_list: douyinIds,
    product_list: productIds.map((product_id) => ({ product_id, commission_rate: rate })),
    start_time: startSec,
    end_time: endSec,
    commission_duration: 30,
  })

  if (!save.ok) {
    await mpOrderRegistryOps.patchMpRecruitmentOrder({
      id: mpId,
      cpsLinkage: Object.assign({}, pendingLinkage, { syncStatus: 'failed', lastError: save.message }),
    })
    return { ok: false, message: save.message }
  }

  await mpOrderRegistryOps.patchMpRecruitmentOrder({
    id: mpId,
    cpsLinkage: Object.assign({}, pendingLinkage, {
      planId: save.planId,
      syncStatus: 'synced',
      lastError: undefined,
    }),
  })

  return {
    ok: true,
    planId: save.planId,
    message: `已在林客端创建定向招募（计划 ${save.planId}），达人佣金 ${commissionPct}%`,
  }
}

module.exports = {
  readLinkeLinkage,
  isPrLinkeOrder,
  shouldAutoSyncPrLinkeCps,
  autoSyncPrLinkeCpsOnNotify,
}
