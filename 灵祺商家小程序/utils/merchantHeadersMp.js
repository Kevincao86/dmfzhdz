/**
 * 与 Web `reviewsMerchantApi.platformSessionHeaders` 同源：多单平台 Bearer / X-Meoo-*，
 * 供评论、活动等需按平台路由的网关接口使用。
 */
const { readPlatformToken } = require('./platformTokensMp.js')

function multiPlatformMerchantHeaders() {
  const pairs = [
    ['douyin', 'X-Meoo-Douyin-Token'],
    ['kuaishou', 'X-Meoo-Kuaishou-Token'],
    ['meituan', 'X-Meoo-Meituan-Token'],
    ['xiaohongshu', 'X-Meoo-Xhs-Token'],
    ['eleme', 'X-Meoo-Eleme-Token'],
    ['meituan_waimai', 'X-Meoo-Meituan-Waimai-Token'],
    ['jd_waimai', 'X-Meoo-Jd-Waimai-Token'],
  ]
  /** @type {Record<string,string>} */
  const h = { Accept: 'application/json', 'Content-Type': 'application/json' }
  let primary = ''
  for (const [plat, hdr] of pairs) {
    const t = readPlatformToken(plat)
    if (t) {
      h[hdr] = t
      if (!primary) primary = t
    }
  }
  if (primary) h.Authorization = `Bearer ${primary}`
  return h
}

function tokenForReviewsApiPlatform(platform) {
  const map = {
    douyin: 'douyin',
    kuaishou: 'kuaishou',
    meituan: 'meituan',
    xhs: 'xiaohongshu',
    eleme: 'eleme',
    meituan_waimai: 'meituan_waimai',
    jd_waimai: 'jd_waimai',
  }
  const pid = map[platform]
  return pid ? readPlatformToken(pid) : ''
}

module.exports = {
  multiPlatformMerchantHeaders,
  tokenForReviewsApiPlatform,
}
