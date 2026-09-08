/** 平台绑定 — 与电脑端商家后台同源官方 Logo（CDN PNG） */
const { assetUrl } = require('./mpStaticAssets.js')

const PLATFORM_COLORS = {
  douyin: '#111827',
  kuaishou: '#ff4906',
  local_promotion: '#2f6deb',
  xhs_commercial: '#ff2442',
  meituan: '#f59e0b',
  xiaohongshu: '#ff2442',
}

/** 与 Web `PLATFORM_LOGO_SRC` / 商品创建页同一套文件 */
const PLATFORM_LOGO_FILES = {
  douyin: 'platforms/douyin-laike.png',
  kuaishou: 'platforms/kuaishou-local.png',
  local_promotion: 'platforms/ocean-engine-local.png',
  xhs_commercial: 'platforms/xhs-juguang.png',
  meituan: 'platforms/dianping.png',
  xiaohongshu: 'platforms/xiaohongshu.png',
}

function platformIconUri(platformId) {
  const file = PLATFORM_LOGO_FILES[platformId]
  return file ? assetUrl(file) : ''
}

module.exports = { platformIconUri, PLATFORM_COLORS, PLATFORM_LOGO_FILES }
