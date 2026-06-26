/**
 * 推荐大厅模式：PR 注册账号 / PR 工作台 → 荐达人；达人/团队工作台 → 荐商单
 * 对齐履约 Web RecommendHallPanel（getActiveRole() === 'pr'）
 */
const userProfile = require('./userProfile.js')
const sessionStore = require('./mpSessionStore.js')
const config = require('./config.js')

function accountIsRegisteredPr(account) {
  const acc = account || sessionStore.readAccount()
  if (!acc) return false
  if (String(acc.activeRole || '').trim() === 'pr') return true
  return Boolean(String(acc.lingqiPrId || '').trim())
}

function resolveRecommendPageMode(workIdentity) {
  const identity = workIdentity || userProfile.readIdentity()
  const isPrIdentity = identity === 'pr'
  const talentTestMode = !isPrIdentity && config.MP_TEST_TALENT_ON_RECOMMEND === true
  const account = sessionStore.readAccount()
  const accountPr = accountIsRegisteredPr(account)
  const isPrMode = isPrIdentity || talentTestMode || accountPr
  return {
    identity,
    isPrIdentity,
    accountPr,
    isPrMode,
    talentTestMode,
  }
}

module.exports = {
  accountIsRegisteredPr,
  resolveRecommendPageMode,
}
