/**
 * 商家小程序与商家网页共用：商品库、门店联系人、报税记录、Brief。
 */
const cloud = require('./agentUserStateCloudMp.js')
const products = require('./productEditLibraryMp.js')
const contacts = require('./storeContactOverrideMp.js')
const tax = require('./taxFilingMp.js')
const briefs = require('./kolBriefStorageMp.js')

let pushTimer = null

function snapshot() {
  return {
    productLibrary: products.loadProductEditLibrary(),
    storeContacts: contacts.loadAll(),
    taxHistory: tax.readHistory(),
    briefRecords: briefs.readRecords(),
    briefSelected: briefs.readSelectedBrief(),
    updatedAt: new Date().toISOString(),
  }
}

function scheduleMerchantDeskPush() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void cloud.pushAgentUserStateNow({ desk: snapshot() })
  }, 700)
}

function mergeById(local, remote) {
  const map = new Map()
  const rows = [].concat(local || [], remote || [])
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    const id = String(row && row.id ? row.id : '').trim()
    if (!id) continue
    map.set(id, row)
  }
  return [...map.values()].slice(0, 80)
}

async function pullMerchantDeskIntoLocal() {
  const remote = await cloud.pullAgentUserState()
  const desk = remote && remote.desk
  if (!desk) return
  if (Array.isArray(desk.productLibrary) && desk.productLibrary.length) {
    products.replaceProductEditLibrary(mergeById(products.loadProductEditLibrary(), desk.productLibrary))
  }
  if (desk.storeContacts && typeof desk.storeContacts === 'object') {
    contacts.replaceAll(Object.assign({}, contacts.loadAll(), desk.storeContacts))
  }
  if (Array.isArray(desk.taxHistory) && desk.taxHistory.length) {
    tax.replaceHistory(mergeById(tax.readHistory(), desk.taxHistory))
  }
  if (Array.isArray(desk.briefRecords) && desk.briefRecords.length) {
    briefs.replaceRecords(mergeById(briefs.readRecords(), desk.briefRecords))
  }
  if (desk.briefSelected && typeof desk.briefSelected === 'object') {
    briefs.writeSelectedBrief(desk.briefSelected, { push: false })
  }
  scheduleMerchantDeskPush()
}

module.exports = {
  scheduleMerchantDeskPush,
  pullMerchantDeskIntoLocal,
}
