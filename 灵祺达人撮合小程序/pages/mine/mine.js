const lingqiIdentity = require('../../utils/lingqiIdentity.js')
const api = require('../../utils/api.js')
const memberStore = require('../../utils/talentMember.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const participant = require('../../utils/participant.js')
const userProfile = require('../../utils/userProfile.js')
const messagesStore = require('../../utils/messagesStore.js')
const wxAccount = require('../../utils/wxAccount.js')
const { setTabBarForPage, refreshTabBar, setTabBarHidden } = require('../../utils/tabBar.js')
const { routeToPagePath } = require('../../utils/tabBarConfig.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')

const TALENT_MENUS = [
  { key: 'profile', label: '我的信息', sub: '多平台达人资料（抖音/小红书等）', icon: 'info', emoji: '🎨' },
  { key: 'applications', label: '我的报名', sub: '查看已提交的招募报名', icon: 'list', emoji: '📋' },
  { key: 'notifications', label: '消息通知', sub: '订单、报名业务与系统通知', icon: 'bell', emoji: '🔔' },
  { key: 'analytics', label: '数据分析', sub: '报名与发单概况', icon: 'chart', emoji: '📊' },
  { key: 'support', label: '小灵同学', sub: '我的客服与常见问题', icon: 'support', emoji: '🧚' },
]

const PR_MENUS = [
  { key: 'prProfile', label: '我的 PR 信息', sub: '机构/个人资料与所在城市', icon: 'info', emoji: '🪪' },
  { key: 'prOrders', label: '我的发单', sub: '已发布的招募订单', icon: 'list', emoji: '📦' },
  { key: 'templates', label: '我的模版', sub: '达人报名表单模版', icon: 'tpl', emoji: '📑' },
  { key: 'notifications', label: '消息通知', sub: '订单、报名业务与系统通知', icon: 'bell', emoji: '🔔' },
  { key: 'analytics', label: '数据分析', sub: '发单与转化概况', icon: 'chart', emoji: '📈' },
  { key: 'support', label: '小灵同学', sub: '我的客服与常见问题', icon: 'support', emoji: '🧚' },
]

const MENU_URLS = {
  profile: '/pages/register/register?edit=1',
  applications: '/pages/mine-applications/mine-applications',
  templates: '/pages/mine-templates/mine-templates',
  notifications: '/pages/mine-notifications/mine-notifications',
  analytics: '/pages/mine-analytics/mine-analytics',
  support: '/pages/mine-support/mine-support',
  prProfile: '/pages/mine-pr-profile/mine-pr-profile',
  prOrders: '/pages/mine-pr-orders/mine-pr-orders',
}

Page({
  data: {
    identity: 'talent',
    identityLabel: '达人',
    member: null,
    prProfile: null,
    wxLoggedIn: false,
    profileIncomplete: false,
    avatarUrl: '',
    profileNick: '',
    displayName: '灵祺用户',
    profileSaving: false,
    displaySub: '微信登录后使用完整功能',
    identityIdLine: '',
    menus: TALENT_MENUS,
    notifyBadge: 0,
    headerInnerStyle: '',
    showIdentitySheet: false,
    showWxLoginSheet: false,
    wxLoginNick: '',
    wxLoginAvatar: '',
    wxLoginSubmitting: false,
  },
  onLoad() {
    applyCapsulePadding(this, 'headerInnerStyle')
  },
  async onShow() {
    setTabBarForPage(this, '/pages/mine/mine')
    try {
      const chat = require('../../utils/talentChat.js')
      if (chat.canChat()) await chat.syncProfile()
    } catch (_) {}
    try {
      this.refresh()
    } catch (e) {
      console.error('[mine] refresh', e)
      this.setData({
        identity: 'talent',
        identityLabel: '达人',
        menus: TALENT_MENUS,
        displayName: '灵祺用户',
        displaySub: '页面加载异常，请删除小程序后重试',
      })
      wx.showToast({ title: '我的页加载失败', icon: 'none' })
    }
  },
  refresh() {
    const identity = userProfile.readIdentity()
    const member = memberStore.readMember()
    const prProfile = userProfile.readPrProfile()
    const wx = wxAccount.readWxAccount()
    const wxLoggedIn = !!wx

    let avatarUrl = ''
    let profileNick = ''
    let displaySub = '微信登录后使用完整功能'

    if (wx) {
      avatarUrl = wx.wxAvatarUrl || ''
      profileNick = wx.wxNickName || ''
    }

    if (identity === 'talent') {
      if (member?.wxNickName) profileNick = member.wxNickName
      if (member?.wxAvatarUrl) avatarUrl = member.wxAvatarUrl
      displaySub = member
        ? memberStore.memberTypeLabel(member)
        : wxLoggedIn
          ? '完善多平台资料，报名更便捷'
          : '达人 · 发现优质商单'
    } else if (identity === 'shoot' || identity === 'edit') {
      if (member?.wxNickName) profileNick = member.wxNickName
      if (member?.wxAvatarUrl) avatarUrl = member.wxAvatarUrl
      displaySub = userProfile.supplierDisplaySub(identity)
    } else if (identity === 'pr') {
      if (prProfile?.wxNickName) profileNick = prProfile.wxNickName
      if (prProfile?.wxAvatarUrl) avatarUrl = prProfile.wxAvatarUrl
      displaySub = userProfile.prDisplaySub(prProfile)
    }

    const displayName = profileNick || '灵祺用户'

    let identityIdLine = ''
    if (
      (identity === 'talent' || identity === 'shoot' || identity === 'edit') &&
      member?.lingqiTalentId
    ) {
      identityIdLine = lingqiIdentity.formatTalentIdLabel(member.lingqiTalentId)
    } else if (identity === 'pr' && prProfile?.lingqiPrId) {
      identityIdLine = lingqiIdentity.formatPrIdLabel(prProfile.lingqiPrId)
    }

    const wxAcc = wxAccount.readWxAccount()
    const profileIncomplete =
      identity === 'talent' && wxLoggedIn && !memberStore.hasFilledPlatform(member)
    this.setData({
      identity,
      identityLabel: userProfile.identityLabel(identity),
      member,
      prProfile,
      wxLoggedIn,
      profileIncomplete,
      avatarUrl,
      profileNick,
      displayName,
      displaySub,
      identityIdLine,
      menus: identity === 'pr' ? PR_MENUS : TALENT_MENUS,
      notifyBadge: messagesStore.unreadNotificationCount(),
      wxLoginNick: wxAcc?.wxNickName || this.data.wxLoginNick || '',
      wxLoginAvatar: wxAcc?.wxAvatarUrl || this.data.wxLoginAvatar || '',
    })
  },
  onHide() {
    setTabBarHidden(this, false)
  },
  ensureWxLoggedIn() {
    if (wxAccount.isWxLoggedIn()) return true
    this.onOpenWxLoginSheet()
    return false
  },
  onOpenWxLoginSheet() {
    const wx = wxAccount.readWxAccount()
    setTabBarHidden(this, true)
    this.setData({
      showWxLoginSheet: true,
      wxLoginNick: wx?.wxNickName || '',
      wxLoginAvatar: wx?.wxAvatarUrl || '',
    })
  },
  onCloseWxLoginSheet() {
    this.setData({ showWxLoginSheet: false })
    setTabBarHidden(this, false)
  },
  onChooseAvatar(e) {
    const url = e.detail?.avatarUrl
    if (url) this.setData({ wxLoginAvatar: url })
  },
  onNicknameInput(e) {
    this.setData({ wxLoginNick: e.detail.value || '' })
  },
  async onConfirmWxLogin() {
    if (this.data.wxLoginSubmitting) return
    const nick = String(this.data.wxLoginNick || '').trim()
    if (!nick) {
      wx.showToast({ title: '请填写微信昵称', icon: 'none' })
      return
    }
    this.setData({ wxLoginSubmitting: true })
    try {
      await wxAccount.completeWxLogin({
        wxNickName: nick,
        wxAvatarUrl: this.data.wxLoginAvatar,
      })
      wx.showToast({ title: '登录成功', icon: 'success' })
      this.setData({ showWxLoginSheet: false })
      setTabBarHidden(this, false)
      this.refresh()
    } catch (e) {
      wx.showToast({ title: String(e?.message || e).slice(0, 36), icon: 'none' })
    } finally {
      this.setData({ wxLoginSubmitting: false })
    }
  },
  onOpenIdentitySheet() {
    setTabBarHidden(this, true)
    this.setData({ showIdentitySheet: true })
  },
  onCloseIdentitySheet() {
    this.setData({ showIdentitySheet: false })
    setTabBarHidden(this, false)
  },
  noopSheetTap() {},
  noopProfileTap() {},
  onProfileNickInput(e) {
    this.setData({ profileNick: e.detail.value || '' })
  },
  async onProfileChooseAvatar(e) {
    if (!this.ensureWxLoggedIn()) return
    const url = e.detail?.avatarUrl
    if (!url) return
    this.setData({ avatarUrl: url })
    await this.persistProfileDisplay(this.data.profileNick, url)
  },
  async onProfileNickBlur() {
    if (!this.data.wxLoggedIn || this.data.profileSaving) return
    const nick = String(this.data.profileNick || '').trim()
    const prev = String(this.data.displayName || '').trim()
    if (!nick || nick === prev) return
    await this.persistProfileDisplay(nick, this.data.avatarUrl)
  },
  async persistProfileDisplay(nick, avatarUrl) {
    if (this.data.profileSaving) return false
    const n = String(nick ?? this.data.profileNick ?? '').trim()
    const av = String(avatarUrl ?? this.data.avatarUrl ?? '').trim()
    if (!n) {
      wx.showToast({ title: '请填写昵称', icon: 'none' })
      return false
    }
    if (!wxAccount.isWxLoggedIn()) {
      this.onOpenWxLoginSheet()
      return false
    }
    this.setData({ profileSaving: true })
    try {
      wxAccount.writeWxAccount({ wxNickName: n, wxAvatarUrl: av })
      const identity = userProfile.readIdentity()
      const ts = new Date().toLocaleString('zh-CN', { hour12: false })
      if (identity === 'talent') {
        const prev = memberStore.readMember()
        if (prev) {
          const member = { ...prev, wxNickName: n, wxAvatarUrl: av, updatedAt: ts }
          memberStore.writeMember(member)
          if (api.hasApi() && member.contact) {
            try {
              const reg = await ops.registerTalentMember(member)
              if (reg?.lingqiTalentId) {
                member.lingqiTalentId = reg.lingqiTalentId
                memberStore.writeMember(member)
              }
            } catch (_) {}
          }
        }
      } else {
        const prev = userProfile.readPrProfile() || userProfile.emptyPrProfile()
        const saved = { ...prev, wxNickName: n, wxAvatarUrl: av, updatedAt: ts }
        userProfile.writePrProfile(saved)
        if (api.hasApi() && String(saved.contactPhone || '').trim()) {
          try {
            const reg = await ops.registerPrUser({
              id: saved.id || `MPR-${Date.now()}`,
              lingqiPrId: saved.lingqiPrId || '',
              accountType: saved.accountType,
              companyName: saved.companyName || '',
              personalName: saved.personalName || '',
              contactName: saved.contactName || '',
              contactPhone: saved.contactPhone || '',
              wechatId: saved.wechatId || '',
              province: saved.province || '',
              city: saved.city || '',
              intro: saved.intro || '',
              wxNickName: n,
              wxAvatarUrl: av,
              registeredAt: saved.registeredAt || ts,
              updatedAt: ts,
            })
            if (reg?.lingqiPrId) {
              saved.lingqiPrId = reg.lingqiPrId
              saved.id = reg.id || saved.id
              userProfile.writePrProfile(saved)
            }
          } catch (_) {}
        }
      }
      try {
        const chat = require('../../utils/talentChat.js')
        if (chat.canChat()) {
          const part = participant.getCurrentParticipant()
          part.displayName = n
          part.avatarUrl = av
          if (part.memberSnapshot) {
            part.memberSnapshot = { ...part.memberSnapshot, wxNickName: n, wxAvatarUrl: av }
          }
          await chat.syncProfile(part)
        }
      } catch (_) {}
      this.refresh()
      try {
        const chat = require('../../utils/talentChat.js')
        if (chat.canChat()) void chat.syncProfile()
      } catch (_) {}
      wx.showToast({ title: '已更新', icon: 'success', duration: 1200 })
      return true
    } finally {
      this.setData({ profileSaving: false })
    }
  },
  onPickIdentity(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ showIdentitySheet: false })
    setTabBarHidden(this, false)
    this.applyIdentitySwitch(id)
  },
  applyIdentitySwitch(id) {
    if (!id || id === this.data.identity) return
    userProfile.writeIdentity(id)
    wx.showToast({ title: `已切换为${userProfile.identityLabel(id)}`, icon: 'none' })
    this.refresh()
    refreshTabBar()
    const pages = getCurrentPages()
    const cur = pages[pages.length - 1]
    if (id === 'talent' && cur && routeToPagePath(cur.route) === '/pages/publish/publish') {
      wx.switchTab({ url: '/pages/index/index' })
    }
    if (cur && routeToPagePath(cur.route) === '/pages/recommend/recommend') {
      cur.onShow()
    }
    try {
      const chat = require('../../utils/talentChat.js')
      if (chat.canChat()) void chat.syncProfile()
    } catch (_) {}
  },
  onMenuTap(e) {
    if (!this.ensureWxLoggedIn()) return
    const key = e.currentTarget.dataset.key
    const url = MENU_URLS[key]
    if (!url) return
    wx.navigateTo({ url })
  },
  goEditProfile() {
    if (!this.ensureWxLoggedIn()) return
    if (this.data.identity === 'pr') {
      wx.navigateTo({ url: '/pages/mine-pr-profile/mine-pr-profile' })
    } else {
      wx.navigateTo({ url: '/pages/register/register?edit=1' })
    }
  },
})
