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

function mergePublishedOrdersFromRegistry(local, mpList, account) {
  const map = new Map()
  ;(local || []).forEach((item) => {
    const id = String(item && item.mpOrderId || '').trim()
    if (id) map.set(id, item)
  })
  ;(mpList || []).forEach((mp) => {
    if (!mp || typeof mp !== 'object') return
    const id = String(mp.id || '').trim()
    if (!id || map.has(id)) return
    if (!mpOrderOwnedByCurrentPr(mp, account)) return
    const scope = require('./mpAccountLocalScope.js')
    map.set(id, {
      mpOrderId: id,
      title: String(mp.title || mp.customerName || id),
      publishedAt: String(mp.createdAt || mp.updatedAt || ''),
      hall: hallFromMp(mp),
      ownerAccountId: scope.scopeIdFromAccount(account),
      ownerPrId: String(account.lingqiPrId || '').trim(),
    })
  })
  return Array.from(map.values()).sort((a, b) => {
    const ta = Date.parse(String(a.publishedAt || '').replace(/\//g, '-')) || 0
    const tb = Date.parse(String(b.publishedAt || '').replace(/\//g, '-')) || 0
    return tb - ta
  })
}

function listPublishedOrdersForCurrentPr(mpList) {
  const account = auth.readAccount()
  return mergePublishedOrdersFromRegistry(applicationsStore.readPublishedOrders(), mpList, account)
}

module.exports = {
  mpOrderOwnedByCurrentPr,
  mergePublishedOrdersFromRegistry,
  listPublishedOrdersForCurrentPr,
}
