/**
 * 预留：与 Web sessionStorage 键名一致。小程序不提供绑定页；若后续服务端按租户下发会话，可写入这些键供网关请求复用。
 */
const STORAGE_KEYS = {
  douyin: 'meoo_douyin_merchant_token',
  meituan: 'meoo_meituan_merchant_token',
  xiaohongshu: 'meoo_xhs_merchant_token',
  jd: 'meoo_jd_merchant_token',
}

/** @typedef {'douyin'|'meituan'|'xiaohongshu'|'jd'} CreatePlatformId */

const PLATFORM_TABS = [
  { id: 'douyin', label: '抖音来客', short: '抖' },
  { id: 'meituan', label: '美团', short: '美' },
  { id: 'xiaohongshu', label: '小红书', short: '红' },
  { id: 'jd', label: '京东', short: '京' },
]

function readPlatformToken(/** @type {string} */ platformId) {
  const k = STORAGE_KEYS[platformId]
  if (!k) return ''
  try {
    return String(wx.getStorageSync(k) || '').trim()
  } catch (_) {
    return ''
  }
}

function writePlatformToken(/** @type {string} */ platformId, /** @type {string} */ value) {
  const k = STORAGE_KEYS[platformId]
  if (!k) return
  const v = String(value || '').trim()
  if (v) wx.setStorageSync(k, v)
  else {
    try {
      wx.removeStorageSync(k)
    } catch (_) {}
  }
}

/** 与 Web `createPlatformApiSegment` 一致 */
function apiSegment(/** @type {string} */ platformId) {
  if (platformId === 'xiaohongshu') return 'xhs'
  if (platformId === 'douyin' || platformId === 'meituan' || platformId === 'jd') return platformId
  return null
}

function hasAnyPlatformToken() {
  return PLATFORM_TABS.some((p) => Boolean(readPlatformToken(p.id)))
}

module.exports = {
  STORAGE_KEYS,
  PLATFORM_TABS,
  readPlatformToken,
  writePlatformToken,
  apiSegment,
  hasAnyPlatformToken,
}
