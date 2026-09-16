/**
 * 工作台身份主题（与星选 Web data-work-identity 对齐）
 */
const userProfile = require('./userProfile.js')
const identityTypes = require('./identityTypes.js')

const PACKS = {
  talent: {
    navBar: '#1e3a5f',
    bg: '#e8eef4',
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
    shadow: '0 8rpx 28rpx rgba(20, 24, 31, 0.06)',
    shadowCard: '0 8rpx 24rpx rgba(20, 24, 31, 0.06)',
    shadowSoft: '0 8rpx 28rpx rgba(2, 132, 199, 0.12)',
    shadowHeader: '0 8rpx 24rpx rgba(3, 105, 161, 0.16)',
    shadowTab: '0 6rpx 16rpx rgba(2, 132, 199, 0.18)',
    chipOnBg: '#e0f2fe',
    chipOnBorder: '#7dd3fc',
    activeTint: 'rgba(2, 132, 199, 0.14)',
  },
  shoot: {
    navBar: '#0ea5e9',
    bg: '#e8eef4',
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
    shadow: '0 8rpx 28rpx rgba(20, 24, 31, 0.06)',
    shadowCard: '0 8rpx 24rpx rgba(20, 24, 31, 0.06)',
    shadowSoft: '0 8rpx 28rpx rgba(14, 165, 233, 0.12)',
    shadowHeader: '0 8rpx 24rpx rgba(3, 105, 161, 0.16)',
    shadowTab: '0 6rpx 16rpx rgba(14, 165, 233, 0.18)',
    chipOnBg: '#e0f2fe',
    chipOnBorder: '#7dd3fc',
    activeTint: 'rgba(14, 165, 233, 0.14)',
  },
  edit: {
    navBar: '#14b8a6',
    bg: '#e8eef4',
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
    shadow: '0 8rpx 28rpx rgba(20, 24, 31, 0.06)',
    shadowCard: '0 8rpx 24rpx rgba(20, 24, 31, 0.06)',
    shadowSoft: '0 8rpx 28rpx rgba(20, 184, 166, 0.12)',
    shadowHeader: '0 8rpx 24rpx rgba(15, 118, 110, 0.16)',
    shadowTab: '0 6rpx 16rpx rgba(20, 184, 166, 0.18)',
    chipOnBg: '#ccfbf1',
    chipOnBorder: '#5eead4',
    activeTint: 'rgba(20, 184, 166, 0.14)',
  },
  pr: {
    navBar: '#4c1d95',
    bg: '#e8eef4',
    primary: '#7c3aed',
    primaryDark: '#6d28d9',
    primarySoft: '#8b5cf6',
    primary50: '#f3e8ff',
    primary100: '#e9d5ff',
    gradient: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 52%, #8b5cf6 100%)',
    gradientHeader:
      'linear-gradient(145deg, #5b21b6 0%, #7c3aed 38%, #8b5cf6 72%, #a78bfa 100%)',
    gradientDeep: 'linear-gradient(165deg, #6d28d9 0%, #7c3aed 55%, #8b5cf6 100%)',
    gradientTab: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 55%, #a78bfa 100%)',
    gradientTabTrack: 'linear-gradient(90deg, #f3e8ff 0%, #fdf4ff 50%, #fff7ed 100%)',
    gradientFilter: 'linear-gradient(180deg, #ffffff 0%, #e8eef4 100%)',
    border: 'rgba(216, 208, 240, 0.95)',
    shadow: '0 8rpx 28rpx rgba(20, 24, 31, 0.06)',
    shadowCard: '0 8rpx 24rpx rgba(20, 24, 31, 0.06)',
    shadowSoft: '0 8rpx 28rpx rgba(124, 58, 237, 0.12)',
    shadowHeader: '0 8rpx 24rpx rgba(109, 40, 217, 0.16)',
    shadowTab: '0 6rpx 16rpx rgba(124, 58, 237, 0.18)',
    chipOnBg: '#f3e8ff',
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
