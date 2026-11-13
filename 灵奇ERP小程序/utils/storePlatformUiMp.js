/** 店铺信息 / 店铺装修 — 平台 Tab（图2：短名 + 绑定后显示 Logo） */
const devAuth = require('./devAuth.js')
const { ALL_OPTIONS } = require('./productCreatePlatformsMp.js')
const { readPlatformToken } = require('./platformTokensMp.js')

const SHORT_LABELS = {
  douyin: '抖音',
  meituan: '美团',
  xiaohongshu: '小红书',
  kuaishou: '快手',
  eleme: '闪购',
  meituan_waimai: '外卖',
  jd_waimai: '京东',
}

const PREVIEW_CONNECTED = ['douyin', 'meituan', 'xiaohongshu']

function isPlatformConnected(platformId) {
  if (Boolean(readPlatformToken(platformId))) return true
  return devAuth.isDevSkipLogin() && PREVIEW_CONNECTED.includes(platformId)
}

function buildStorePlatformTabs() {
  return ALL_OPTIONS.filter((p) => !p.comingSoon).map((p) => {
    const connected = isPlatformConnected(p.id)
    return {
      id: p.id,
      name: p.name,
      shortLabel: SHORT_LABELS[p.id] || p.name.slice(0, 2),
      logo: p.logo || '',
      connected,
      showLogo: connected && Boolean(p.logo),
    }
  })
}

function findStorePlatformTab(platformId) {
  return buildStorePlatformTabs().find((p) => p.id === platformId) || null
}

function platformCardStatus(platformId, connected, hasStores) {
  if (!connected) {
    return {
      statusText: '待完善',
      statusClass: 'warn',
      subtitle: '完善店铺信息，获得更多曝光',
      meta: '店铺名称、地址、营业时间等',
      actionLabel: '去完善',
    }
  }
  if (hasStores) {
    return {
      statusText: '已同步',
      statusClass: 'ok',
      subtitle: '',
      meta: '',
      actionLabel: '查看店铺',
    }
  }
  return {
    statusText: '已绑定',
    statusClass: 'ok',
    subtitle: '授权已接通，门店数据同步中',
    meta: '',
    actionLabel: '查看详情',
  }
}

module.exports = {
  buildStorePlatformTabs,
  findStorePlatformTab,
  platformCardStatus,
  isPlatformConnected,
}
