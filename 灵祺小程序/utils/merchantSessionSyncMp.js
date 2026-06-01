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

const PROVIDERS = ['douyin', 'kuaishou', 'local_promotion', 'xhs_commercial']

const ACTIVE_ID_KEY = {
  douyin: 'meoo_active_douyin_binding_id',
  kuaishou: 'meoo_active_kuaishou_binding_id',
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

const KUAISHOU_KEYS = [
  'meoo_kuaishou_merchant_token',
  'meoo_kuaishou_app_id',
  'meoo_kuaishou_merchant_id',
  'meoo_kuaishou_account_name',
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
        : raw.provider === 'kuaishou'
          ? 'kuaishou'
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

function clearKuaishouLocal() {
  for (const k of KUAISHOU_KEYS) {
    try {
      wx.removeStorageSync(k)
    } catch (_) {}
  }
  writePlatformToken('kuaishou', '')
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

function applyKuaishou(row, tenantId) {
  if (!row) {
    clearKuaishouLocal()
    writeActiveBindingId('kuaishou', tenantId, null)
    return
  }
  storageSet('meoo_kuaishou_merchant_token', row.sealedCredentials)
  writePlatformToken('kuaishou', row.sealedCredentials)
  if (row.clientKey) storageSet('meoo_kuaishou_app_id', row.clientKey)
  storageSet('meoo_kuaishou_merchant_id', row.merchantAccountId)
  const name = row.bindingLabel || row.accountDisplayName || row.merchantAccountId
  if (name) storageSet('meoo_kuaishou_account_name', name)
  writeActiveBindingId('kuaishou', tenantId, row.id)
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
  clearKuaishouLocal()
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

/** @type {string} */
let lastSyncError = ''

function readBindingSnapshotFromStorage() {
  function readName(tokenKey, nameKey, idKey) {
    const tok = storageGet(tokenKey)
    if (!tok) return { bound: false, accountName: '' }
    const name = storageGet(nameKey) || storageGet(idKey)
    return { bound: true, accountName: name || '已绑定' }
  }
  const lpRaw = storageGet(LEGACY_BIND_KEY.local_promotion)
  let lp = { bound: false, accountName: '' }
  if (lpRaw) {
    try {
      const o = JSON.parse(lpRaw)
      lp = {
        bound: Boolean(o && o.accessToken),
        accountName: (o && (o.accountName || o.localAccountId)) || '已绑定',
      }
    } catch (_) {}
  }
  const xhsRaw = storageGet(LEGACY_BIND_KEY.xhs_commercial)
  let xhs = { bound: false, accountName: '' }
  if (xhsRaw) {
    try {
      const o = JSON.parse(xhsRaw)
      xhs = {
        bound: Boolean(o && o.accessToken),
        accountName: (o && (o.accountName || o.advertiserId)) || '已绑定',
      }
    } catch (_) {}
  }
  return {
    douyin: readName(
      'meoo_douyin_merchant_token',
      'meoo_douyin_account_name',
      'meoo_douyin_merchant_id',
    ),
    kuaishou: readName(
      'meoo_kuaishou_merchant_token',
      'meoo_kuaishou_account_name',
      'meoo_kuaishou_merchant_id',
    ),
    localPromotion: lp,
    xhsCommercial: xhs,
    meituan: readName('meoo_meituan_merchant_token', '', ''),
    xiaohongshu: readName('meoo_xhs_merchant_token', '', ''),
  }
}

function applyStoreIntel(row, tenantId) {
  if (!row || typeof row !== 'object') return
  const margin = row.margin_config
  if (margin && typeof margin === 'object') {
    storageSet(tenantScopedKey('meoo_store_margin_config_v1', tenantId), JSON.stringify(margin))
    if (margin.margins && typeof margin.margins === 'object') {
      storageSet(
        tenantScopedKey('meoo_store_gross_margins_v1', tenantId),
        JSON.stringify(margin.margins),
      )
    }
  }
  const items = Array.isArray(row.menu_items) ? row.menu_items : []
  if (items.length) {
    const menuRec = {
      id: `menu-cloud-${tenantId}`,
      storeName: typeof row.menu_store_name === 'string' ? row.menu_store_name : '',
      images: [],
      items,
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
    }
    storageSet(tenantScopedKey('meoo_store_menu_v1', tenantId), JSON.stringify(menuRec))
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

  lastSyncError = ''
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

      try {
        const storeIntel = await supabaseRest.fetchTenantStoreIntel(tenantId)
        if (storeIntel) applyStoreIntel(storeIntel, tenantId)
      } catch (e) {
        lastSyncError = (e && e.message) || lastSyncError || '同步门店情报失败'
      }

      for (const provider of PROVIDERS) {
        let rawRows = []
        try {
          rawRows = await supabaseRest.fetchMerchantBindings(tenantId, provider)
        } catch (e) {
          lastSyncError = (e && e.message) || '同步平台绑定失败'
          continue
        }
        const rows = (Array.isArray(rawRows) ? rawRows : [])
          .map((r) => parseBindingRow(r))
          .filter(Boolean)
        if (!rows.length) continue
        const active = pickActive(rows, provider, tenantId)
        if (!active) continue
        if (provider === 'douyin') applyDouyin(active, tenantId)
        else if (provider === 'kuaishou') applyKuaishou(active, tenantId)
        else if (provider === 'local_promotion') applyLocalPromotion(active, tenantId)
        else if (provider === 'xhs_commercial') applyXhsCommercial(active, tenantId)
      }
      lastSyncAt = Date.now()
    } catch (e) {
      lastSyncError = (e && e.message) || '同步失败'
      throw e
    } finally {
      inflight = null
    }
  })()

  return inflight
}

function getLastSyncError() {
  return lastSyncError
}

module.exports = {
  syncFromCloud,
  clearMerchantSessionLocal,
  readBindingSnapshotFromStorage,
  getLastSyncError,
  MEOO_ACTIVE_TENANT_ID,
}
