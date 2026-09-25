/**
 * 工作台身份主题（与星选 Web data-work-identity 对齐）
 */
const userProfile = require('./userProfile.js')
const identityTypes = require('./identityTypes.js')

function solidPack(nav, dark, soft, tint50, tint100, chipBorder, tintRgb) {
  return {
    navBar: nav,
    bg: '#f7f6fb',
    primary: nav,
    primaryDark: dark,
    primarySoft: soft,
    primary50: tint50,
    primary100: tint100,
    gradient: `linear-gradient(180deg, ${nav} 0%, ${nav} 100%)`,
    gradientHeader: `linear-gradient(180deg, ${nav} 0%, ${nav} 100%)`,
    gradientDeep: `linear-gradient(180deg, ${dark} 0%, ${nav} 100%)`,
    gradientTab: `linear-gradient(180deg, ${nav} 0%, ${nav} 100%)`,
    gradientTabTrack: `linear-gradient(90deg, ${tint50} 0%, #f7f6fb 100%)`,
    gradientFilter: 'linear-gradient(180deg, #ffffff 0%, #f7f6fb 100%)',
    border: `rgba(${tintRgb}, 0.16)`,
    shadow: '0 8rpx 28rpx rgba(20, 24, 31, 0.04)',
    shadowCard: '0 8rpx 24rpx rgba(20, 24, 31, 0.04)',
    shadowSoft: `0 8rpx 28rpx rgba(${tintRgb}, 0.1)`,
    shadowHeader: 'none',
    shadowTab: 'none',
    chipOnBg: tint50,
    chipOnBorder: chipBorder,
    activeTint: `rgba(${tintRgb}, 0.12)`,
  }
}

const PACKS = {
  talent: solidPack('#7c4dff', '#5b3fd4', '#a78bfa', '#f3eeff', '#e4d9ff', '#c4b5fd', '124, 77, 255'),
  shoot: solidPack('#5b67f1', '#3f4ad4', '#a5b0ff', '#eef0ff', '#dde1ff', '#c7cdff', '91, 103, 241'),
  edit: solidPack('#9b6dff', '#7a4fe0', '#c4b5fd', '#f4eeff', '#e7dcff', '#d4c4ff', '155, 109, 255'),
  pr: solidPack('#5b2dcc', '#431ea8', '#8b6cf0', '#efe8ff', '#ddd0ff', '#cbb8ff', '91, 45, 204'),
}

function normalize(id) {
  const v = String(id || '').trim()
  return identityTypes.isWorkIdentity(v) ? v : 'talent'
}

function pack(id) {
  return PACKS[normalize(id)] || PACKS.talent
}

function themeClass(id) {
  return `lq-theme-${normalize(id)}`
}

function applyChrome(id, opts) {
  const t = pack(id)
  const animate = opts && opts.animate === false ? false : true
  try {
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: t.navBar,
      animation: animate
        ? { duration: 220, timingFunc: 'easeInOut' }
        : { duration: 0, timingFunc: 'linear' },
    })
  } catch (_) {}
  try {
    if (typeof wx.setBackgroundColor === 'function') {
      wx.setBackgroundColor({
        backgroundColor: t.bg,
        backgroundColorTop: t.navBar,
        backgroundColorBottom: t.bg,
      })
    }
  } catch (_) {}
  try {
    const app = getApp()
    if (app && app.globalData) {
      app.globalData.workIdentityTheme = normalize(id)
    }
  } catch (_) {}
}

/** Tab 首页/推荐/消息：顶栏与下拉背景随工作台身份（达人蓝 / PR 紫） */
function applyTabHomeChrome() {
  applyChrome(userProfile.readIdentity(), { animate: false })
}

function applyToPage(page) {
  if (!page || typeof page.setData !== 'function') return
  const id = userProfile.readIdentity()
  const t = pack(id)
  page.setData({
    lqThemeClass: themeClass(id),
    credCheckboxColor: t.primary,
  })
  applyChrome(id)
}

function syncTabBar() {
  try {
    const id = userProfile.readIdentity()
    const cls = themeClass(id)
    const { getTabList } = require('./tabBarConfig.js')
    const list = getTabList(id)
    const hasCenterFab = list.some((item) => item && item.center)
    const pages = getCurrentPages()
    for (let i = pages.length - 1; i >= 0; i--) {
      const page = pages[i]
      if (!page || typeof page.getTabBar !== 'function') continue
      const bar = page.getTabBar()
      if (bar && typeof bar.setData === 'function') {
        bar.setData({ lqThemeClass: cls, list, hasCenterFab })
        break
      }
    }
  } catch (_) {}
}

function broadcast() {
  const id = userProfile.readIdentity()
  applyChrome(id)
  const cls = themeClass(id)
  try {
    const pages = getCurrentPages()
    for (const page of pages) {
      if (page && typeof page.setData === 'function') {
        page.setData({ lqThemeClass: cls })
      }
    }
  } catch (_) {}
  syncTabBar()
}

module.exports = {
  PACKS,
  pack,
  normalize,
  themeClass,
  applyChrome,
  applyTabHomeChrome,
  applyToPage,
  broadcast,
  syncTabBar,
}
