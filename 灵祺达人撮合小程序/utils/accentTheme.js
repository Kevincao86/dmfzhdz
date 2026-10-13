/**
 * 我的页选出的主题色。覆盖身份色，全页（含子包）共用。
 */
const KEY = 'mineAccentId'
const LEGACY_ON = 'mineThemeColorOn'

const PALETTE = {
  violet: { nav: '#7c4dff', dark: '#5b3fd4', soft: '#a78bfa', t50: '#f3eeff', t100: '#e4d9ff', rgb: '124, 77, 255' },
  blue: { nav: '#2563eb', dark: '#1d4ed8', soft: '#93c5fd', t50: '#eff6ff', t100: '#dbeafe', rgb: '37, 99, 235' },
  teal: { nav: '#0f766e', dark: '#115e59', soft: '#5eead4', t50: '#f0fdfa', t100: '#ccfbf1', rgb: '15, 118, 110' },
  orange: { nav: '#ea580c', dark: '#c2410c', soft: '#fdba74', t50: '#fff7ed', t100: '#ffedd5', rgb: '234, 88, 12' },
  rose: { nav: '#e11d48', dark: '#be123c', soft: '#fda4af', t50: '#fff1f2', t100: '#ffe4e6', rgb: '225, 29, 72' },
  green: { nav: '#059669', dark: '#047857', soft: '#6ee7b7', t50: '#ecfdf5', t100: '#d1fae5', rgb: '5, 150, 105' },
  dark: {
    nav: '#18181b',
    dark: '#fafafa',
    soft: '#d4d4d8',
    t50: '#09090b',
    t100: '#27272a',
    rgb: '244, 244, 245',
    text: '#fafafa',
    textSecondary: '#a1a1aa',
    mode: 'dark',
  },
}

const SWATCHES = [
  { id: 'origin', cap: '原色', dotStyle: '' },
  { id: 'violet', color: PALETTE.violet.nav, dotStyle: `background:${PALETTE.violet.nav}` },
  { id: 'blue', color: PALETTE.blue.nav, dotStyle: `background:${PALETTE.blue.nav}` },
  { id: 'teal', color: PALETTE.teal.nav, dotStyle: `background:${PALETTE.teal.nav}` },
  { id: 'orange', color: PALETTE.orange.nav, dotStyle: `background:${PALETTE.orange.nav}` },
  { id: 'rose', color: PALETTE.rose.nav, dotStyle: `background:${PALETTE.rose.nav}` },
  { id: 'green', color: PALETTE.green.nav, dotStyle: `background:${PALETTE.green.nav}` },
  { id: 'dark', color: PALETTE.dark.nav, cap: '暗黑', dotStyle: `background:${PALETTE.dark.nav}` },
]

function readId() {
  try {
    const saved = wx.getStorageSync(KEY)
    if (PALETTE[saved]) return saved
    if (wx.getStorageSync(LEGACY_ON) === '1' || wx.getStorageSync(LEGACY_ON) === true) return 'violet'
  } catch (_) {}
  return ''
}

function pack(id) {
  return PALETTE[id] || null
}

