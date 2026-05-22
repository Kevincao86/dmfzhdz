/**
 * 登录后与 Web 商家后台同步租户级平台绑定（tenant_merchant_bindings）。
 * 抖音来客 / 巨量本地推 / 小红书聚光 与电脑端设置页写入云端的数据一致。
 */
const api = require('./api.js')
const devAuth = require('./devAuth.js')
const supabaseRest = require('./supabaseRest.js')
const { writePlatformToken } = require('./platformTokensMp.js')

const MEOO_ACTIVE_TENANT_ID = 'meoo_active_tenant_id'
const MEOO_MERCHANT_DISPLAY_NAME = 'meoo_erp_merchant_display_name'

const PROVIDERS = ['douyin', 'local_promotion', 'xhs_commercial']

const ACTIVE_ID_KEY = {
  douyin: 'meoo_active_douyin_binding_id',
  local_promotion: 'meoo_active_local_promotion_binding_id',
  xhs_commercial: 'meoo_active_xhs_commercial_binding_id',
}

const DOUYIN_KEYS = [
  'meoo_douyin_merchant_token',
  'meoo_douyin_auto_refresh',
  'meoo_douyin_app_id',
  'meoo_douyin_merchant_id',
  'meoo_douyin_account_name',
]

const LEGACY_BIND_KEY = {
  local_promotion: 'meoo_local_promotion_bind',
  xhs_commercial: 'meoo_xhs_commercial_bind',
}

/** @type {number} */
let lastSyncAt = 0
/** @type {Promise<void> | null} */
let inflight = null

function tenantScopedKey(base, tenantId) {
  const tid = String(tenantId || '').trim()
  return tid ? `${base}@${tid}` : base
}

function storageGet(key) {
  try {
    const v = wx.getStorageSync(key)
    return typeof v === 'string' && v.trim() ? v.trim() : v != null && v !== '' ? String(v) : ''
  } catch (_) {
    return ''
  }
}

function storageSet(key, value) {
  try {
    if (value == null || value === '') wx.removeStorageSync(key)
    else wx.setStorageSync(key, value)
  } catch (_) {}
}

function readActiveBindingId(provider, tenantId) {
  const base = ACTIVE_ID_KEY[provider]
  const scoped = storageGet(tenantScopedKey(base, tenantId))
  if (scoped) return scoped
  return storageGet(base)
}

function writeActiveBindingId(provider, tenantId, bindingId) {
  const base = ACTIVE_ID_KEY[provider]
  if (bindingId) {
    storageSet(tenantScopedKey(base, tenantId), bindingId)
    storageSet(base, bindingId)
  } else {
    try {
      wx.removeStorageSync(tenantScopedKey(base, tenantId))
    } catch (_) {}
    try {
      wx.removeStorageSync(base)
    } catch (_) {}
  }
}

/** @param {Record<string, unknown>} raw */
function parseBindingRow(raw) {
  const id = typeof raw.id === 'string' ? raw.id : ''
  const provider =
    raw.provider === 'local_promotion'
      ? 'local_promotion'
      : raw.provider === 'xhs_commercial'
        ? 'xhs_commercial'
        : raw.provider === 'douyin'
          ? 'douyin'
          : null
  const sealed =
    typeof raw.sealed_credentials === 'string' ? raw.sealed_credentials.trim() : ''
  const merchantAccountId =
    typeof raw.merchant_account_id === 'string' ? raw.merchant_account_id.trim() : ''
  if (!id || !provider || !sealed || !merchantAccountId) return null
  return {
    id,
    provider,
    merchantAccountId,
    accountDisplayName:
      typeof raw.account_display_name === 'string' ? raw.account_display_name : '',
    bindingLabel: typeof raw.binding_label === 'string' ? raw.binding_label : '',
    clientKey: typeof raw.client_key === 'string' ? raw.client_key : '',
    sealedCredentials: sealed,
    demoMode: Boolean(raw.demo_mode),
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : '',
  }
}

function unpackLocalPromotion(sealed) {
  try {
    const o = JSON.parse(sealed)
    const accessToken = typeof o.accessToken === 'string' ? o.accessToken.trim() : ''
    if (!accessToken) return null
    return { accessToken, appId: typeof o.appId === 'string' ? o.appId : '' }
  } catch (_) {
    return null
  }
}

function unpackXhsCommercial(sealed) {
  try {
    const o = JSON.parse(sealed)
    const accessToken = typeof o.accessToken === 'string' ? o.accessToken.trim() : ''
    if (!accessToken) return null
    return { accessToken, appId: typeof o.appId === 'string' ? o.appId : '' }
  } catch (_) {
    return null
  }
}

/** @param {ReturnType<typeof parseBindingRow>[]} rows */
function pickActive(rows, provider, tenantId) {
  if (!rows.length) return null
  const activeId = readActiveBindingId(provider, tenantId)
  if (activeId) {
    const found = rows.find((r) => r && r.id === activeId)
    if (found) return found
  }
  return rows[0] || null
}

function clearDouyinLocal() {
  for (const k of DOUYIN_KEYS) {
    try {
      wx.removeStorageSync(k)
    } catch (_) {}
  }
  writePlatformToken('douyin', '')
}

