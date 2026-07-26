import { getAccount } from '../mpSession'
import {
  currentScopeId,
  scopedStorageKey,
  scopeIdFromAccount,
} from '../mpAccountLocalScope'

export const APPLICATIONS_BASE = 'meoo_my_applications_v1'
export const PUBLISH_BASE = 'meoo_my_published_orders_v1'

/** @deprecated 使用 APPLICATIONS_BASE */
export const APPLICATIONS_KEY = APPLICATIONS_BASE

export type ApplicationLocal = {
  mpOrderId: string
  applicantId?: string
  title?: string
  platform?: string
  appliedAt?: string
  /** 达人主动取消报名后保留，供「已取消」Tab 展示 */
  withdrawnAt?: string
  ownerAccountId?: string
  ownerMemberId?: string
  ownerTalentId?: string
}

export type PublishedOrderLocal = {
  mpOrderId: string
  title?: string
  publishedAt?: string
  hall?: string
  ownerAccountId?: string
  ownerPrId?: string
  /** 用户主动删除发单时写入，供「我的发单」展示已删除记录 */
  deletedAt?: string
  /** 误标删除恢复时间，供客户端状态合并优先于旧 deletedAt */
  restoredAt?: string
  /** 最近一次从注册表同步到的状态（注册表暂未返回时用于展示已完成等） */
  lastStatus?: string
}

function ownerIdsForFilter() {
  const account = getAccount()
  return {
    ownerAccountId: scopeIdFromAccount(account),
    memberId: String(account?.registryMemberId || '').trim(),
    talentId: String(account?.lingqiTalentId || '').trim(),
    prId: String(account?.lingqiPrId || '').trim(),
  }
}

function entryBelongsToCurrentAccount(
  entry: { ownerAccountId?: string; ownerMemberId?: string; ownerTalentId?: string; ownerPrId?: string },
  ids: ReturnType<typeof ownerIdsForFilter>,
) {
  if (!entry.ownerAccountId && !entry.ownerMemberId && !entry.ownerTalentId && !entry.ownerPrId) {
    return false
  }
  if (!ids.ownerAccountId) {
    if (ids.memberId && entry.ownerMemberId) return entry.ownerMemberId === ids.memberId
    if (ids.talentId && entry.ownerTalentId) return entry.ownerTalentId === ids.talentId
    if (ids.prId && entry.ownerPrId) return entry.ownerPrId === ids.prId
    return false
  }
  if (!entry.ownerAccountId) return false
  if (entry.ownerAccountId !== ids.ownerAccountId) return false
  if (entry.ownerMemberId && ids.memberId && entry.ownerMemberId !== ids.memberId) return false
  if (entry.ownerTalentId && ids.talentId && entry.ownerTalentId !== ids.talentId) return false
  if (entry.ownerPrId && ids.prId && entry.ownerPrId !== ids.prId) return false
  return true
}

