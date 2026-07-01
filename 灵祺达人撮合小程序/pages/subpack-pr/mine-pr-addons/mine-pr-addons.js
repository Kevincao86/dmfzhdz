const userProfile = require('../../../utils/userProfile.js')
const auth = require('../../../utils/auth.js')
const prFeatureAccess = require('../../../utils/prFeatureAccess.js')
const identityTheme = require('../../../utils/identityTheme.js')
const mpFeatureFlags = require('../../../utils/mpFeatureFlags.js')

const AI_ADDONS = [
  {
    key: 'shortvideo',
    title: '短视频 AI 处理',
    sub: '参考画面 · 生成 · 灵祺 AI 云剪',
    glyph: '▶',
    tone: 'violet',
    url: '/pages/subpack-pr/mine-pr-addon-shortvideo/mine-pr-addon-shortvideo',
  },
  {
    key: 'aiContent',
    title: 'AI 文章与话题',
    sub: '抖音来客文案辅助与话题策划',
    glyph: '✎',
    tone: 'sky',
    url: '/pages/subpack-pr/mine-pr-addon-ai-content/mine-pr-addon-ai-content',
  },
  {
    key: 'digitalHuman',
    title: '数字人口播',
    sub: 'TTS 配音 · 口播视频一键生成',
    glyph: '◉',
    tone: 'rose',
    url: '/pages/subpack-pr/mine-pr-addon-digital-human/mine-pr-addon-digital-human',
  },
]

function buildAiAddons(addonsEnabled) {
  return AI_ADDONS.map((item) => ({
    ...item,
    cardClass: `addon-card--${item.tone}${addonsEnabled ? '' : ' addon-card--dim'}`,
  }))
}

Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  data: {
    addonsEnabled: false,
    aiAddons: buildAiAddons(false),
  },
  onShow() {
    if (!mpFeatureFlags.ADDONS_NAV_VISIBLE) {
      wx.switchTab({ url: '/pages/mine/mine' })
      return
    }
    const identity = userProfile.readIdentity()
    if (!['pr', 'talent', 'shoot', 'edit'].includes(identity)) {
      wx.switchTab({ url: '/pages/mine/mine' })
      return
    }
    identityTheme.applyChrome(identity === 'pr' ? 'pr' : identity, { animate: false })
    this.refresh()
  },
  refresh() {
    const account = auth.readAccount()
    const addonsEnabled = prFeatureAccess.canUsePrAddons(account)
    this.setData({
      addonsEnabled,
      aiAddons: buildAiAddons(addonsEnabled),
    })
  },
  onAddonTap(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    if (!this.data.addonsEnabled) {
      wx.showModal({
        title: '增值服务待开通',
        content:
          '短视频 AI、AI 文章与话题、数字人口播需由灵祺运营在后台开通后方可使用。如有合作意向请联系灵祺运营。',
        showCancel: false,
        confirmText: '知道了',
      })
      return
    }
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    wx.navigateTo({ url })
  },
  onContactOps() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-support/mine-support' })
  },
})
