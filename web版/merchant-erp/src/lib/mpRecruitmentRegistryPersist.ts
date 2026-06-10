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
