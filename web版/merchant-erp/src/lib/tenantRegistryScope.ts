import type { RegistryFile, RegistryRecruitmentOrder } from './opsRegistryTypes'
import { filterLegacyDemoRecruitmentOrders } from './recruitmentLegacyDemoOrders'

/** 无 tenantId 的历史订单：仅在同浏览器未登录云端租户时不展示；已登录租户一律不展示 */
export function recruitmentOrderBelongsToTenant(
  order: RegistryRecruitmentOrder,
  tenantId: string,
): boolean {
  const tid = typeof order.tenantId === 'string' ? order.tenantId.trim() : ''
  return tid === tenantId
}

export function filterRegistryForTenant(file: RegistryFile, tenantId: string | null): RegistryFile {
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

  const orders = filterLegacyDemoRecruitmentOrders(file.recruitmentOrders ?? []).filter((o) =>
    recruitmentOrderBelongsToTenant(o, tenantId),
  )
  const orderIds = new Set(orders.map((o) => o.id))

  const talentPoolCandidates = (file.talentPoolCandidates ?? []).filter((t) => {
    const src = typeof t.sourceRecruitmentOrderId === 'string' ? t.sourceRecruitmentOrderId.trim() : ''
    return src && orderIds.has(src)
  })

  const mpRecruitmentOrders = (file.mpRecruitmentOrders ?? []).filter((o) => {
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
