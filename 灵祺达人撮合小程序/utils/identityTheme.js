/**
 * 工作台身份主题（与星选 Web data-work-identity 对齐）
 */
const userProfile = require('./userProfile.js')
const identityTypes = require('./identityTypes.js')

const PACKS = {
  talent: {
    navBar: '#0284c7',
    bg: '#f0f9ff',
    primary: '#0284c7',
    primaryDark: '#0369a1',
    primarySoft: '#38bdf8',
    primary50: '#e0f2fe',
    primary100: '#bae6fd',
    gradient: 'linear-gradient(135deg, #0369a1 0%, #0284c7 52%, #38bdf8 100%)',
    gradientHeader:
      'linear-gradient(145deg, #075985 0%, #0284c7 38%, #38bdf8 72%, #7dd3fc 100%)',
    gradientDeep: 'linear-gradient(165deg, #0369a1 0%, #0284c7 55%, #38bdf8 100%)',
    gradientTab: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 55%, #7dd3fc 100%)',
    gradientTabTrack: 'linear-gradient(90deg, #e0f2fe 0%, #f0f9ff 50%, #fff7ed 100%)',
    gradientFilter: 'linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)',
    border: 'rgba(125, 211, 252, 0.95)',
    shadow: '0 12rpx 0 rgba(2, 132, 199, 0.2)',
    shadowCard: '0 10rpx 0 rgba(186, 230, 253, 0.5)',
    shadowSoft: '0 8rpx 28rpx rgba(2, 132, 199, 0.12)',
    shadowHeader: '0 14rpx 0 rgba(3, 105, 161, 0.22)',
    shadowTab: '0 6rpx 0 rgba(2, 132, 199, 0.28)',
    chipOnBg: '#e0f2fe',
    chipOnBorder: '#7dd3fc',
    activeTint: 'rgba(2, 132, 199, 0.14)',
  },
  shoot: {
    navBar: '#0ea5e9',
    bg: '#f0f9ff',
    primary: '#0ea5e9',
    primaryDark: '#0369a1',
    primarySoft: '#38bdf8',
    primary50: '#e0f2fe',
    primary100: '#bae6fd',
    gradient: 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 52%, #38bdf8 100%)',
    gradientHeader:
      'linear-gradient(145deg, #0369a1 0%, #0ea5e9 38%, #38bdf8 72%, #7dd3fc 100%)',
    gradientDeep: 'linear-gradient(165deg, #0369a1 0%, #0ea5e9 55%, #38bdf8 100%)',
    gradientTab: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 55%, #7dd3fc 100%)',
    gradientTabTrack: 'linear-gradient(90deg, #e0f2fe 0%, #f0f9ff 50%, #ecfeff 100%)',
    gradientFilter: 'linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)',
    border: 'rgba(125, 211, 252, 0.95)',
    shadow: '0 12rpx 0 rgba(14, 165, 233, 0.2)',
    shadowCard: '0 10rpx 0 rgba(186, 230, 253, 0.5)',
    shadowSoft: '0 8rpx 28rpx rgba(14, 165, 233, 0.12)',
    shadowHeader: '0 14rpx 0 rgba(3, 105, 161, 0.22)',
    shadowTab: '0 6rpx 0 rgba(14, 165, 233, 0.28)',
    chipOnBg: '#e0f2fe',
    chipOnBorder: '#7dd3fc',
    activeTint: 'rgba(14, 165, 233, 0.14)',
  },
  edit: {
    navBar: '#14b8a6',
    bg: '#f0fdfa',
    primary: '#14b8a6',
    primaryDark: '#0f766e',
    primarySoft: '#2dd4bf',
    primary50: '#ccfbf1',
    primary100: '#99f6e4',
    gradient: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 52%, #2dd4bf 100%)',
    gradientHeader:
      'linear-gradient(145deg, #0f766e 0%, #14b8a6 38%, #2dd4bf 72%, #5eead4 100%)',
    gradientDeep: 'linear-gradient(165deg, #0f766e 0%, #14b8a6 55%, #2dd4bf 100%)',
    gradientTab: 'linear-gradient(135deg, #14b8a6 0%, #2dd4bf 55%, #5eead4 100%)',
    gradientTabTrack: 'linear-gradient(90deg, #ccfbf1 0%, #f0fdfa 50%, #ecfeff 100%)',
    gradientFilter: 'linear-gradient(180deg, #ffffff 0%, #f0fdfa 100%)',
    border: 'rgba(94, 234, 212, 0.95)',
    shadow: '0 12rpx 0 rgba(20, 184, 166, 0.2)',
    shadowCard: '0 10rpx 0 rgba(153, 246, 228, 0.5)',
    shadowSoft: '0 8rpx 28rpx rgba(20, 184, 166, 0.12)',
    shadowHeader: '0 14rpx 0 rgba(15, 118, 110, 0.22)',
    shadowTab: '0 6rpx 0 rgba(20, 184, 166, 0.28)',
    chipOnBg: '#ccfbf1',
    chipOnBorder: '#5eead4',
    activeTint: 'rgba(20, 184, 166, 0.14)',
  },
  pr: {
    navBar: '#9b87f5',
    bg: '#faf7ff',
    primary: '#7c83ff',
    primaryDark: '#6d28d9',
    primarySoft: '#a5abff',
    primary50: '#f3f1ff',
    primary100: '#e8e4ff',
    gradient: 'linear-gradient(135deg, #8b93ff 0%, #b794f6 52%, #f0abfc 100%)',
    gradientHeader:
      'linear-gradient(145deg, #7c83ff 0%, #9b87f5 38%, #c084fc 72%, #f0abfc 100%)',
    gradientDeep: 'linear-gradient(165deg, #7c83ff 0%, #a78bfa 55%, #f0abfc 100%)',
    gradientTab: 'linear-gradient(135deg, #8b93ff 0%, #b794f6 55%, #f0abfc 100%)',
    gradientTabTrack: 'linear-gradient(90deg, #f3f1ff 0%, #fdf4ff 50%, #fff7ed 100%)',
    gradientFilter: 'linear-gradient(180deg, #ffffff 0%, #faf8ff 100%)',
    border: 'rgba(216, 208, 240, 0.95)',
    shadow: '0 12rpx 0 rgba(199, 186, 255, 0.35)',
    shadowCard: '0 10rpx 0 rgba(216, 200, 255, 0.42)',
    shadowSoft: '0 8rpx 28rpx rgba(139, 147, 255, 0.12)',
    shadowHeader: '0 14rpx 0 rgba(183, 148, 246, 0.28)',
    shadowTab: '0 6rpx 0 rgba(183, 148, 246, 0.38)',
    chipOnBg: '#f3f0ff',
    chipOnBorder: '#ddd6fe',
    activeTint: 'rgba(124, 58, 237, 0.14)',
  },
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

function applyChrome(id) {
  const t = pack(id)
  try {
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: t.navBar,
      animation: { duration: 220, timingFunc: 'easeInOut' },
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
  applyToPage,
  broadcast,
  syncTabBar,
}
