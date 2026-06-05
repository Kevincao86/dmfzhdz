const auth = require('./auth.js')
const scope = require('./mpAccountLocalScope.js')

const APPLICATIONS_BASE = 'meoo_my_applications_v1'
const PUBLISH_BASE = 'meoo_my_published_orders_v1'

function readListFromKey(key) {
  try {
    const raw = wx.getStorageSync(key)
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function scheduleClientSync() {
  try {
    require('./mpAccountClientSync.js').schedulePush()
  } catch (_) {}
}

function writeListToKey(key, list) {
  wx.setStorageSync(key, JSON.stringify((list || []).slice(0, 80)))
  scheduleClientSync()
}

function ownerIdsForFilter() {
  const account = auth.readAccount()
  const ownerAccountId = scope.scopeIdFromAccount(account)
  const memberId = String(account?.registryMemberId || '').trim()
  const talentId = String(account?.lingqiTalentId || '').trim()
  const prId = String(account?.lingqiPrId || '').trim()
  return { ownerAccountId, memberId, talentId, prId }
}

function entryBelongsToCurrentAccount(entry, ids) {
  if (!entry) return false
  if (!ids.ownerAccountId) return true
  if (!entry.ownerAccountId) return false
  if (entry.ownerAccountId !== ids.ownerAccountId) return false
  if (entry.ownerMemberId && ids.memberId && entry.ownerMemberId !== ids.memberId) return false
  if (entry.ownerTalentId && ids.talentId && entry.ownerTalentId !== ids.talentId) return false
  if (entry.ownerPrId && ids.prId && entry.ownerPrId !== ids.prId) return false
  return true
}

function readApplicationsRaw() {
  const scopedKey = scope.scopedStorageKey(APPLICATIONS_BASE)
  const scoped = readListFromKey(scopedKey)
  if (scoped.length) return scoped
  const legacy = readListFromKey(APPLICATIONS_BASE)
  if (!legacy.length) return []
  const ids = ownerIdsForFilter()
  const filtered = legacy.filter((item) => entryBelongsToCurrentAccount(item, ids))
  if (filtered.length) writeListToKey(scopedKey, filtered)
  return filtered
}

function readApplications() {
  const ids = ownerIdsForFilter()
  return readApplicationsRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
}

function addApplication(entry) {
  const ids = ownerIdsForFilter()
  const list = readApplicationsRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
  list.unshift({
    appliedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    ownerAccountId: ids.ownerAccountId,
    ownerMemberId: ids.memberId,
    ownerTalentId: ids.talentId,
    ...entry,
  })
  writeListToKey(scope.scopedStorageKey(APPLICATIONS_BASE), list)
}

function readPublishedOrdersRaw() {
  const scopedKey = scope.scopedStorageKey(PUBLISH_BASE)
  const scoped = readListFromKey(scopedKey)
  if (scoped.length) return scoped
  const legacy = readListFromKey(PUBLISH_BASE)
  if (!legacy.length) return []
  const ids = ownerIdsForFilter()
  const filtered = legacy.filter((item) => entryBelongsToCurrentAccount(item, ids))
  if (filtered.length) writeListToKey(scopedKey, filtered)
  return filtered
}

function readPublishedOrders() {
  const ids = ownerIdsForFilter()
  return readPublishedOrdersRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
}

function addPublishedOrder(entry) {
  const ids = ownerIdsForFilter()
  const list = readPublishedOrdersRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
  list.unshift({
    publishedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    ownerAccountId: ids.ownerAccountId,
    ownerPrId: ids.prId,
    ...entry,
  })
  writeListToKey(scope.scopedStorageKey(PUBLISH_BASE), list)
}

function writePublishedOrders(list) {
  writeListToKey(scope.scopedStorageKey(PUBLISH_BASE), list)
}

function removePublishedOrder(mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id) return
  const ids = ownerIdsForFilter()
  const list = readPublishedOrdersRaw()
    .filter((item) => entryBelongsToCurrentAccount(item, ids))
    .filter((item) => item && item.mpOrderId !== id)
  writePublishedOrders(list)
}

function updatePublishedOrderTitle(mpOrderId, title) {
  const id = String(mpOrderId || '').trim()
  if (!id) return
  const ids = ownerIdsForFilter()
  const list = readPublishedOrdersRaw()
    .filter((item) => entryBelongsToCurrentAccount(item, ids))
    .map((item) => (item && item.mpOrderId === id ? { ...item, title: title || item.title } : item))
  writePublishedOrders(list)
}

module.exports = {
  readApplications,
  addApplication,
  readPublishedOrders,
  addPublishedOrder,
  removePublishedOrder,
  updatePublishedOrderTitle,
}
