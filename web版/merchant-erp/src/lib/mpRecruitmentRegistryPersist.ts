import type { RegistryFile, RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'

const INLINE_DATA_IMAGE_RE = /^data:image\//i
/** 持久化时允许保留的极小 data URL（大于此长度的内联图一律剥离或迁入 side map） */
const MAX_INLINE_DATA_URL_PERSIST = 512
export const MAX_GROUP_QR_PERSIST_LEN = 120_000

function isLargeInlineDataUrl(raw: unknown): boolean {
  const s = String(raw || '').trim()
  return INLINE_DATA_IMAGE_RE.test(s) && s.length > MAX_INLINE_DATA_URL_PERSIST
}

function readGroupQrFromOrder(order: RegistryMpRecruitmentOrder): string {
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : null
  return String(order.groupQrImage || meta?.groupQrImage || '').trim()
}

/** 写入注册表前压缩内联 base64，避免整表 PATCH 超 nginx 1m → PostgREST PGRST102 */
export function compactRegistryForPersist(data: RegistryFile): RegistryFile {
  const qrMap: Record<string, string> = {
    ...((data as RegistryFile & { mpGroupQrByOrderId?: Record<string, string> }).mpGroupQrByOrderId ||
      {}),
  }

  const mpRecruitmentOrders = slimMpRecruitmentOrdersForRegistryPersist(data.mpRecruitmentOrders).map(
    (order) => {
      const next: RegistryMpRecruitmentOrder = { ...order }
      const qr = readGroupQrFromOrder(next)
      const id = String(next.id || '').trim()
      if (qr && id) qrMap[id] = qr

      if (isLargeInlineDataUrl(next.groupQrImage)) delete next.groupQrImage
      if (isLargeInlineDataUrl(next.coverImage)) delete next.coverImage
      if (next.editGroupQrImage && isLargeInlineDataUrl(next.editGroupQrImage)) {
        delete next.editGroupQrImage
      }

      const metaRaw = next.mpPublishMeta
      if (metaRaw && typeof metaRaw === 'object') {
        const meta = { ...(metaRaw as Record<string, unknown>) }
        for (const key of ['groupQrImage', 'coverImage', 'editGroupQrImage', 'prWxAvatarUrl'] as const) {
          if (isLargeInlineDataUrl(meta[key])) delete meta[key]
        }
        next.mpPublishMeta = Object.keys(meta).length ? meta : undefined
      }
      return next
    },
  )

  const mpTalentMembers = (data.mpTalentMembers ?? []).map((member) => {
    if (!member) return member
    const av = String(member.wxAvatarUrl || '').trim()
    if (!isLargeInlineDataUrl(av)) return member
    return { ...member, wxAvatarUrl: '' }
  })

  const mpPrUsers = (data.mpPrUsers ?? []).map((user) => {
    if (!user) return user
    const av = String(user.wxAvatarUrl || '').trim()
    if (!isLargeInlineDataUrl(av)) return user
    return { ...user, wxAvatarUrl: '' }
  })

  const mpTalentInbox = (data.mpTalentInbox ?? []).map((row) => {
    if (!row || typeof row !== 'object') return row
    const imageUrl = String((row as { imageUrl?: string }).imageUrl || '').trim()
    if (!isLargeInlineDataUrl(imageUrl)) return row
    const mpOrderId = String((row as { mpOrderId?: string }).mpOrderId || '').trim()
    if (mpOrderId && qrMap[mpOrderId]) {
      return { ...row, imageUrl: '' }
    }
    return { ...row, imageUrl: '' }
  })

  const out: RegistryFile & { mpGroupQrByOrderId?: Record<string, string> } = {
    ...data,
    mpRecruitmentOrders,
    mpTalentMembers,
    mpPrUsers,
    mpTalentInbox,
  }
  if (Object.keys(qrMap).length) out.mpGroupQrByOrderId = qrMap
  else delete out.mpGroupQrByOrderId
  return out
}

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
  return compactRegistryForPersist({
    ...data,
    mpRecruitmentOrders: slimMpRecruitmentOrdersForRegistryPersist(data.mpRecruitmentOrders),
  })
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
