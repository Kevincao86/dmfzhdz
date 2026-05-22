const api = require('../../utils/api.js')
const devAuth = require('../../utils/devAuth.js')
const membershipMp = require('../../utils/membershipMp.js')

Page({
  data: {
    storeName: '墨典商家',
    loginName: '',
    planLabel: '',
    planPillClass: 'free',
    devMode: false,
    menu: [
      {
        id: 'notify',
        title: '消息通知',
        desc: '业务提醒与系统消息',
        glyph: '讯',
        tone: 'cyan',
        url: '/pages/notifications/notifications',
      },
      {
        id: 'wallet',
        title: '我的钱包',
        desc: '余额、充值与账单',
        glyph: '钱',
        tone: 'amber',
        url: '/pages/wallet/wallet',
      },
      {
        id: 'switch',
        title: '切换账号',
        desc: '使用其他门店账户登录',
        glyph: '换',
        tone: 'blue',
        action: 'switch',
      },
      {
        id: 'subscribe',
        title: '订阅与会员',
        desc: '加载会员版本中…',
        glyph: '订',
        tone: 'violet',
        url: '/pages/subscription/subscription',
      },
      {
        id: 'support',
        title: '在线客服',
        desc: '与商家管理后台坐席对话，消息互通',
        glyph: '服',
        tone: 'indigo',
        url: '/pages/support-chat/support-chat',
      },
    ],
  },

  onShow() {
    if (!api.isAuthed()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    try {
      const display =
        wx.getStorageSync('meoo_erp_merchant_display_name') || wx.getStorageSync('meoo_login_name')
      if (display && String(display).trim()) {
        const n = String(display).trim()
        this.setData({ loginName: n, storeName: n })
      }
    } catch (_) {}
    try {
      const app = getApp()
      if (app && typeof app.syncMerchantSession === 'function') void app.syncMerchantSession()
    } catch (_) {}
    this.setData({ devMode: devAuth.isDevSkipLogin() })
    void this.loadMembershipBadge()
  },

  patchSubscribeMenuDesc(desc) {
    const menu = (this.data.menu || []).map((item) =>
      item.id === 'subscribe' ? Object.assign({}, item, { desc }) : item,
    )
    this.setData({ menu })
  },

  async loadMembershipBadge() {
    if (devAuth.isDevSkipLogin()) {
      this.setData({ planLabel: '开发预览', planPillClass: 'dev' })
      this.patchSubscribeMenuDesc('开发预览 · 进入可查看订阅页布局')
      return
    }
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
      if (devAuth.isDevSkipLogin()) {
        wx.showToast({ title: '开发模式请改 config', icon: 'none' })
        return
      }
      api.logout()
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    if (url) wx.navigateTo({ url })
  },

  onLogout() {
    wx.showModal({
      title: '退出当前账号',
      content: '确定退出登录？',
      success(res) {
        if (!res.confirm) return
        api.logout()
        if (devAuth.isDevSkipLogin()) {
          wx.switchTab({ url: '/pages/agent/agent' })
        } else {
          wx.redirectTo({ url: '/pages/login/login' })
        }
      },
    })
  },
})
