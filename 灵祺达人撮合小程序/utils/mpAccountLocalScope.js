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

const LEGACY_GLOBAL_PROFILE_KEYS = [
  'meoo_talent_member_v1',
  'meoo_pr_profile_v1',
  'meoo_apply_form_templates_v1',
  'meoo_active_apply_template_v1',
  'meoo_active_shoot_apply_template_v1',
  'meoo_active_edit_apply_template_v1',
  'meoo_talent_identity_v1',
  'meoo_talent_messages_v1',
  'meoo_talent_notifications_v1',
  'meoo_talent_inbox_seen_v1',
]

const LEGACY_UNSCOPED_PREFIXES = ['meoo_mp_apply_form_']

const MIGRATE_ON_FIRST_SCOPE_KEYS = [
  'meoo_talent_member_v1',
  'meoo_pr_profile_v1',
  'meoo_apply_form_templates_v1',
  'meoo_active_apply_template_v1',
  'meoo_active_shoot_apply_template_v1',
  'meoo_active_edit_apply_template_v1',
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

function removeUnscopedPrefixedKeys() {
  removeStorageKeysMatching((k) => {
    if (!k || typeof k !== 'string' || k.indexOf(':') >= 0) return false
    for (let i = 0; i < LEGACY_UNSCOPED_PREFIXES.length; i++) {
      if (k.indexOf(LEGACY_UNSCOPED_PREFIXES[i]) === 0) return true
    }
    return false
  })
}

function clearLegacyGlobalProfileKeys() {
  for (let i = 0; i < LEGACY_GLOBAL_PROFILE_KEYS.length; i++) {
    try {
      wx.removeStorageSync(LEGACY_GLOBAL_PROFILE_KEYS[i])
    } catch (_) {}
  }
  removeUnscopedPrefixedKeys()
}

function migrateLegacyKeyToScoped(baseKey, accountOrScope) {
  const scoped = scopedStorageKey(baseKey, accountOrScope)
  try {
    if (wx.getStorageSync(scoped)) return
    const legacy = wx.getStorageSync(baseKey)
    if (!legacy) return
    wx.setStorageSync(scoped, typeof legacy === 'string' ? legacy : JSON.stringify(legacy))
    wx.removeStorageSync(baseKey)
  } catch (_) {}
}

/** 清除报名、发单记录、通知流、入选去重、按单选人等 */
function clearTransactionalLocalData() {
  removeStorageKeysMatching((k) => {
    if (!k || typeof k !== 'string') return false
    for (let i = 0; i < TRANSACTIONAL_PREFIXES.length; i++) {
      if (k.indexOf(TRANSACTIONAL_PREFIXES[i]) === 0) return true
    }
    return false
  })
}

function migrateAllLegacyProfileKeysToScope(scopeId) {
  if (!scopeId) return
  for (let i = 0; i < MIGRATE_ON_FIRST_SCOPE_KEYS.length; i++) {
    const base = MIGRATE_ON_FIRST_SCOPE_KEYS[i]
    const scoped = `${base}:${scopeId}`
    try {
      if (wx.getStorageSync(scoped)) continue
      const legacy = wx.getStorageSync(base)
      if (!legacy) continue
      wx.setStorageSync(scoped, typeof legacy === 'string' ? legacy : JSON.stringify(legacy))
      wx.removeStorageSync(base)
    } catch (_) {}
  }
  removeUnscopedPrefixedKeys()
}

/** 登录成功：若账号切换则清空上一账号的本机事务数据 */
function onAccountLogin(account) {
  const next = scopeIdFromAccount(account)
  if (!next) return
  const prev = readLastScopeId()
  if (!prev) {
    migrateAllLegacyProfileKeysToScope(next)
    try {
      wx.removeStorageSync('meoo_talent_messages_v1')
      wx.removeStorageSync('meoo_talent_notifications_v1')
      wx.removeStorageSync('meoo_talent_inbox_seen_v1')
    } catch (_) {}
  } else if (prev !== next) {
    clearTransactionalLocalData()
    clearLegacyGlobalProfileKeys()
  }
  writeLastScopeId(next)
}

/** 切换账号 / 退出：清空事务数据与会话 */
function onAccountLogout() {
  clearTransactionalLocalData()
  clearLegacyGlobalProfileKeys()
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
  clearLegacyGlobalProfileKeys,
  migrateLegacyKeyToScoped,
  currentScopeId,
}
