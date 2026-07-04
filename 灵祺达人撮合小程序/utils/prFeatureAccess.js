const sessionStore = require('./mpSessionStore.js')

function readRawAccess(account) {
  const acc = account || sessionStore.readAccount()
  return (acc && acc.prFeatureAccess) || {}
}

function expandLegacy(raw) {
  const legacy = raw.addons === true
  const shortvideo = raw.shortvideo === true || (legacy && raw.shortvideo !== false)
  const cloudEdit = raw.cloudEdit === true || (legacy && raw.cloudEdit !== false)
  const digitalHuman = raw.digitalHuman === true || (legacy && raw.digitalHuman !== false)
  const brief = raw.brief === true
  const aiVideoReview = raw.aiVideoReview === true
  const aiReview = raw.aiReview === true
  const any = legacy || shortvideo || cloudEdit || digitalHuman || brief || aiVideoReview || aiReview
  return {
    addons: any,
    recommendHall: raw.recommendHall === true,
    shortvideo,
    cloudEdit,
    digitalHuman,
    brief,
    aiVideoReview,
    aiReview,
    any,
  }
}

function readAccountPrFeatureAccess(account) {
  return expandLegacy(readRawAccess(account))
}

function canUsePrRecommendHall(account) {
  return readAccountPrFeatureAccess(account).recommendHall
}

function canUsePrAddons(account) {
  return readAccountPrFeatureAccess(account).any
}

function canUseAddonPerm(account, perm) {
  const access = readAccountPrFeatureAccess(account)
  if (!access.any) return false
  if (perm === 'shortvideo') return access.shortvideo || access.cloudEdit
  if (perm === 'cloudEdit') return access.cloudEdit
  if (perm === 'brief') return access.brief
  if (perm === 'digitalHuman') return access.digitalHuman
  if (perm === 'aiVideoReview') return access.aiVideoReview
  if (perm === 'aiReview') return access.aiReview
  return false
}

function patchAccountPrFeatureAccess(account, access) {
  if (!account || !access || typeof access !== 'object') return account
  const prev = readRawAccess(account)
  return {
    ...account,
    prFeatureAccess: {
      addons: typeof access.addons === 'boolean' ? access.addons : prev.addons,
      recommendHall: typeof access.recommendHall === 'boolean' ? access.recommendHall : prev.recommendHall,
      shortvideo: typeof access.shortvideo === 'boolean' ? access.shortvideo : prev.shortvideo,
      cloudEdit: typeof access.cloudEdit === 'boolean' ? access.cloudEdit : prev.cloudEdit,
      digitalHuman: typeof access.digitalHuman === 'boolean' ? access.digitalHuman : prev.digitalHuman,
      brief: typeof access.brief === 'boolean' ? access.brief : prev.brief,
      aiVideoReview: typeof access.aiVideoReview === 'boolean' ? access.aiVideoReview : prev.aiVideoReview,
      aiReview: typeof access.aiReview === 'boolean' ? access.aiReview : prev.aiReview,
    },
  }
}

module.exports = {
  readAccountPrFeatureAccess,
  canUsePrRecommendHall,
  canUsePrAddons,
  canUseAddonPerm,
  patchAccountPrFeatureAccess,
}
