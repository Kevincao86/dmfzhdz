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
  const hasOwner =
    entry.ownerAccountId || entry.ownerMemberId || entry.ownerTalentId || entry.ownerPrId
  if (!hasOwner) {
    return !!(ids.ownerAccountId || ids.memberId || ids.talentId || ids.prId)
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

function stampOwnerFields(entry, ids) {
  if (!entry || typeof entry !== 'object') return entry
  const hasOwner =
    entry.ownerAccountId || entry.ownerMemberId || entry.ownerTalentId || entry.ownerPrId
  if (hasOwner) return entry
  return {
    ...entry,
    ownerAccountId: ids.ownerAccountId || '',
    ownerMemberId: ids.memberId || '',
    ownerTalentId: ids.talentId || '',
    ownerPrId: ids.prId || '',
  }
}

function adoptOwnerTags(list) {
  const ids = ownerIdsForFilter()
  if (!ids.ownerAccountId && !ids.memberId && !ids.talentId && !ids.prId) return list || []
  return (list || [])
    .filter((item) => entryBelongsToCurrentAccount(item, ids))
    .map((item) => stampOwnerFields(item, ids))
}

function listNeedsOwnerStamp(list) {
  return (list || []).some(
    (item) =>
      item &&
      !item.ownerAccountId &&
      !item.ownerMemberId &&
      !item.ownerTalentId &&
      !item.ownerPrId,
  )
}

function readApplicationsRaw() {
  const scopedKey = scope.scopedStorageKey(APPLICATIONS_BASE)
  const rawScoped = readListFromKey(scopedKey)
  const scoped = adoptOwnerTags(rawScoped)
  if (scoped.length) {
    if (listNeedsOwnerStamp(rawScoped)) writeListToKey(scopedKey, scoped)
    return scoped
  }
  const legacy = readListFromKey(APPLICATIONS_BASE)
  if (!legacy.length) return []
  const adopted = adoptOwnerTags(legacy)
  if (adopted.length) writeListToKey(scopedKey, adopted)
  return adopted
}

function readApplications() {
  const ids = ownerIdsForFilter()
  return readApplicationsRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
}

function updateApplicationApplicantId(mpOrderId, applicantId) {
  const id = String(mpOrderId || '').trim()
  const aid = String(applicantId || '').trim()
  if (!id || !aid) return
  const ids = ownerIdsForFilter()
  const list = readApplicationsRaw()
    .filter((item) => entryBelongsToCurrentAccount(item, ids))
    .map((item) => (item && item.mpOrderId === id ? { ...item, applicantId: aid } : item))
  writeListToKey(scope.scopedStorageKey(APPLICATIONS_BASE), list)
}

function addApplication(entry) {
  upsertApplication(entry)
}

function upsertApplication(entry) {
  const ids = ownerIdsForFilter()
  const mpOrderId = String(entry && entry.mpOrderId ? entry.mpOrderId : '').trim()
  if (!mpOrderId) return 'skipped'
  let list = readApplicationsRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
  const idx = list.findIndex((item) => item && String(item.mpOrderId || '').trim() === mpOrderId)
  const base = {
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
    const changed =
      nextApplicantId !== String(prev.applicantId || '').trim() ||
      String(base.title || '') !== String(prev.title || '')
    list[idx] = { ...prev, ...base, applicantId: nextApplicantId || prev.applicantId }
    writeListToKey(scope.scopedStorageKey(APPLICATIONS_BASE), list)
    return changed ? 'updated' : 'unchanged'
  }
  list.unshift(base)
  writeListToKey(scope.scopedStorageKey(APPLICATIONS_BASE), list)
  return 'added'
}

function readPublishedOrdersRaw() {
  const scopedKey = scope.scopedStorageKey(PUBLISH_BASE)
  const rawScoped = readListFromKey(scopedKey)
  const scoped = adoptOwnerTags(rawScoped)
  if (scoped.length) {
    if (listNeedsOwnerStamp(rawScoped)) writeListToKey(scopedKey, scoped)
    return scoped
  }
  const legacy = readListFromKey(PUBLISH_BASE)
  if (!legacy.length) return []
  const adopted = adoptOwnerTags(legacy)
  if (adopted.length) writeListToKey(scopedKey, adopted)
  return adopted
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

function touchPublishedOrderSnapshot(mpOrderId, patch) {
  const id = String(mpOrderId || '').trim()
  if (!id) return
  const ids = ownerIdsForFilter()
  const list = readPublishedOrdersRaw().filter((item) => entryBelongsToCurrentAccount(item, ids))
  const idx = list.findIndex((item) => item && item.mpOrderId === id)
  if (idx >= 0) {
    if (list[idx].deletedAt && !(patch && patch.deletedAt)) return
    list[idx] = { ...list[idx], ...patch, mpOrderId: id }
  } else if (patch && patch.deletedAt) {
    list.unshift({
      mpOrderId: id,
      title: id,
      publishedAt: patch.deletedAt,
      deletedAt: patch.deletedAt,
      ownerAccountId: ids.ownerAccountId,
      ownerPrId: ids.prId,
    })
  } else {
    return
  }
  writePublishedOrders(list)
}

function markPublishedOrderDeleted(mpOrderId) {
  touchPublishedOrderSnapshot(mpOrderId, {
    deletedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  })
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

function hasAppliedToOrder(mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id) return false
  return readApplications().some((a) => a && String(a.mpOrderId || '').trim() === id)
}

function removeApplication(mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id) return
  const ids = ownerIdsForFilter()
  const list = readApplicationsRaw().filter(
    (item) => entryBelongsToCurrentAccount(item, ids) && String(item.mpOrderId || '').trim() !== id,
  )
  writeListToKey(scope.scopedStorageKey(APPLICATIONS_BASE), list)
}

module.exports = {
  readApplications,
  addApplication,
  upsertApplication,
  updateApplicationApplicantId,
  readPublishedOrders,
  addPublishedOrder,
  removePublishedOrder,
  updatePublishedOrderTitle,
  touchPublishedOrderSnapshot,
  markPublishedOrderDeleted,
  hasAppliedToOrder,
  removeApplication,
}
