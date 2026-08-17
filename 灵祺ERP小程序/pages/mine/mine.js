const api = require('../../utils/api.js')
const devAuth = require('../../utils/devAuth.js')
const membershipMp = require('../../utils/membershipMp.js')
const platformBindingsMp = require('../../utils/platformBindingsMp.js')
const mpUi = require('../../utils/mpUiFlags.js')
const { iconDataUri } = require('../../utils/funcIconAssetsMp.js')

const PROFILE_KEY = 'meoo_merchant_profile_v1'

const BASE_MENU = [
  {
    id: 'profile',
    title: '修改个人资料',
    desc: '头像、昵称与联系方式',
    iconKey: 'user',
    tone: 'cyan',
    url: '/pages/profile-edit/profile-edit',
  },
  {
    id: 'notify',
    title: '消息通知',
    desc: '业务提醒与系统消息',
    iconKey: 'bell',
    tone: 'cyan',
    url: '/pages/notifications/notifications',
  },
  {
    id: 'wallet',
    title: '我的钱包',
    desc: '余额、充值与账单',
    iconKey: 'wallet',
    tone: 'cyan',
    url: '/pages/wallet/wallet',
  },
  {
    id: 'switch',
    title: '切换账号',
    desc: '使用其他门店账户登录',
    iconKey: 'switchUser',
    tone: 'cyan',
    action: 'switch',
  },
  {
    id: 'subscribe',
    title: '订阅与会员',
    desc: '加载会员版本中…',
    iconKey: 'crown',
    tone: 'cyan',
    url: '/pages/subscription/subscription',
  },
  {
    id: 'support',
    title: '在线客服',
    desc: '与商家管理后台坐席对话，消息互通',
    iconKey: 'headset',
    tone: 'cyan',
    url: '/pages/support-chat/support-chat',
  },
]

function buildVisibleMenu(guestMode) {
  return BASE_MENU.filter((item) => {
    if (guestMode && (item.id === 'wallet' || item.id === 'subscribe' || item.id === 'switch')) {
      return false
    }
    if (item.id === 'wallet' && !mpUi.SHOW_WALLET) return false
    if (item.id === 'subscribe' && !mpUi.SHOW_SUBSCRIPTION) return false
    return true
  })
}

function enrichMenu(items) {
  return items.map((item) => ({
    ...item,
    iconSrc: iconDataUri(item.tone || 'cyan', item.iconKey),
  }))
}

function readAvatar() {
  try {
    const raw = wx.getStorageSync(PROFILE_KEY)
    const p = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
    return String(p.avatarUrl || '').trim()
  } catch (_) {
    return ''
  }
}

