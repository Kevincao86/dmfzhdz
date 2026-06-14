const userProfile = require('../../utils/userProfile.js')
const identityTypes = require('../../utils/identityTypes.js')
const identityTheme = require('../../utils/identityTheme.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')
const { attachLoginIdentityIcons } = require('../../utils/loginIdentityIcons.js')
const mpShare = require('../../utils/mpShare.js')

const SPLASH_IDENTITIES = attachLoginIdentityIcons([
  { id: 'talent', label: '达人', sub: '浏览商单 · 报名招募' },
  { id: 'pr', label: 'PR', sub: '发招募 · 智能荐达人' },
  { id: 'shoot', label: '拍摄', sub: '拍摄团队 · 接单大厅' },
  { id: 'edit', label: '剪辑', sub: '剪辑团队 · 接单大厅' },
])

const WELCOME_HERO_LOCAL = '/images/auth/welcome-hero-bg.jpg'
const WELCOME_DECO_LOCAL = '/images/auth/welcome-bottom-deco.jpg'
const TRANSITION_MS = 360

Page({
  data: {
    navBandStyle: '',
    navInnerStyle: '',
    identityOptions: SPLASH_IDENTITIES,
    authHeroBg: WELCOME_HERO_LOCAL,
    authBottomDeco: WELCOME_DECO_LOCAL,
    transitionOn: false,
    transitionColor: '#0284c7',
    pickedId: '',
  },

  onLoad() {
    try {
      mpShare.enableShareMenu()
      this.applyNavPadding()
    } catch (e) {
      console.error('[welcome] onLoad', e)
    }
  },

  onShow() {
    try {
      mpShare.enableShareMenu()
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
