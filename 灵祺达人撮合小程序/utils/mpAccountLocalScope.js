/**
 * 按灵祺账号隔离本机「我的报名 / 发单 / 通知」等，避免同设备换号串数据。
 */
const sessionStore = require('./mpSessionStore.js')

const LAST_ACCOUNT_SCOPE_KEY = 'meoo_last_account_scope_v1'

const TRANSACTIONAL_PREFIXES = [
  'meoo_my_applications_v',
  'meoo_my_published_orders_v',
  'meoo_talent_messages_v1',
  'meoo_talent_notifications_v1',
  'meoo_talent_inbox_seen_v1',
  'meoo_selection_notice_sent_v1',
  'meoo_mp_selected_v1_',
  'meoo_ice_applicant_v1_',
]

function scopeIdFromAccount(account) {
  if (!account) return ''
  return String(
    account.accountId || account.id || account.openid || account.lingqiTalentId || account.lingqiPrId || '',
  ).trim()
}

function scopedStorageKey(baseKey, accountOrScope) {
  const acc = accountOrScope && typeof accountOrScope === 'object' ? accountOrScope : null
  const scope = typeof accountOrScope === 'string' ? accountOrScope : scopeIdFromAccount(acc || sessionStore.readAccount())
  if (!scope) return baseKey
  return `${baseKey}:${scope}`
}

function readLastScopeId() {
  try {
    return String(wx.getStorageSync(LAST_ACCOUNT_SCOPE_KEY) || '').trim()
  } catch {
    return ''
  }
}

function writeLastScopeId(scopeId) {
  try {
    if (scopeId) wx.setStorageSync(LAST_ACCOUNT_SCOPE_KEY, String(scopeId))
    else wx.removeStorageSync(LAST_ACCOUNT_SCOPE_KEY)
  } catch (_) {}
}

function removeStorageKeysMatching(pred) {
  try {
    const info = wx.getStorageInfoSync()
    const keys = Array.isArray(info.keys) ? info.keys : []
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      if (pred(k)) {
        try {
          wx.removeStorageSync(k)
        } catch (_) {}
      }
    }
  } catch (_) {}
}

/** 清除报名、发单记录、通知流、入选去重、按单选人等（不含达人资料草稿） */
function clearTransactionalLocalData() {
  removeStorageKeysMatching((k) => {
    if (!k || typeof k !== 'string') return false
    for (let i = 0; i < TRANSACTIONAL_PREFIXES.length; i++) {
      if (k.indexOf(TRANSACTIONAL_PREFIXES[i]) === 0) return true
    }
    return false
  })
}

/** 登录成功：若账号切换则清空上一账号的本机事务数据 */
function onAccountLogin(account) {
  const next = scopeIdFromAccount(account)
  if (!next) return
  const prev = readLastScopeId()
  if (prev && prev !== next) {
    clearTransactionalLocalData()
  }
  writeLastScopeId(next)
}

/** 切换账号 / 退出：清空事务数据与会话 */
function onAccountLogout() {
  clearTransactionalLocalData()
  writeLastScopeId('')
}

function currentScopeId() {
  return scopeIdFromAccount(sessionStore.readAccount())
}

module.exports = {
  scopeIdFromAccount,
  scopedStorageKey,
  onAccountLogin,
  onAccountLogout,
  clearTransactionalLocalData,
  currentScopeId,
}
