const userProfile = require('../../utils/userProfile.js')
const identityTypes = require('../../utils/identityTypes.js')
const identityTheme = require('../../utils/identityTheme.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')
const { attachLoginIdentityIcons } = require('../../utils/loginIdentityIcons.js')
const mpCdnAssets = require('../../utils/mpCdnAssets.js')
const mpShare = require('../../utils/mpShare.js')
const { applyWelcomeNavBar } = require('../../utils/mpPlatformUi.js')

const SPLASH_IDENTITIES = attachLoginIdentityIcons([
  { id: 'talent', label: '达人', sub: '浏览商单 · 报名招募' },
  { id: 'pr', label: 'PR', sub: '发招募 · 智能荐达人' },
  { id: 'shoot', label: '拍摄', sub: '拍摄团队 · 接单大厅' },
  { id: 'edit', label: '剪辑', sub: '剪辑团队 · 接单大厅' },
])

const TRANSITION_MS = 420

Page({
  data: {
    navBandStyle: '',
    navInnerStyle: '',
    identityOptions: SPLASH_IDENTITIES,
    authHeroBg: mpCdnAssets.welcomeHeroBg,
    authBottomDeco: mpCdnAssets.welcomeBottomDeco,
    showHeroBg: true,
    showDecoImg: true,
    transitionOn: false,
    transitionColor: '#9b87f5',
    pickedId: '',
  },

  onLoad() {
    try {
      applyWelcomeNavBar()
      mpShare.enableShareMenu()
      mpShare.preloadShareCover()
      this.applyNavPadding()
    } catch (e) {
      console.error('[welcome] onLoad', e)
    }
  },

  onShow() {
    try {
      applyWelcomeNavBar()
      mpShare.enableShareMenu()
      mpShare.preloadShareCover()
      this.applyNavPadding()
      if (!this._transitioning) {
        this.setData({ transitionOn: false, pickedId: '' })
      }
    } catch (e) {
      console.error('[welcome] onShow', e)
    }
  },

  onShareAppMessage() {
    return mpShare.defaultShare('/pages/index/index')
  },

  onShareTimeline() {
    return mpShare.defaultTimelineShare()
  },

  applyNavPadding() {
    applyCapsulePadding(this, null, { band: 'navBandStyle', right: 'navInnerStyle' })
  },

  onDecoImgError() {
    this.setData({ showDecoImg: false })
  },

  onHeroBgError() {
    this.setData({ showHeroBg: false })
  },

  onIdentityIconError(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    if (!id) return
    const current = (this.data.identityOptions || []).find((x) => x && x.id === id)
    const { loginIdentityIconCdnFallback } = require('../../utils/loginIdentityIcons.js')
    const candidates = [
      loginIdentityIconCdnFallback(id),
      mpCdnAssets.ossAssetUrl(`identity/identity-${id}.png`),
    ].filter(Boolean)
    const fallback = candidates.find((url) => url && url !== (current && current.icon))
    if (!fallback) return
    const opts = (this.data.identityOptions || []).map((item) =>
      item && item.id === id ? { ...item, icon: fallback } : item,
    )
    this.setData({ identityOptions: opts })
  },

  onPickIdentity(e) {
    const id = e.currentTarget.dataset.id
    if (!identityTypes.isWorkIdentity(id) || this._transitioning) return

    const pack = identityTheme.pack(id)
    this._transitioning = true

    this.setData({
      pickedId: id,
      transitionColor: pack.navBar,
      transitionOn: true,
    })

    userProfile.writeIdentity(id)
    identityTheme.applyChrome(id)

    setTimeout(() => {
      wx.switchTab({
        url: '/pages/index/index',
        complete: () => {
          this._transitioning = false
          this.setData({ transitionOn: false, pickedId: '' })
        },
      })
    }, TRANSITION_MS)
  },
})
