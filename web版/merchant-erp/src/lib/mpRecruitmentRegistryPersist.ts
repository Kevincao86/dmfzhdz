import type { RegistryFile, RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'

/** 写入注册表前去掉 mpPublishMeta 内重复封面，避免整表 PATCH 超 nginx 1m 默认限制 */
export function normalizeMpRecruitmentOrderForRegistryPersist(
  order: RegistryMpRecruitmentOrder,
): RegistryMpRecruitmentOrder {
  const next: RegistryMpRecruitmentOrder = { ...order }
  const metaRaw = next.mpPublishMeta
  if (!metaRaw || typeof metaRaw !== 'object') return next
  const meta = { ...(metaRaw as Record<string, unknown>) }
  const topCover = String(next.coverImage || '').trim()
  const metaCover = String(meta.coverImage || '').trim()
  if (metaCover && (metaCover === topCover || metaCover.startsWith('data:image/'))) {
    delete meta.coverImage
  }
  if (Object.keys(meta).length === 0) {
    delete next.mpPublishMeta
  } else {
    next.mpPublishMeta = meta
  }
  return next
}

export function slimMpRecruitmentOrdersForRegistryPersist(
  orders: RegistryMpRecruitmentOrder[] | undefined,
): RegistryMpRecruitmentOrder[] {
  return (orders ?? []).map((o) => normalizeMpRecruitmentOrderForRegistryPersist(o))
}

export function registryFileForPersist(data: RegistryFile): RegistryFile {
  return {
    ...data,
    mpRecruitmentOrders: slimMpRecruitmentOrdersForRegistryPersist(data.mpRecruitmentOrders),
  }
}

/** 禁止用仅含 mpRecruitmentOrders 的切片覆盖整库（会导致达人/PR 库被清空） */
export function isRegistrySnapshotSafeToPersist(data: Partial<RegistryFile> | null | undefined): boolean {
  if (!data || typeof data !== 'object') return false
  const orderCount = Array.isArray(data.mpRecruitmentOrders) ? data.mpRecruitmentOrders.length : 0
  const memberCount = Array.isArray(data.mpTalentMembers) ? data.mpTalentMembers.length : 0
  const prCount = Array.isArray(data.mpPrUsers) ? data.mpPrUsers.length : 0
  const talentLib = Array.isArray(data.talentLibraryEntries) ? data.talentLibraryEntries.length : 0
  const tenantCount = Array.isArray(data.tenants) ? data.tenants.length : 0
  const hasVendorKeys =
    data.vendorKeys && typeof data.vendorKeys === 'object' && Object.keys(data.vendorKeys).length > 0
  if (orderCount > 0 && memberCount === 0 && prCount === 0 && talentLib === 0 && tenantCount === 0 && !hasVendorKeys) {
    return false
  }
  return true
}
