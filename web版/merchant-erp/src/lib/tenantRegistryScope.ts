import type {
  RegistryFile,
  RegistryMpRecruitmentOrder,
  RegistryRecruitmentOrder,
} from './opsRegistryTypes.js'
import { filterLegacyDemoRecruitmentOrders } from './recruitmentLegacyDemoOrders.js'

/** 无 tenantId 的历史订单：仅在同浏览器未登录云端租户时不展示；已登录租户一律不展示 */
export function recruitmentOrderBelongsToTenant(
  order: RegistryRecruitmentOrder,
  tenantId: string,
): boolean {
  const tid = typeof order.tenantId === 'string' ? order.tenantId.trim() : ''
  return tid === tenantId
}

export function readMpRecruitmentOrderTenantId(order: RegistryMpRecruitmentOrder): string {
  const top = (order as RegistryMpRecruitmentOrder & { tenantId?: string }).tenantId
  if (typeof top === 'string' && top.trim()) return top.trim()
  const meta = order.mpPublishMeta
  if (meta && typeof meta === 'object') {
    return String((meta as Record<string, unknown>).tenantId || '').trim()
  }
  return ''
}

export function synthesizeMerchantOrderFromMp(
  mp: RegistryMpRecruitmentOrder,
  tenantId: string,
): RegistryRecruitmentOrder {
  const sid = String(mp.sourceMerchantOrderId || '').trim()
  return {
    id: sid,
    tenantId,
    customerName: mp.customerName || '商家',
    storeName: mp.storeName || mp.title || '招募',
    talentId: '—',
    talentName: '星选报名中',
    fans: Math.max(0, Number(mp.recruitCount) || 0),
    accountType: mp.platform || '',
    coopTimes: 0,
    createdAt: mp.createdAt,
    status: 'accepted',
    serviceAmount: Math.max(0, Number(mp.serviceAmount) || 0),
    commissionPct: 0,
    netAmount: Math.max(0, Number(mp.serviceAmount) || 0),
    storeAddress: mp.region || '',
    category: mp.category || '',
    infoSummary: String(mp.recruitmentInfo || mp.merchantRequirements || '').slice(0, 4000),
    linkedMpOrderId: mp.id,
    acceptMode: 'miniprogram',
    workflowStage: 'recruiting',
    autoPublishMp: true,
    orderKind: mp.orderKind === 'recruitment_ice' ? 'recruitment_ice' : 'recruitment',
    fulfillmentLoop: mp.fulfillmentLoop ?? 'open',
    recruitmentPlatform:
      mp.platform === '抖音' ||
      mp.platform === '小红书' ||
      mp.platform === '大众点评' ||
      mp.platform === '快手' ||
      mp.platform === '微信视频号'
        ? mp.platform
        : undefined,
  }
}

/**
 * 商家行被整表 PATCH 冲掉后，星选 mp 单仍在：按租户或本机刚发布的 id 回填商家订单，避免「已发布但列表为空」。
 */
export function hydrateOrphanMerchantOrdersFromMp(
  file: RegistryFile,
  tenantId: string,
  hydrateOrderId?: string,
): RegistryFile {
  const tid = tenantId.trim()
  const hydrateId = String(hydrateOrderId || '').trim()
  if (!tid && !hydrateId) return file

  const existing = file.recruitmentOrders ?? []
  const have = new Set(existing.map((o) => String(o.id || '').trim()).filter(Boolean))
  const extras: RegistryRecruitmentOrder[] = []

  for (const mp of file.mpRecruitmentOrders ?? []) {
    if (!mp || String(mp.publisherIdentity || '') !== 'merchant') continue
    const sid = String(mp.sourceMerchantOrderId || '').trim()
    if (!sid || have.has(sid)) continue
    const mpTid = readMpRecruitmentOrderTenantId(mp)
    const idHit = Boolean(hydrateId) && (sid === hydrateId || String(mp.id || '').trim() === hydrateId)
    if ((tid && mpTid === tid) || idHit) {
      extras.push(synthesizeMerchantOrderFromMp(mp, mpTid || tid))
      have.add(sid)
    }
  }

  if (!extras.length) return file
  return { ...file, recruitmentOrders: [...extras, ...existing] }
}

export function filterRegistryForTenant(
  file: RegistryFile,
  tenantId: string | null,
  hydrateOrderId?: string,
): RegistryFile {
  const base = { ...file }
  if (!tenantId) {
    return {
      ...base,
      recruitmentOrders: [],
      recruitmentScheduleRows: [],
      recruitmentVideoSubmissions: [],
      talentPoolCandidates: [],
    }
  }

  const hydrated = hydrateOrphanMerchantOrdersFromMp(file, tenantId, hydrateOrderId)
  const orders = filterLegacyDemoRecruitmentOrders(hydrated.recruitmentOrders ?? []).filter((o) =>
    recruitmentOrderBelongsToTenant(o, tenantId),
  )
  const orderIds = new Set(orders.map((o) => o.id))

  const talentPoolCandidates = (hydrated.talentPoolCandidates ?? []).filter((t) => {
    const src = typeof t.sourceRecruitmentOrderId === 'string' ? t.sourceRecruitmentOrderId.trim() : ''
    return src && orderIds.has(src)
  })

  const mpRecruitmentOrders = (hydrated.mpRecruitmentOrders ?? []).filter((o) => {
    const sid = String(o.sourceMerchantOrderId || '').trim()
    return sid && orderIds.has(sid)
  })

  return {
    ...base,
    recruitmentOrders: orders,
    recruitmentScheduleRows: [],
    recruitmentVideoSubmissions: [],
    talentPoolCandidates,
    mpRecruitmentOrders,
    talentLibraryEntries: [],
    mpTalentMembers: [],
  }
}
