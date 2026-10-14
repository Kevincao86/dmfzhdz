const api = require('../../utils/api.js')
const tenantAuthApi = require('../../utils/tenantAuthApiMp.js')
const devAuth = require('../../utils/devAuth.js')
const membershipMp = require('../../utils/membershipMp.js')
const platformBindingsMp = require('../../utils/platformBindingsMp.js')
const mpUi = require('../../utils/mpUiFlags.js')
const accentTheme = require('../../utils/accentTheme.js')
const { iconDataUri } = require('../../utils/funcIconAssetsMp.js')

const PROFILE_KEY = 'meoo_merchant_profile_v1'
const WEB_BIND_HINT = '请在网页端进行平台授权绑定，具体操作见网页版系统设置。'
const THEME_VEIL_MS = 560

function consumeOpenPlatformBind() {
  const app = getApp()
  if (!app || !app.globalData || !app.globalData.openPlatformBind) return false
  app.globalData.openPlatformBind = false
  return true
}

const BASE_MENU = [
  {
    id: 'usage',
    title: '使用说明',
    desc: '功能与操作方式',
    iconKey: 'book',
    tone: 'cyan',
    url: '/pages/usage-guide/usage-guide',
  },
  {
    id: 'settings',
    title: '系统设置',
    desc: '平台连接、账号与订阅',
    iconKey: 'settings',
    tone: 'cyan',
    url: '/pages/settings/settings',
  },
  {
    id: 'profile',
    title: '修改个人资料',
    desc: '头像、昵称、换绑与登录密码',
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
    id: 'affiliate',
    title: '申请推广员',
    desc: '一点申请即开通，生成专属推广码',
    iconKey: 'gift',
    tone: 'cyan',
    url: '/pages/affiliate/affiliate',
  },
  {
    id: 'switch',
    title: '切换账号',
    desc: '同一手机号或邮箱下最多 3 个账号',
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
    id: 'agent',
    title: '灵祺助手',
    desc: '与电脑端 AI 智能体同源对话',
    iconKey: 'ai',
    tone: 'cyan',
    url: '/pages/ai-agent/ai-agent',
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
    if (guestMode && (item.id === 'wallet' || item.id === 'subscribe' || item.id === 'switch' || item.id === 'affiliate')) {
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
    accentSwatches: accentTheme.SWATCHES,
    themeVeilOn: false,
    themeVeilAnimate: false,
    themeVeilOpen: false,
    themeVeilStyle: '',
  },

  onShow() {
    this._openPlatformBind = consumeOpenPlatformBind()
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
      this.getTabBar().setData({ selected: 4, hidden: false })
    }
    if (!real) {
      this.setData({
        storeName: '灵祺商家',
        storeShort: '灵祺',
        loginName: '',
        planLabel: '',
        cloudPlatformRows: [],
        webPlatformRows: [],
        bindingsHint: this._openPlatformBind ? WEB_BIND_HINT : '登录后可同步平台绑定',
        bindExpanded: this._openPlatformBind ? true : this.data.bindExpanded,
      })
      this._openPlatformBind = false
      return
    }
    if (this._openPlatformBind) {
      this.setData({ bindExpanded: true, bindingsHint: WEB_BIND_HINT })
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
    void this.hydrateCloudProfile()
  },

  async hydrateCloudProfile() {
    if (!api.isRealAuthed() || devAuth.isDevSkipLogin()) return
    const r = await tenantAuthApi.postAuthIdentity({
      action: 'identities',
      access_token: api.getAccessToken(),
    })
    if (!r.ok) return
    const displayName = String(r.displayName || r.loginName || '').trim()
    const avatarUrl = String(r.avatarUrl || '').trim()
    const loginName = String(r.loginName || '').trim()
    const patch = {}
    if (displayName) {
      patch.storeName = displayName
      patch.storeShort = displayName.slice(0, 2)
      patch.loginName = loginName || displayName
    }
    if (avatarUrl) {
      patch.avatarUrl = avatarUrl
      patch.storeLogoSrc = avatarUrl
    }
    if (Object.keys(patch).length) this.setData(patch)
    try {
      wx.setStorageSync(PROFILE_KEY, {
        avatarUrl,
        displayName,
        loginName,
        updatedAt: Date.now(),
      })
      if (displayName) wx.setStorageSync('meoo_erp_merchant_display_name', displayName)
    } catch (_) {}
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
      const fromBind = this._openPlatformBind
      this._openPlatformBind = false
      this.setData({
        planLabel: '开发预览',
        planPillClass: 'dev',
        bindingsHint: fromBind ? WEB_BIND_HINT : '开发预览模式不拉取云端绑定',
        bindExpanded: fromBind ? true : this.data.bindExpanded,
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
    const fromBind = this._openPlatformBind
    this._openPlatformBind = false
    this.setData({
      bindingsLoading: false,
      bindingsHint: fromBind ? WEB_BIND_HINT : bindingView.syncHint,
      bindExpanded: fromBind ? true : this.data.bindExpanded,
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
        planPillClass: plan === 'member_plus' ? 'plus' : plan === 'member' || plan === 'member_store' ? 'member' : 'free',
      })
      this.patchSubscribeMenuDesc(subDesc)
    } catch (_) {
      this.setData({ planLabel: '', planPillClass: 'free' })
      this.patchSubscribeMenuDesc('读取失败 · 点进订阅页可刷新')
    }
  },

  async switchAccount() {
    const access = api.getAccessToken()
    if (!access) {
      api.logoutAndGoLogin()
      return
    }
    const listed = await tenantAuthApi.postAuthIdentity({ action: 'linked_accounts', access_token: access })
    const others = (listed.accounts || []).filter((a) => !a.current)
    if (!listed.ok) {
      wx.showToast({ title: listed.message || '同号账号读取失败', icon: 'none' })
      return
    }
    if (!others.length) {
      wx.showToast({ title: '该手机号或邮箱下还没有其它账号', icon: 'none' })
      return
    }
    wx.showActionSheet({
      itemList: others.map((a) => a.displayName || a.loginName).concat('登录其它账号'),
      success: async (res) => {
        if (res.tapIndex >= others.length) {
          api.logoutAndGoLogin()
          return
        }
        const target = others[res.tapIndex]
        const r = await tenantAuthApi.postAuthIdentity({
          action: 'switch_account',
          access_token: access,
          targetUserId: target.userId,
        })
        if (!r.ok || !r.access_token) {
          wx.showToast({ title: r.message || '切换失败', icon: 'none' })
          return
        }
        api.persistSession(
          { access_token: r.access_token, refresh_token: r.refresh_token || '' },
          r.loginName || target.loginName,
        )
        wx.reLaunch({ url: '/pages/mine/mine' })
      },
    })
  },

  onSameAccountSwitch() {
    this.switchAccount()
  },

  onMenuTap(e) {
    const action = e.currentTarget.dataset.action
    const url = e.currentTarget.dataset.url
    if (action === 'switch') {
      this.switchAccount()
      return
    }
    if (!url) return
    if (url.indexOf('profile-edit') >= 0 || url.indexOf('usage-guide') >= 0) {
      wx.navigateTo({ url })
      return
    }
    if (!api.isRealAuthed()) {
      api.requireRealAuth(url)
      return
    }
    if (url.indexOf('/pages/ai-agent/') >= 0 || url.indexOf('/pages/dashboard/') >= 0 || url.indexOf('/pages/functions/') >= 0) {
      wx.switchTab({ url: url.split('?')[0] })
      return
    }
    wx.navigateTo({
      url,
      fail() {
        wx.showToast({ title: '页面打开失败，请重新编译', icon: 'none' })
      },
    })
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

  onPickAccent(e) {
    if (this._themeAnimating) return
    const raw = e.currentTarget.dataset.id
    const current = this.data.accentId || ''
    const nextId = raw === 'origin' || raw === current ? '' : raw
    if (!nextId && !current) return
    const veilPack = accentTheme.pack(nextId || current)
    if (!veilPack) return
    const retract = !nextId
    this._themeAnimating = true
    this._themeTarget = nextId
    const query = wx.createSelectorQuery().in(this)
    query.selectAll('.mine-accent-dot').boundingClientRect()
    query.exec((res) => {
      if (!this._themeAnimating) return
      const rects = (res && res[0]) || []
      const idx = (this.data.accentSwatches || []).findIndex((item) => item.id === (raw || 'origin'))
      const rect = rects[idx]
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const cx = rect ? rect.left + rect.width / 2 : win.windowWidth / 2
      const cy = rect ? rect.top + rect.height / 2 : 160
      const dx = Math.max(cx, win.windowWidth - cx)
      const dy = Math.max(cy, win.windowHeight - cy)
      const radius = Math.ceil(Math.sqrt(dx * dx + dy * dy)) + 2
      const size = radius * 2
      const style = 'width:' + size + 'px;height:' + size + 'px;left:' + (cx - radius) + 'px;top:' + (cy - radius) + 'px;background:' + veilPack.nav + ';'
      if (this._veilTimer) clearTimeout(this._veilTimer)
      this._veilTimer = setTimeout(() => this.finishThemeVeil(), THEME_VEIL_MS + 90)
      if (!retract) {
        this.setData({ themeVeilOn: true, themeVeilAnimate: false, themeVeilOpen: false, themeVeilStyle: style }, () => {
          setTimeout(() => {
            if (!this._themeAnimating) return
            this.setData({ themeVeilAnimate: true, themeVeilOpen: true })
          }, 30)
        })
        return
      }
      accentTheme.save('')
      this.setData({ themeVeilOn: true, themeVeilAnimate: false, themeVeilOpen: true, themeVeilStyle: style }, () => {
        setTimeout(() => {
          if (!this._themeAnimating) return
          this.setData({ themeVeilAnimate: true, themeVeilOpen: false })
        }, 40)
      })
    })
  },

  onThemeVeilEnd(e) {
    const prop = e && e.detail && e.detail.propertyName
    if (prop && prop !== 'transform') return
    this.finishThemeVeil()
  },

  finishThemeVeil() {
    if (!this._themeAnimating) return
    this._themeAnimating = false
    if (this._veilTimer) {
      clearTimeout(this._veilTimer)
      this._veilTimer = null
    }
    const id = this._themeTarget || ''
    if (id) accentTheme.save(id)
    this.setData({ themeVeilOn: false, themeVeilAnimate: false, themeVeilOpen: false })
  },
})