Page({
  data: {
    storeName: '灵祺商家',
    storeShort: '灵祺',
    loginName: '',
    planLabel: '',
    planPillClass: 'free',
    devMode: false,
    showPlanBadge: mpUi.SHOW_SUBSCRIPTION,
    showLogoutConfirm: false,
    bindingsLoading: false,
    bindingsHint: '',
    cloudPlatformRows: [],
    webPlatformRows: [],
    bindExpanded: false,
    bindIconSrc: iconDataUri('cyan', 'bind'),
    storeLogoSrc: iconDataUri('cyan', 'shop'),
    avatarUrl: '',
    guestMode: true,
    menu: enrichMenu(buildVisibleMenu(true)),
  },

  onShow() {
    api.enterGuestBrowse()
    const real = api.isRealAuthed()
    const avatarUrl = readAvatar()
    this.setData({
      guestMode: !real,
      menu: enrichMenu(buildVisibleMenu(!real)),
      avatarUrl,
      storeLogoSrc: avatarUrl || iconDataUri('cyan', 'shop'),
      showPlanBadge: mpUi.SHOW_SUBSCRIPTION && real,
    })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    if (!real) {
      this.setData({
        storeName: '灵祺商家',
        storeShort: '灵祺',
        loginName: '',
        planLabel: '',
        cloudPlatformRows: [],
        webPlatformRows: [],
        bindingsHint: '登录后可同步平台绑定',
      })
      return
    }
    try {
      const display =
        wx.getStorageSync('meoo_erp_merchant_display_name') || wx.getStorageSync('meoo_login_name')
      if (display && String(display).trim()) {
        const n = String(display).trim()
        this.setData({ loginName: n, storeName: n, storeShort: n.slice(0, 2) })
      }
    } catch (_) {}
    this.setData({ devMode: devAuth.isDevSkipLogin() })
    void this.refreshAccountData()
  },

  onEditProfile() {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
  },

  onGoLogin() {
    api.requireRealAuth('/pages/mine/mine')
  },

  onToggleBind() {
    this.setData({ bindExpanded: !this.data.bindExpanded })
  },

  async refreshAccountData() {
    if (devAuth.isDevSkipLogin()) {
      this.setData({
        planLabel: '开发预览',
        planPillClass: 'dev',
        bindingsHint: '开发预览模式不拉取云端绑定',
        cloudPlatformRows: [],
        webPlatformRows: [],
      })
      this.patchSubscribeMenuDesc('开发预览 · 进入可查看订阅页布局')
      return
    }

    this.setData({ bindingsLoading: true })
    try {
      const app = getApp()
      if (app && typeof app.syncMerchantSession === 'function') {
        await app.syncMerchantSession({ force: true })
      }
    } catch (_) {}

    const bindingView = platformBindingsMp.loadPlatformBindingRows()
    this.setData({
      bindingsLoading: false,
      bindingsHint: bindingView.syncHint,
      cloudPlatformRows: bindingView.cloudRows,
      webPlatformRows: bindingView.webRows,
    })
    void this.loadMembershipBadge()
  },

  patchSubscribeMenuDesc(desc) {
    if (!mpUi.SHOW_SUBSCRIPTION) return
    const menu = enrichMenu(buildVisibleMenu(false)).map((item) =>
      item.id === 'subscribe' ? Object.assign({}, item, { desc }) : item,
    )
    this.setData({ menu })
  },

  async loadMembershipBadge() {
    if (devAuth.isDevSkipLogin() || !mpUi.SHOW_SUBSCRIPTION) return
    try {
      const snap = await membershipMp.loadMembershipSnapshot()
      const plan = snap.ent.plan
      const label = snap.ent.planLabel
      let subDesc = `当前 ${label} · 与电脑端「设置 → 订阅」同步`
      if (snap.ent.isPaid && snap.memberUsage.remainDays != null) {
        const d = snap.memberUsage.remainDays
        if (d > 0) subDesc = `当前 ${label} · 剩余 ${d} 天 · 与电脑端同步`
        else if (d === 0) subDesc = `当前 ${label} · 今日到期 · 请续费`
        else subDesc = `当前 ${label} · 已过期 ${Math.abs(d)} 天`
      } else if (!snap.ent.isPaid) {
        subDesc = `当前 ${label} · 升级会员与电脑端一致`
      }
      this.setData({
        planLabel: label,
        planPillClass: plan === 'member_plus' ? 'plus' : plan === 'member' ? 'member' : 'free',
      })
      this.patchSubscribeMenuDesc(subDesc)
    } catch (_) {
      this.setData({ planLabel: '', planPillClass: 'free' })
      this.patchSubscribeMenuDesc('读取失败 · 点进订阅页可刷新')
    }
  },

  onMenuTap(e) {
    const action = e.currentTarget.dataset.action
    const url = e.currentTarget.dataset.url
    if (action === 'switch') {
      api.logoutAndGoLogin()
      return
    }
    if (!url) return
    if (url.indexOf('profile-edit') >= 0) {
      wx.navigateTo({ url })
      return
    }
    if (!api.isRealAuthed()) {
      api.requireRealAuth(url)
      return
    }
    wx.navigateTo({ url })
  },

  onLogout() {
    this.setData({ showLogoutConfirm: true })
  },

  onCancelLogout() {
    this.setData({ showLogoutConfirm: false })
  },

  onConfirmLogout() {
    this.setData({ showLogoutConfirm: false })
    // 退出后必须回到登录页（勿仅切游客态留在「我的」）
    api.logoutAndGoLogin()
  },
})