function readListFromKey(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeListToKey(key: string, list: unknown[]) {
  localStorage.setItem(key, JSON.stringify((list || []).slice(0, 80)))
  import('../mpClientSyncHooks').then((m) => m.notifyLocalClientStateChanged()).catch(() => {})
}

function readApplicationsRaw(): ApplicationLocal[] {
  const scopedKey = scopedStorageKey(APPLICATIONS_BASE)
  const scoped = readListFromKey(scopedKey) as ApplicationLocal[]
  if (scoped.length) return scoped
  const legacy = readListFromKey(APPLICATIONS_BASE) as ApplicationLocal[]
  if (!legacy.length) return []
  const ids = ownerIdsForFilter()
  const filtered = legacy.filter((item) => entryBelongsToCurrentAccount(item, ids))
  if (filtered.length) writeListToKey(scopedKey, filtered)
  return filtered
}

export function readApplications(): ApplicationLocal[] {
  const ids = ownerIdsForFilter()
  return readApplicationsRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
}

export function upsertApplication(entry: ApplicationLocal): 'added' | 'updated' | 'unchanged' | 'skipped' {
  const ids = ownerIdsForFilter()
  const mpOrderId = String(entry?.mpOrderId || '').trim()
  if (!mpOrderId) return 'skipped'
  const list = readApplicationsRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
  const idx = list.findIndex((item) => item && String(item.mpOrderId || '').trim() === mpOrderId)
  const base: ApplicationLocal = {
    appliedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    ownerAccountId: ids.ownerAccountId,
    ownerMemberId: ids.memberId,
    ownerTalentId: ids.talentId,
    ...entry,
    mpOrderId,
  }
  if (idx >= 0) {
    const prev = list[idx] || {}
    const nextApplicantId = String(base.applicantId || prev.applicantId || '').trim()
    const reApplying = !!nextApplicantId && !!String(prev.withdrawnAt || '').trim()
    const changed =
      nextApplicantId !== String(prev.applicantId || '').trim() ||
      String(base.title || '') !== String(prev.title || '') ||
      reApplying
    const next: ApplicationLocal = { ...prev, ...base, applicantId: nextApplicantId || prev.applicantId }
    if (reApplying) {
      delete next.withdrawnAt
    }
    list[idx] = next
    writeListToKey(scopedStorageKey(APPLICATIONS_BASE), list)
    return changed ? 'updated' : 'unchanged'
  }
  list.unshift(base)
  writeListToKey(scopedStorageKey(APPLICATIONS_BASE), list)
  return 'added'
}

export function addApplication(entry: ApplicationLocal) {
  upsertApplication(entry)
}

export function updateApplicationApplicantId(mpOrderId: string, applicantId: string) {
  const id = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!id || !aid) return
  const ids = ownerIdsForFilter()
  const list = readApplicationsRaw()
    .filter((item) => entryBelongsToCurrentAccount(item, ids))
    .map((item) => (item && item.mpOrderId === id ? { ...item, applicantId: aid } : item))
  writeListToKey(scopedStorageKey(APPLICATIONS_BASE), list)
}

function readPublishedOrdersRaw(): PublishedOrderLocal[] {
  const scopedKey = scopedStorageKey(PUBLISH_BASE)
  const scoped = readListFromKey(scopedKey) as PublishedOrderLocal[]
  if (scoped.length) return scoped
  const legacy = readListFromKey(PUBLISH_BASE) as PublishedOrderLocal[]
  if (!legacy.length) return []
  const ids = ownerIdsForFilter()
  const filtered = legacy.filter((item) => entryBelongsToCurrentAccount(item, ids))
  if (filtered.length) writeListToKey(scopedKey, filtered)
  return filtered
}

export function readPublishedOrders(): PublishedOrderLocal[] {
  const ids = ownerIdsForFilter()
  return readPublishedOrdersRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
}

export function addPublishedOrder(entry: PublishedOrderLocal) {
  const ids = ownerIdsForFilter()
  const list = readPublishedOrdersRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
  list.unshift({
    publishedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    ownerAccountId: ids.ownerAccountId,
    ownerPrId: ids.prId,
    ...entry,
  })
  writeListToKey(scopedStorageKey(PUBLISH_BASE), list)
}

export function removePublishedOrder(mpOrderId: string): void {
  const id = String(mpOrderId || '').trim()
  if (!id) return
  const ids = ownerIdsForFilter()
  const list = readPublishedOrdersRaw()
    .filter((item) => entryBelongsToCurrentAccount(item, ids))
    .filter((item) => item.mpOrderId !== id)
  writeListToKey(scopedStorageKey(PUBLISH_BASE), list)
}

