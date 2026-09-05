const api = require('../../utils/api.js')
const platformBindingsMp = require('../../utils/platformBindingsMp.js')
const { iconDataUri } = require('../../utils/funcIconAssetsMp.js')
const mpUi = require('../../utils/mpUiFlags.js')

const WEB_CS = 'https://cs.mofangdianai.com'

Page({
  data: {
    guestMode: false,
    bindingsLoading: false,
    bindingsHint: '',
    cloudPlatformRows: [],
    webPlatformRows: [],
    links: [],
  },

  onShow() {
    const guestMode = !api.isRealAuthed()
    const links = [
      {
        id: 'profile',
        title: '个人资料',
        desc: '头像、昵称与联系方式',
        url: '/pages/profile-edit/profile-edit',
        iconSrc: iconDataUri('cyan', 'user'),
      },
      {
        id: 'subscription',
        title: '订阅与会员',
        desc: '套餐与权益',
        url: '/pages/subscription/subscription',
        iconSrc: iconDataUri('cyan', 'crown'),
        hide: !mpUi.SHOW_SUBSCRIPTION,
      },
      {
        id: 'wallet',
        title: '我的钱包',
        desc: '余额与账单',
        url: '/pages/wallet/wallet',
        iconSrc: iconDataUri('cyan', 'wallet'),
        hide: !mpUi.SHOW_WALLET,
      },
      {
        id: 'notify',
        title: '消息通知',
        desc: '业务提醒',
        url: '/pages/notifications/notifications',
        iconSrc: iconDataUri('cyan', 'bell'),
      },
      {
        id: 'support',
        title: '在线客服',
        desc: '与后台坐席互通',
        url: '/pages/support-chat/support-chat',
        iconSrc: iconDataUri('cyan', 'headset'),
      },
    ].filter((x) => !x.hide)

    this.setData({ guestMode, links })
    if (guestMode) {
      this.setData({
        bindingsHint: '登录后可查看平台绑定状态',
        cloudPlatformRows: [],
        webPlatformRows: [],
      })
      return
    }
    this.refreshBindings()
  },

  refreshBindings() {
    this.setData({ bindingsLoading: true })
    try {
      const bindingView = platformBindingsMp.loadPlatformBindingRows()
      this.setData({
        bindingsLoading: false,
        bindingsHint: bindingView.syncHint || '',
        cloudPlatformRows: bindingView.cloudRows || [],
        webPlatformRows: bindingView.webRows || [],
      })
    } catch (e) {
      this.setData({
        bindingsLoading: false,
        bindingsHint: (e && e.message) || '绑定状态加载失败',
        cloudPlatformRows: [],
        webPlatformRows: [],
      })
    }
  },

  onOpenLink(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    if (!api.isRealAuthed()) {
      api.requireRealAuth('/pages/settings/settings')
      return
    }
    wx.navigateTo({ url })
  },

  onCopyWeb() {
    wx.setClipboardData({
      data: WEB_CS,
      success: () => wx.showToast({ title: '已复制电脑端地址', icon: 'none' }),
    })
  },

  onGoLogin() {
    api.requireRealAuth('/pages/settings/settings')
  },
})
