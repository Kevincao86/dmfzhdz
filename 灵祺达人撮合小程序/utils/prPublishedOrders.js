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

/** 注册表为权威数据源：仅展示仍存在于 mpRecruitmentOrders 的本 PR 发单 */
function mergePublishedOrdersFromRegistry(local, mpList, account) {
  const localById = new Map()
  ;(local || []).forEach((item) => {
    const id = String(item && item.mpOrderId ? item.mpOrderId : '').trim()
    if (id) localById.set(id, item)
  })

  const scope = require('./mpAccountLocalScope.js')
  const out = []
  ;(mpList || []).forEach((mp) => {
    if (!mp || typeof mp !== 'object') return
    const id = String(mp.id || '').trim()
    if (!id || !mpOrderOwnedByCurrentPr(mp, account)) return
    const cached = localById.get(id)
    out.push(
      cached || {
        mpOrderId: id,
        title: String(mp.title || mp.customerName || id),
        publishedAt: String(mp.createdAt || mp.updatedAt || ''),
        hall: hallFromMp(mp),
        ownerAccountId: scope.scopeIdFromAccount(account),
        ownerPrId: String(account.lingqiPrId || '').trim(),
      },
    )
  })

  return out.sort((a, b) => {
    const ta = Date.parse(String(a.publishedAt || '').replace(/\//g, '-')) || 0
    const tb = Date.parse(String(b.publishedAt || '').replace(/\//g, '-')) || 0
    return tb - ta
  })
}

/** 清理本地缓存里已从注册表删除的发单 */
function pruneOrphanPublishedOrders(mpList) {
  const ids = new Set(
    (mpList || [])
      .map((o) => String(o && o.id ? o.id : '').trim())
      .filter(Boolean),
  )
  for (const item of applicationsStore.readPublishedOrders()) {
    const id = String(item && item.mpOrderId ? item.mpOrderId : '').trim()
    if (id && !ids.has(id)) applicationsStore.removePublishedOrder(id)
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
