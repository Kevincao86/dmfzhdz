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
  if (!ids.ownerAccountId) return true
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

export function addApplication(entry: ApplicationLocal) {
  const ids = ownerIdsForFilter()
  const list = readApplicationsRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
  list.unshift({
    appliedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    ownerAccountId: ids.ownerAccountId,
    ownerMemberId: ids.memberId,
    ownerTalentId: ids.talentId,
    ...entry,
  })
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

export function hasAppliedToOrder(mpOrderId: string) {
  return readApplications().some((a) => a.mpOrderId === mpOrderId)
}

export { currentScopeId }
