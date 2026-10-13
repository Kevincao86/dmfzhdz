const ops = require('../../utils/opsRegistryTalentMp.js')
const display = require('../../utils/recruitmentDisplay.js')
const coverLib = require('../../utils/recruitCoverLibrary.js')
const userProfile = require('../../utils/userProfile.js')
const auth = require('../../utils/auth.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')
const memberStore = require('../../utils/talentMember.js')
const memberProfileApplyGate = require('../../utils/memberProfileApplyGate.js')
const recruitApplyGate = require('../../utils/recruitApplyGate.js')
const applyTemplates = require('../../utils/applyFormTemplates.js')
const orderFavorites = require('../../utils/orderFavorites.js')

function openBox() {
  const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  let menuBottom = 88
  try {
    const menu = wx.getMenuButtonBoundingClientRect()
    if (menu && menu.bottom) menuBottom = menu.bottom
  } catch (_) {}
  const margin = 12
  const top = Math.max(menuBottom + 12, 96)
  const tab = 96
  const safe = win.safeAreaInsets && win.safeAreaInsets.bottom ? win.safeAreaInsets.bottom : 0
  return {
    top,
    left: margin,
    width: Math.max(200, win.windowWidth - margin * 2),
    height: Math.max(280, win.windowHeight - top - tab - safe),
  }
}

function boxStyle(box) {
  return `top:${box.top}px;left:${box.left}px;width:${box.width}px;height:${box.height}px;`
}

Component({
  properties: {
    orderId: { type: String, value: '' },
    origin: { type: Object, value: null },
    opened: { type: Boolean, value: false },
  },
  data: {
    cardStyle: '',
    loading: true,
    err: '',
    title: '',
    price: '',
    platform: '',
    region: '',
    category: '',
    fans: '不限',
    signup: '',
    location: '',
    cover: '',
    infoLines: [],
    taskLines: [],
    applyLabel: '立即报名',
    isPr: false,
    isIce: false,
    isFormRelay: false,
    merchantOrderNo: '',
    favorited: false,
    shareCover: '',
  },
  observers: {
    'opened, origin': function () {
      this.syncBox()
    },
    orderId: function (id) {
      if (id) this.load(id)
    },
  },
  lifetimes: {
    attached() {
      this.syncBox()
      if (this.data.orderId) this.load(this.data.orderId)
    },
  },
  methods: {
    noop() {},
    syncBox() {
      const origin = this.data.origin || {}
      const box = this.data.opened && this.data.origin ? openBox() : origin.width ? origin : openBox()
      this.setData({ cardStyle: boxStyle(box) })
    },
    onMask() {
      this.triggerEvent('close')
    },
    onToggleFavorite() {
      const id = String(this.data.orderId || '')
      if (!id) return
      if (!auth.isLoggedIn()) {
        guestRoutes.redirectToLogin('/pages/index/index')
        return
      }
      const favorited = orderFavorites.toggleFavorite(id)
      this.setData({ favorited })
      this.triggerEvent('favorite', { id, favorited })
      wx.showToast({ title: favorited ? '已收藏' : '已取消收藏', icon: 'none' })
    },
    load(id) {
      const token = (this._loadToken || 0) + 1
      this._loadToken = token
      this._mp = null
      this.setData({ loading: true, err: '' })
      ops
        .fetchRegistry({ includeMpOrderIds: [id], includeOnly: true })
        .then((reg) => {
          if (this._loadToken !== token) return
          const mp = ops.findMpOrderInRegistry(reg, id)
          if (!mp) {
            this.setData({ loading: false, err: '招募单不存在或已结束' })
            return
          }
          const merchant = display.findMerchantOrder(reg, mp.sourceMerchantOrderId)
          const view = display.enrichMpOrder(mp, merchant)
          this._mp = mp
          let cover = ''
          try {
            cover = coverLib.resolveOrderCoverUrl(mp) || ''
          } catch (_) {}
          const infoLines = (view.recruitmentInfoLines || []).filter(Boolean).slice(0, 24)
          const taskLines = (view.taskDetailLines || [])
            .filter((line) => line && infoLines.indexOf(line) < 0)
            .slice(0, 24)
          this.setData({
            loading: false,
            title: view.title || '',
            price: view.budgetText || '',
            platform: view.platform || '',
            region: view.region && view.region !== '—' ? view.region : '',
            category: view.category || '',
            fans: view.fansRequirement || '不限',
            signup: `报名 ${view.applicantCount || 0}/${view.recruitCount || '不限'}`,
            location: view.merchantLocationDisplay || '',
            cover,
            infoLines,
            taskLines,
            applyLabel: view.isFormRelay ? '查看报名方式' : view.isIce ? '查看任务' : '立即报名',
            isPr: userProfile.readIdentity() === 'pr',
            isIce: !!view.isIce,
            isFormRelay: !!view.isFormRelay,
            merchantOrderNo: view.merchantOrderNo || '',
            favorited: orderFavorites.isFavorite(id),
            shareCover: cover,
          })
          this.triggerEvent('meta', { id, title: view.title || '', cover })
        })
        .catch((e) => {
          if (this._loadToken !== token) return
          this.setData({ loading: false, err: (e && e.message) || '加载失败' })
        })
    },
    onApply() {
      const id = String(this.data.orderId || '')
      if (!id || !this._mp) return
      if (this.data.isPr) return
      if (this.data.isFormRelay || this.data.isIce) {
        wx.navigateTo({ url: `/pages/subpack-core/detail/detail?id=${encodeURIComponent(id)}` })
        return
      }
      const q = [
        `mpId=${encodeURIComponent(id)}`,
        `merchantOrderNo=${encodeURIComponent(this.data.merchantOrderNo || '')}`,
        `platform=${encodeURIComponent(this.data.platform || '抖音')}`,
      ]
      const applyUrl = `/pages/apply/apply?${q.join('&')}`
      if (!auth.isLoggedIn()) {
        guestRoutes.redirectToLogin(applyUrl)
        return
      }
      const workId = userProfile.readIdentity()
      const member = memberStore.readMember()
      if (!memberProfileApplyGate.ensureMemberProfileForApplyOrRedirect(member, workId)) return
      const verdict = recruitApplyGate.validateRecruitmentClaim(this._mp, workId)
      if (!verdict.ok) {
        wx.showToast({ title: verdict.message || '当前不能报名', icon: 'none' })
        return
      }
      try {
        applyTemplates.cacheApplyFormFromMpOrder(this._mp)
      } catch (_) {}
      wx.navigateTo({ url: applyUrl })
    },
  },
})
