/** 小程序内商家版 / 服务商版切换（与 fws Web 能力对齐，默认商家版） */
const STORAGE_KEY = 'meoo_mp_app_edition'

const EDITION_MERCHANT = 'merchant'
const EDITION_PARTNER = 'partner'

function normalize(raw) {
  return raw === EDITION_PARTNER ? EDITION_PARTNER : EDITION_MERCHANT
}

function getEdition() {
  try {
    return normalize(wx.getStorageSync(STORAGE_KEY))
  } catch (_) {
    return EDITION_MERCHANT
  }
}

function setEdition(edition) {
  const next = normalize(edition)
  try {
    wx.setStorageSync(STORAGE_KEY, next)
  } catch (_) {}
  try {
    const app = getApp()
    if (app && app.globalData) app.globalData.mpEdition = next
  } catch (_) {}
  return next
}

function isPartnerEdition() {
  return getEdition() === EDITION_PARTNER
}

function editionLabel(edition) {
  return normalize(edition) === EDITION_PARTNER ? '服务商版' : '商家版'
}

function peerEditionLabel(edition) {
  return normalize(edition) === EDITION_PARTNER ? '商家版' : '服务商版'
}

function peerEdition(edition) {
  return normalize(edition) === EDITION_PARTNER ? EDITION_MERCHANT : EDITION_PARTNER
}

function rememberScope(edition) {
  return normalize(edition) === EDITION_PARTNER ? 'partner' : 'merchant'
}

function isPartnerTenantEdition(editionRaw) {
  const e = String(editionRaw || '')
    .trim()
    .toLowerCase()
  return e === 'partner' || e === 'partner_agent'
}

/** 登录后校验：所选小程序版本须与租户 edition 一致（对齐 cs / fws 分站） */
function validateTenantMatchesEdition(tenantEditionRaw, selectedEdition) {
  const isPartnerTenant = isPartnerTenantEdition(tenantEditionRaw)
  const isPartnerApp = normalize(selectedEdition) === EDITION_PARTNER
  if (isPartnerApp && !isPartnerTenant) {
    return {
      ok: false,
      message: '该账号为商家版账号，请点击「切换到商家版」后重新登录',
    }
  }
  if (!isPartnerApp && isPartnerTenant) {
    return {
      ok: false,
      message: '该账号为服务商版账号，请点击「切换到服务商版」后重新登录',
    }
  }
  return { ok: true }
}

function editionHubTitle(edition) {
  return normalize(edition) === EDITION_PARTNER ? '服务商能力中心' : '商家能力中心'
}

function editionHubSubtitle(edition) {
  return normalize(edition) === EDITION_PARTNER
    ? '客户门店 · 商品 · 星选招募 · AI创作 · 投流 · 财务 · 系统'
    : '店铺 · 商品 · 运营 · AI创作 · 投流 · 线索 · 财务'
}

function agentTopTitle(edition) {
  return normalize(edition) === EDITION_PARTNER ? '灵祺小助理 · 服务商' : '灵祺小助理'
}

module.exports = {
  STORAGE_KEY,
  EDITION_MERCHANT,
  EDITION_PARTNER,
  getEdition,
  setEdition,
  isPartnerEdition,
  editionLabel,
  peerEditionLabel,
  peerEdition,
  rememberScope,
  isPartnerTenantEdition,
  validateTenantMatchesEdition,
  editionHubTitle,
  editionHubSubtitle,
  agentTopTitle,
}
