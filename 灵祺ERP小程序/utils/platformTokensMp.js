/**
 * 与 Web `merchantSession` / `merchantPlatforms.tokenSessionKey` 键名一致。
 */
const STORAGE_KEYS = {
  douyin: 'meoo_douyin_merchant_token',
  meituan: 'meoo_meituan_merchant_token',
  xiaohongshu: 'meoo_xhs_merchant_token',
  jd: 'meoo_jd_merchant_token',
  kuaishou: 'meoo_kuaishou_merchant_token',
  eleme: 'meoo_eleme_merchant_token',
  meituan_waimai: 'meoo_meituan_waimai_merchant_token',
  jd_waimai: 'meoo_jd_waimai_merchant_token',
}

/** 列表 Tab（与新建商品分组一致：团购 + 外卖，共 8 个平台） */
const PLATFORM_TABS = [
  { id: 'douyin', label: '抖音来客' },
  { id: 'meituan', label: '美团团购' },
  { id: 'xiaohongshu', label: '小红书' },
  { id: 'kuaishou', label: '快手团购' },
  { id: 'jd', label: '京东本地生活' },
  { id: 'eleme', label: '淘宝闪购' },
  { id: 'meituan_waimai', label: '美团外卖' },
  { id: 'jd_waimai', label: '京东外卖' },
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
  if (
    platformId === 'douyin' ||
    platformId === 'meituan' ||
    platformId === 'jd' ||
    platformId === 'kuaishou'
  ) {
    return platformId
  }
  if (platformId === 'eleme') return 'eleme'
  if (platformId === 'meituan_waimai') return 'meituan_waimai'
  if (platformId === 'jd_waimai') return 'jd_waimai'
  return null
}

function hasAnyPlatformToken() {
  return Object.keys(STORAGE_KEYS).some((id) => Boolean(readPlatformToken(id)))
}

module.exports = {
  STORAGE_KEYS,
  PLATFORM_TABS,
  readPlatformToken,
  writePlatformToken,
  apiSegment,
  hasAnyPlatformToken,
}
