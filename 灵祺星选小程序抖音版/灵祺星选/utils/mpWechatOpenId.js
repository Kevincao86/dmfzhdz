const auth = require('./auth.js')
const wxAccount = require('./wxAccount.js')
const memberStore = require('./talentMember.js')
const userProfile = require('./userProfile.js')

function resolveOpenIdFromLocal() {
  const acct = auth.readAccount() || {}
  const fromAcct = String(acct.openid || '').trim()
  if (fromAcct) return fromAcct
  try {
    const wxa = wxAccount.readWxAccount()
    const fromWx = String((wxa && wxa.wxOpenId) || '').trim()
    if (fromWx) return fromWx
  } catch (_) {}
  const member = memberStore.readMember()
  const fromMember = String((member && member.wxOpenId) || '').trim()
  if (fromMember) return fromMember
  const pr = userProfile.readPrProfile()
  return String((pr && pr.wxOpenId) || '').trim()
}

async function ensureOpenIdForJsapiPay() {
  let openid = resolveOpenIdFromLocal()
  if (openid) return openid
  throw new Error('missing_openid')
}

module.exports = {
  resolveOpenIdFromLocal,
  ensureOpenIdForJsapiPay,
}
