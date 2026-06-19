const sessionStore = require('./mpSessionStore.js')

function readAccountPrFeatureAccess(account) {
  const acc = account || sessionStore.readAccount()
  const raw = acc && acc.prFeatureAccess
  return {
    addons: raw && raw.addons === true,
    recommendHall: raw && raw.recommendHall === true,
  }
}

function canUsePrRecommendHall(account) {
  return readAccountPrFeatureAccess(account).recommendHall
}

function patchAccountPrFeatureAccess(account, access) {
  if (!account || !access || typeof access !== 'object') return account
  const prev = readAccountPrFeatureAccess(account)
  return {
    ...account,
    prFeatureAccess: {
      addons: typeof access.addons === 'boolean' ? access.addons : prev.addons,
      recommendHall: typeof access.recommendHall === 'boolean' ? access.recommendHall : prev.recommendHall,
    },
  }
}

module.exports = {
  readAccountPrFeatureAccess,
  canUsePrRecommendHall,
  patchAccountPrFeatureAccess,
}