export function markPublishedOrderDeleted(mpOrderId: string): void {
  const id = String(mpOrderId || '').trim()
  if (!id) return
  const deletedAt = new Date().toLocaleString('zh-CN', { hour12: false })
  const ids = ownerIdsForFilter()
  const list = readPublishedOrdersRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
  const idx = list.findIndex((item) => item.mpOrderId === id)
  if (idx >= 0) {
    list[idx] = { ...list[idx], deletedAt, mpOrderId: id }
  } else {
    list.unshift({
      mpOrderId: id,
      title: id,
      publishedAt: deletedAt,
      deletedAt,
      ownerAccountId: ids.ownerAccountId,
      ownerPrId: ids.prId,
    })
  }
  writeListToKey(scopedStorageKey(PUBLISH_BASE), list)
}

/** 注册表仍存在该单时，清除误标的 deletedAt */
export function clearPublishedOrderDeleted(mpOrderId: string): void {
  const id = String(mpOrderId || '').trim()
  if (!id) return
  const ids = ownerIdsForFilter()
  const list = readPublishedOrdersRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
  const idx = list.findIndex((item) => item.mpOrderId === id)
  if (idx < 0 || !list[idx]?.deletedAt) return
  const next: PublishedOrderLocal = { ...list[idx]!, mpOrderId: id }
  delete next.deletedAt
  next.restoredAt = new Date().toLocaleString('zh-CN', { hour12: false })
  list[idx] = next
  writeListToKey(scopedStorageKey(PUBLISH_BASE), list)
}

export function upsertPublishedOrderSnapshot(
  mpOrderId: string,
  patch: Partial<PublishedOrderLocal>,
): void {
  const id = String(mpOrderId || '').trim()
  if (!id) return
  const ids = ownerIdsForFilter()
  const list = readPublishedOrdersRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
  const idx = list.findIndex((item) => item.mpOrderId === id)
  if (idx >= 0) {
    const prev = list[idx]
    if (prev.deletedAt && !patch.deletedAt) return
    list[idx] = { ...prev, ...patch, mpOrderId: id }
  } else {
    list.unshift({
      mpOrderId: id,
      title: patch.title || id,
      publishedAt: patch.publishedAt || new Date().toLocaleString('zh-CN', { hour12: false }),
      hall: patch.hall || 'normal',
      ownerAccountId: ids.ownerAccountId,
      ownerPrId: ids.prId,
      ...patch,
    })
  }
  writeListToKey(scopedStorageKey(PUBLISH_BASE), list)
}

export function touchPublishedOrderSnapshot(
  mpOrderId: string,
  patch: Partial<PublishedOrderLocal>,
): void {
  upsertPublishedOrderSnapshot(mpOrderId, patch)
}

export function hasAppliedToOrder(mpOrderId: string) {
  const id = String(mpOrderId || '').trim()
  if (!id) return false
  return readApplications().some(
    (a) => String(a.mpOrderId || '').trim() === id && !String(a.withdrawnAt || '').trim(),
  )
}

export function markApplicationWithdrawn(mpOrderId: string) {
  const id = String(mpOrderId || '').trim()
  if (!id) return
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const ids = ownerIdsForFilter()
  const list = readApplicationsRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
  const idx = list.findIndex((item) => String(item.mpOrderId || '').trim() === id)
  if (idx >= 0) {
    list[idx] = { ...list[idx]!, mpOrderId: id, withdrawnAt: now }
  } else {
    list.unshift({
      mpOrderId: id,
      title: id,
      withdrawnAt: now,
      ownerAccountId: ids.ownerAccountId,
      ownerMemberId: ids.memberId,
      ownerTalentId: ids.talentId,
    })
  }
  writeListToKey(scopedStorageKey(APPLICATIONS_BASE), list)
}

export function removeApplication(mpOrderId: string) {
  const id = String(mpOrderId || '').trim()
  if (!id) return
  const ids = ownerIdsForFilter()
  const list = readApplicationsRaw()
    .filter((item) => entryBelongsToCurrentAccount(item, ids))
    .filter((a) => String(a.mpOrderId || '').trim() !== id)
  writeListToKey(scopedStorageKey(APPLICATIONS_BASE), list)
}

export { currentScopeId }