function applyDouyin(row, tenantId) {
  if (!row) {
    clearDouyinLocal()
    writeActiveBindingId('douyin', tenantId, null)
    return
  }
  storageSet('meoo_douyin_merchant_token', row.sealedCredentials)
  writePlatformToken('douyin', row.sealedCredentials)
  if (row.clientKey) storageSet('meoo_douyin_app_id', row.clientKey)
  storageSet('meoo_douyin_merchant_id', row.merchantAccountId)
  const name = row.bindingLabel || row.accountDisplayName || row.merchantAccountId
  if (name) storageSet('meoo_douyin_account_name', name)
  writeActiveBindingId('douyin', tenantId, row.id)
}

function applyLocalPromotion(row, tenantId) {
  const legacyKey = LEGACY_BIND_KEY.local_promotion
  if (!row) {
    writeActiveBindingId('local_promotion', tenantId, null)
    try {
      wx.removeStorageSync(legacyKey)
    } catch (_) {}
    return
  }
  const creds = unpackLocalPromotion(row.sealedCredentials)
  if (!creds) {
    writeActiveBindingId('local_promotion', tenantId, null)
    try {
      wx.removeStorageSync(legacyKey)
    } catch (_) {}
    return
  }
  const state = {
    bindingId: row.id,
    appId: creds.appId,
    accessToken: creds.accessToken,
    localAccountId: row.merchantAccountId,
    accountName: row.bindingLabel || row.accountDisplayName || row.merchantAccountId,
    boundAt: row.updatedAt,
    demoMode: row.demoMode,
  }
  storageSet(legacyKey, JSON.stringify(state))
  writeActiveBindingId('local_promotion', tenantId, row.id)
}

function applyXhsCommercial(row, tenantId) {
  const legacyKey = LEGACY_BIND_KEY.xhs_commercial
  if (!row) {
    writeActiveBindingId('xhs_commercial', tenantId, null)
    try {
      wx.removeStorageSync(legacyKey)
    } catch (_) {}
    return
  }
  const creds = unpackXhsCommercial(row.sealedCredentials)
  if (!creds) {
    writeActiveBindingId('xhs_commercial', tenantId, null)
    try {
      wx.removeStorageSync(legacyKey)
    } catch (_) {}
    return
  }
  const state = {
    bindingId: row.id,
    appId: creds.appId,
    accessToken: creds.accessToken,
    advertiserId: row.merchantAccountId,
    accountName: row.bindingLabel || row.accountDisplayName || row.merchantAccountId,
    boundAt: row.updatedAt,
    demoMode: row.demoMode,
  }
  storageSet(legacyKey, JSON.stringify(state))
  writeActiveBindingId('xhs_commercial', tenantId, row.id)
}

function clearPlatformSessionForAccountSwitch() {
  clearDouyinLocal()
  for (const p of ['local_promotion', 'xhs_commercial']) {
    const k = LEGACY_BIND_KEY[p]
    try {
      wx.removeStorageSync(k)
    } catch (_) {}
  }
  for (const p of PROVIDERS) {
    try {
      wx.removeStorageSync(ACTIVE_ID_KEY[p])
    } catch (_) {}
  }
  for (const plat of ['meituan', 'xiaohongshu', 'jd']) {
    writePlatformToken(plat, '')
  }
}

/**
 * 登出或切换账号时调用，避免下一账号沿用上一账号本地凭证。
 */
function clearMerchantSessionLocal() {
  clearPlatformSessionForAccountSwitch()
  try {
    wx.removeStorageSync(MEOO_ACTIVE_TENANT_ID)
    wx.removeStorageSync(MEOO_MERCHANT_DISPLAY_NAME)
  } catch (_) {}
}

/**
 * 从 Supabase 拉取 tenant_merchant_bindings 并写入与 Web 相同的 storage 键。
 * @param {{ force?: boolean }} [opts]
 */
async function syncFromCloud(opts) {
  if (devAuth.isDevSkipLogin()) return
  if (!api.getAccessToken()) return

  const force = Boolean(opts && opts.force)
  const now = Date.now()
  if (!force && now - lastSyncAt < 15000 && inflight) return inflight
  if (!force && now - lastSyncAt < 15000) return

  if (inflight) return inflight

  inflight = (async () => {
    try {
      const tenantId = await supabaseRest.fetchPrimaryTenantId()
      const prevTenant = storageGet(MEOO_ACTIVE_TENANT_ID)
      if (prevTenant && prevTenant !== tenantId) {
        clearPlatformSessionForAccountSwitch()
      }
      storageSet(MEOO_ACTIVE_TENANT_ID, tenantId)

      try {
        const merchantName = await supabaseRest.fetchTenantMerchantName(tenantId)
        if (merchantName) storageSet(MEOO_MERCHANT_DISPLAY_NAME, merchantName)
      } catch (_) {}

      for (const provider of PROVIDERS) {
        const rawRows = await supabaseRest.fetchMerchantBindings(tenantId, provider)
        const rows = (Array.isArray(rawRows) ? rawRows : [])
          .map((r) => parseBindingRow(r))
          .filter(Boolean)
        const active = pickActive(rows, provider, tenantId)
        if (provider === 'douyin') applyDouyin(active, tenantId)
        else if (provider === 'local_promotion') applyLocalPromotion(active, tenantId)
        else if (provider === 'xhs_commercial') applyXhsCommercial(active, tenantId)
      }
      lastSyncAt = Date.now()
    } finally {
      inflight = null
    }
  })()

  return inflight
}

module.exports = {
  syncFromCloud,
  clearMerchantSessionLocal,
  MEOO_ACTIVE_TENANT_ID,
}
