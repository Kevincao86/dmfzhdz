const supabaseRest = require('./supabaseRest.js')

const CACHE_KEY = 'meoo_mp_partner_profile_cache'

function readCache() {
  try {
    const raw = wx.getStorageSync(CACHE_KEY)
    if (!raw || typeof raw !== 'object') return null
    return raw
  } catch (_) {
    return null
  }
}

function writeCache(profile) {
  try {
    wx.setStorageSync(CACHE_KEY, profile)
  } catch (_) {}
}

async function fetchPartnerProfile() {
  const cached = readCache()
  let tenantId = ''
  try {
    tenantId = String(wx.getStorageSync('meoo_active_tenant_id') || '').trim()
  } catch (_) {}
  if (!tenantId) {
    return cached || { isParent: true, isAgent: false, edition: 'partner' }
  }
  try {
    if (typeof supabaseRest.fetchPartnerTenantProfile !== 'function') {
      return cached || { tenantId, isParent: true, isAgent: false, edition: 'partner' }
    }
    const profile = await supabaseRest.fetchPartnerTenantProfile(tenantId)
    writeCache(profile)
    return profile
  } catch (_) {
    return cached || { tenantId, isParent: true, isAgent: false, edition: 'partner' }
  }
}

module.exports = {
  fetchPartnerProfile,
  readCache,
}