function styleOf(p) {
  const solid = `linear-gradient(180deg,${p.nav} 0%,${p.nav} 100%)`
  const deep = `linear-gradient(180deg,${p.dark} 0%,${p.nav} 100%)`
  return [
    `--lq-primary:${p.nav}`,
    `--lq-primary-dark:${p.dark}`,
    `--lq-primary-deep:${p.dark}`,
    `--lq-nav-bar:${p.nav}`,
    `--lq-primary-soft:${p.soft}`,
    `--lq-primary-50:${p.t50}`,
    `--lq-primary-100:${p.t100}`,
    `--lq-violet:${p.nav}`,
    `--lq-gradient:${solid}`,
    `--lq-gradient-header:${solid}`,
    `--lq-gradient-deep:${p.mode === 'dark' ? solid : deep}`,
    `--lq-gradient-tab:${solid}`,
    `--lq-gradient-tab-track:linear-gradient(90deg,${p.t50} 0%,${p.t50} 100%)`,
    `--lq-gradient-filter:linear-gradient(180deg,${p.mode === 'dark' ? p.t100 : '#ffffff'} 0%,${p.t50} 100%)`,
    `--lq-bg:${p.t50}`,
    `--lq-home-bg:${p.t50}`,
    `--lq-home-nav:${p.nav}`,
    `--lq-home-banner:${solid}`,
    `--lq-card:${p.t100}`,
    `--lq-surface:${p.t100}`,
    `--lq-border:rgba(${p.rgb},0.28)`,
    `--lq-shadow-soft:0 8rpx 28rpx rgba(${p.rgb},0.12)`,
    `--lq-chip-on-bg:${p.t100}`,
    `--lq-chip-on-border:${p.soft}`,
    `--lq-active-tint:rgba(${p.rgb},0.16)`,
    p.text ? `--lq-text:${p.text}` : '',
    p.textSecondary ? `--lq-text-secondary:${p.textSecondary}` : '',
  ].filter(Boolean).join(';') + ';'
}

function viewModel() {
  const id = readId()
  const p = pack(id)
  if (!p) {
    return { lqAccentClass: '', lqPageStyle: '', lqPageBg: '#f7f3ec', lqNavBg: '#f7f3ec', accentId: '' }
  }
  return {
    lqAccentClass: p.mode === 'dark' ? 'lq-accent-on lq-accent-dark' : 'lq-accent-on',
    lqPageStyle: styleOf(p),
    lqPageBg: p.t50,
    lqNavBg: p.nav,
    accentId: id,
  }
}

function pinBar(page) {
  if (!page || typeof page.getTabBar !== 'function') return
  const bar = page.getTabBar()
  if (!bar || typeof bar.setData !== 'function') return
  const view = viewModel()
  const patch = {}
  if (bar.data.lqAccentClass !== view.lqAccentClass) patch.lqAccentClass = view.lqAccentClass
  if (bar.data.lqPageStyle !== view.lqPageStyle) patch.lqPageStyle = view.lqPageStyle
  if (Object.keys(patch).length) bar.setData(patch)
}

function pin(page) {
  if (!page || typeof page.setData !== 'function') return
  const view = viewModel()
  const patch = {}
  ;['lqAccentClass', 'lqPageStyle', 'lqPageBg', 'lqNavBg', 'accentId'].forEach((key) => {
    if (page.data[key] !== view[key]) patch[key] = view[key]
  })
  if (view.accentId && page.data.credCheckboxColor && page.data.credCheckboxColor !== pack(view.accentId).nav) {
    patch.credCheckboxColor = pack(view.accentId).nav
  }
  if (Object.keys(patch).length) page.setData(patch)
  if (view.accentId) {
    const p = pack(view.accentId)
    try {
      wx.setNavigationBarColor({
        frontColor: '#ffffff',
        backgroundColor: p.nav,
        animation: { duration: 0, timingFunc: 'linear' },
      })
    } catch (_) {}
    try {
      if (typeof wx.setBackgroundColor === 'function') {
        wx.setBackgroundColor({
          backgroundColor: p.t50,
          backgroundColorTop: p.nav,
          backgroundColorBottom: p.t50,
        })
      }
    } catch (_) {}
  }
  pinBar(page)
}

function pinAll() {
  try {
    const pages = getCurrentPages()
    pages.forEach(pin)
  } catch (_) {}
}

function save(id) {
  try {
    wx.setStorageSync(KEY, PALETTE[id] ? id : '')
    if (PALETTE[id]) wx.setStorageSync(LEGACY_ON, '1')
    else wx.setStorageSync(LEGACY_ON, '0')
  } catch (_) {}
  pinAll()
  if (!PALETTE[id]) {
    try {
      require('./identityTheme.js').applyToPage(getCurrentPages().slice(-1)[0])
    } catch (_) {}
  }
}

module.exports = {
  PALETTE,
  SWATCHES,
  readId,
  pack,
  viewModel,
  pin,
  pinAll,
  save,
}
