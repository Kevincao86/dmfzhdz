const auth = require('./auth.js')
const userProfile = require('./userProfile.js')
const participant = require('./participant.js')
const applicationsStore = require('./applicationsStore.js')

function hallFromMp(mp) {
  if (!mp) return 'normal'
  if (mp.hall === 'urgent' || mp.urgent) return 'urgent'
  if (mp.hall === 'ice' || mp.orderKind === 'ice') return 'ice'
  return 'normal'
}

function mpOrderOwnedByCurrentPr(mp, account) {
  if (!mp || !account) return false
  const pub = String(mp.publisherIdentity || '').trim()
  if (pub && pub !== 'pr') return false

  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const prId = String(account.lingqiPrId || '').trim()
  const registryPrId = String(account.registryPrId || account.registryMemberId || '').trim()
  const metaPrId = String(meta.lingqiPrId || '').trim()
  const metaRegistryPrId = String(meta.registryPrId || '').trim()

  if (prId && metaPrId && prId === metaPrId) return true
  if (registryPrId && metaRegistryPrId && registryPrId === metaRegistryPrId) return true

  const pr = userProfile.readPrProfile()
  const myKey = participant.prParticipantKey(pr)
  const metaKey = String(meta.prParticipantKey || '').trim()
  if (myKey && metaKey && myKey === metaKey) return true

  return false
}

/** 本地发单历史 + 注册表：展示全部本 PR 发单（含已删除、已完成） */
function mergePublishedOrdersFromRegistry(local, mpList, account) {
  const scope = require('./mpAccountLocalScope.js')
  const mpById = new Map()
  ;(mpList || []).forEach((mp) => {
    if (!mp || typeof mp !== 'object') return
    const id = String(mp.id || '').trim()
    if (id) mpById.set(id, mp)
  })

  const out = []
  const seen = new Set()
  const localById = new Map(
    (local || []).map((item) => [String(item && item.mpOrderId ? item.mpOrderId : '').trim(), item]),
  )

  ;(local || []).forEach((item) => {
    const id = String(item && item.mpOrderId ? item.mpOrderId : '').trim()
    if (!id || seen.has(id)) return
    const mp = mpById.get(id)
    if (mp && !mpOrderOwnedByCurrentPr(mp, account)) return
    seen.add(id)
    out.push(item)
  })

  ;(mpList || []).forEach((mp) => {
    if (!mp || typeof mp !== 'object') return
    const id = String(mp.id || '').trim()
    if (!id || seen.has(id) || !mpOrderOwnedByCurrentPr(mp, account)) return
    if (localById.get(id) && localById.get(id).deletedAt) return
    seen.add(id)
    out.push({
      mpOrderId: id,
      title: String(mp.title || mp.customerName || id),
      publishedAt: String(mp.createdAt || mp.updatedAt || ''),
      hall: hallFromMp(mp),
      ownerAccountId: scope.scopeIdFromAccount(account),
      ownerPrId: String(account.lingqiPrId || '').trim(),
    })
  })

  return out.sort((a, b) => {
    const ta = Date.parse(String(a.publishedAt || '').replace(/\//g, '-')) || 0
    const tb = Date.parse(String(b.publishedAt || '').replace(/\//g, '-')) || 0
    return tb - ta
  })
}

/** 注册表已无该单时，补写本地 deletedAt，避免跨端删除后仍出现在「已发布」 */
function pruneOrphanPublishedOrders(mpList) {
  const mpIds = new Set(
    (mpList || []).map((mp) => String(mp && mp.id ? mp.id : '').trim()).filter(Boolean),
  )
  const local = applicationsStore.readPublishedOrders()
  for (const item of local) {
    if (!item || item.deletedAt) continue
    const id = String(item.mpOrderId || '').trim()
    if (!id || mpIds.has(id)) continue
    applicationsStore.markPublishedOrderDeleted(id)
  }
}

function listPublishedOrdersForCurrentPr(mpList) {
  const account = auth.readAccount()
  return mergePublishedOrdersFromRegistry(applicationsStore.readPublishedOrders(), mpList, account)
}

module.exports = {
  mpOrderOwnedByCurrentPr,
  mergePublishedOrdersFromRegistry,
  pruneOrphanPublishedOrders,
  listPublishedOrdersForCurrentPr,
}
