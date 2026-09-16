const userProfile = require('../../utils/userProfile.js')
const identityTypes = require('../../utils/identityTypes.js')
const identityTheme = require('../../utils/identityTheme.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')
const mpShare = require('../../utils/mpShare.js')
const mpPendingDistributionRef = require('../../utils/mpPendingDistributionRef.js')

const SPLASH_IDENTITY_META = [
  { id: 'pr', label: 'PR', mark: '招商', sub: '发招募，对接达人' },
  { id: 'talent', label: '达人', mark: '接单', sub: '浏览商单，报名合作' },
  { id: 'shoot', label: '拍摄', mark: '跟拍', sub: '现场交付，档期接单' },
  { id: 'edit', label: '剪辑', mark: '成片', sub: '精剪交付，档期接单' },
]

const TRANSITION_MS = 420

Page({
  data: {
    navBandStyle: '',
    identityOptions: SPLASH_IDENTITY_META,
    transitionOn: false,
    transitionColor: '#1e3a5f',
    pickedId: '',
  },

  onLoad(options) {
    try {
      mpShare.enableShareMenu()
      mpPendingDistributionRef.captureFromOptions(options || {})
      this.applyNavPadding()
    } catch (e) {
      console.error('[welcome] onLoad', e)
    }
    setTimeout(() => {
      try {
        mpShare.preloadShareCover()
      } catch (_) {}
    }, 600)
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
    applyCapsulePadding(this, null, { band: 'navBandStyle' })
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
