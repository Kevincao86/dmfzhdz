const lingqiIdentity = require('../../utils/lingqiIdentity.js')
const api = require('../../utils/api.js')
const memberStore = require('../../utils/talentMember.js')
const memberProfileApplyGate = require('../../utils/memberProfileApplyGate.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const participant = require('../../utils/participant.js')
const userProfile = require('../../utils/userProfile.js')
const identityTypes = require('../../utils/identityTypes.js')
const auth = require('../../utils/auth.js')
const switchWorkIdentity = require('../../utils/switchWorkIdentity.js')
const identityIdLabels = require('../../utils/identityIdLabels.js')
const supplierTeamProfile = require('../../utils/supplierTeamProfile.js')
const messagesStore = require('../../utils/messagesStore.js')
const wxAccount = require('../../utils/wxAccount.js')
const wxProfileDisplay = require('../../utils/wxProfileDisplay.js')
const { setTabBarForPage, setTabBarHidden } = require('../../utils/tabBar.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')
const { attachMenuGlyphs } = require('../../utils/mineMenuIcons.js')
const identityTheme = require('../../utils/identityTheme.js')

const PR_MENU_KEYS = new Set(['prOrders', 'prProfile', 'formRelay'])

const MANUAL_MENU = {
  key: 'manual',
  label: '使用手册',
  sub: '运营台图文手册 · 与帮助手册同步',
  icon: 'manual',
}

function withManualMenu(menus) {
  const list = [...(menus || [])]
  const supportIdx = list.findIndex((item) => item.key === 'support')
  const insertAt = supportIdx >= 0 ? supportIdx : list.length
  list.splice(insertAt, 0, MANUAL_MENU)
  return attachMenuGlyphs(list)
}
const mpShare = require('../../utils/mpShare.js')
const { getOauthLoginCopy } = require('../../utils/mpLoginCopy.js')
const mpDouyinAuthUi = require('../../utils/mpDouyinAuthUi.js')

const OAUTH_COPY = getOauthLoginCopy()
const guestRoutes = require('../../utils/mpGuestRoutes.js')
const mpProfileNav = require('../../utils/mpProfileNav.js')
const mineProfileStats = require('../../utils/mineProfileStats.js')

function talentMenusForIdentity(identity) {
  if (identity === 'shoot') {
    return withManualMenu([
      { key: 'profile', label: '拍摄团队信息', sub: '团队资料 · 设备 · 作品集', icon: 'info' },
      { key: 'applications', label: '我的报名', sub: '查看已提交的招募报名', icon: 'list' },
      { key: 'favorites', label: '我的收藏', sub: '收藏的招募商单', icon: 'star' },
      { key: 'prQuotes', label: '我的报价', sub: '为合作 PR 设置专属报价', icon: 'quote' },
      { key: 'analytics', label: '数据分析', sub: '报名与发单概况', icon: 'chart' },
      { key: 'support', label: '小灵同学', sub: '我的客服与常见问题', icon: 'support' },
    ])
  }
  if (identity === 'edit') {
    return withManualMenu([
      { key: 'profile', label: '剪辑团队信息', sub: '团队资料 · 风格 · 作品集', icon: 'info' },
      { key: 'applications', label: '我的报名', sub: '查看已提交的招募报名', icon: 'list' },
      { key: 'favorites', label: '我的收藏', sub: '收藏的招募商单', icon: 'star' },
      { key: 'prQuotes', label: '我的报价', sub: '为合作 PR 设置专属报价', icon: 'quote' },
      { key: 'analytics', label: '数据分析', sub: '报名与发单概况', icon: 'chart' },
      { key: 'support', label: '小灵同学', sub: '我的客服与常见问题', icon: 'support' },
    ])
  }
  return withManualMenu([
    { key: 'profile', label: '我的信息', sub: '多平台达人资料（抖音/小红书等）', icon: 'info' },
    { key: 'applications', label: '我的报名', sub: '查看已提交的招募报名', icon: 'list' },
    { key: 'favorites', label: '我的收藏', sub: '收藏的招募商单', icon: 'star' },
    { key: 'prQuotes', label: '我的报价', sub: '为合作 PR 设置专属报价', icon: 'quote' },
    { key: 'analytics', label: '数据分析', sub: '报名与发单概况', icon: 'chart' },
    { key: 'support', label: '小灵同学', sub: '我的客服与常见问题', icon: 'support' },
  ])
}

function buildPrMenus() {
  return withManualMenu([
    { key: 'prProfile', label: '我的 PR 信息', sub: '机构/个人资料与所在城市', icon: 'info' },
    { key: 'prOrders', label: '我的发单', sub: '已发布的招募订单', icon: 'list' },
    { key: 'templates', label: '我的模版', sub: '达人 / 拍摄 / 剪辑报名表单', icon: 'tpl' },
    { key: 'formRelay', label: '转发工具', sub: '外部表单代收 · 导出回填', icon: 'tpl' },
    { key: 'analytics', label: '数据分析', sub: '发单与转化概况', icon: 'chart' },
    { key: 'support', label: '小灵同学', sub: '我的客服与常见问题', icon: 'support' },
  ])
}

const MENU_URLS = {
  profile: '/pages/register/register?edit=1',
  applications: '/pages/mine-applications/mine-applications',
  favorites: '/pages/mine-favorites/mine-favorites',
  templates: '/pages/mine-templates/mine-templates',
  notifications: '/pages/mine-notifications/mine-notifications',
  analytics: '/pages/mine-analytics/mine-analytics',
  prQuotes: '/pages/mine-pr-quotes/mine-pr-quotes',
  support: '/pages/mine-support/mine-support',
  manual: '/pages/mine-manual/mine-manual',
  prProfile: '/pages/mine-pr-profile/mine-pr-profile',
  prOrders: '/pages/mine-pr-orders/mine-pr-orders',
  formRelay: '/pages/mine-form-relay/mine-form-relay',
}

/** 未登录也可直接进入（不弹登录窗） */
const GUEST_FREE_MENU_KEYS = new Set(['applications', 'analytics', 'support', 'favorites', 'manual'])

function profileMenuLabel(identity) {
  if (identity === 'pr') return '我的 PR 信息'
  if (identity === 'shoot') return '拍摄团队信息'
  if (identity === 'edit') return '剪辑团队信息'
  return '我的信息'
}

Page({
  behaviors: [require('../../behaviors/identityTheme')],
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
    displaySub: OAUTH_COPY.loginSub,
    oauthCopy: OAUTH_COPY,
    useAlbumAvatar: mpDouyinAuthUi.useAlbumAvatarPicker(),
    identityIdLine: '',
    menus: talentMenusForIdentity('talent'),
    notifyBadge: 0,
    headerBandStyle: '',
    headerInnerStyle: '',
    showWxLoginSheet: false,
    wxLoginNick: '',
    wxLoginAvatar: '',
    wxLoginSubmitting: false,
    statApplied: 0,
    statInProgress: 0,
    statCompleted: 0,
    statAppliedLabel: '已报名',
    statInProgressLabel: '进行中',
    statCompletedLabel: '已完成',
    profileVerified: false,
  },
  onLoad() {
    applyCapsulePadding(this, null, { band: 'headerBandStyle', right: 'headerInnerStyle' })
  },
  onShareAppMessage() {
    mpShare.enableShareMenu()
    return mpShare.defaultShare('/pages/mine/mine')
  },
  onShareTimeline() {
    return mpShare.defaultTimelineShare()
  },
  async onShow() {
    mpShare.enableShareMenu()
    setTabBarForPage(this, '/pages/mine/mine')
    if (!auth.isLoggedIn()) {
      if (wxAccount.readWxAccount()) wxAccount.clearWxAccount()
    }
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
        menus: talentMenusForIdentity('talent'),
        displayName: '灵祺用户',
        displaySub: '页面加载异常，请删除小程序后重试',
      })
      wx.showToast({ title: '我的页加载失败', icon: 'none' })
      return
    }
    if (auth.isLoggedIn()) {
      try {
        const acct = auth.readAccount()
        if (acct) require('../../utils/accountMemberSync.js').syncWxAccountFromAuthAccount(acct)
      } catch (_) {}
      try {
        await auth.refreshSession()
        const acct = auth.readAccount()
        if (acct) require('../../utils/accountMemberSync.js').syncLocalProfilesFromAccount(acct)
      } catch (_) {}
      try {
        await require('../../utils/registryProfileSync.js').pullRegistryProfileAfterLogin()
      } catch (_) {}
      try {
        await switchWorkIdentity.ensureWorkIdentityIfNeeded()
      } catch (_) {}
      try {
        this.refresh()
      } catch (e) {
        console.error('[mine] refresh after sync', e)
      }
    }
    void this.refreshNotifyBadge()
  },
  refresh() {
    const identity = userProfile.readIdentity()
    const member = memberStore.readMember()
    const prProfile = userProfile.readPrProfile()
    const acct = auth.readAccount()
    const wx = wxAccount.readWxAccount()
    const cache = wxProfileDisplay.readWxProfileCache()
    const wxLoggedIn = auth.isLoggedIn()

    let avatarUrl = ''
    let profileNick = ''
    let displaySub = OAUTH_COPY.loginSub

    if (identity === 'pr') {
      profileNick = wxProfileDisplay.pickWxNick(
        cache?.wxNickName,
        acct?.wxNickName,
        wx?.wxNickName,
        prProfile?.wxNickName,
      )
      avatarUrl = wxProfileDisplay.pickWxAvatar(
        cache?.wxAvatarUrl,
        acct?.wxAvatarUrl,
        wx?.wxAvatarUrl,
        prProfile?.wxAvatarUrl,
      )
      displaySub = userProfile.prDisplaySub(prProfile)
    } else {
      profileNick = wxProfileDisplay.pickWxNick(
        cache?.wxNickName,
        acct?.wxNickName,
        wx?.wxNickName,
        member?.wxNickName,
      )
      avatarUrl = wxProfileDisplay.pickWxAvatar(
        cache?.wxAvatarUrl,
        acct?.wxAvatarUrl,
        wx?.wxAvatarUrl,
        member?.wxAvatarUrl,
      )
      if (identity === 'talent') {
        displaySub = member
          ? memberStore.memberTypeLabel(member)
          : wxLoggedIn
            ? '完善多平台资料，报名更便捷'
            : '达人 · 发现优质商单'
      } else if (identity === 'shoot' || identity === 'edit') {
        displaySub = member?.supplierProfile
          ? supplierTeamProfile.supplierSummaryLabel(identity, member.supplierProfile)
          : userProfile.supplierDisplaySub(identity)
      }
    }

    const displayName = profileNick || '灵祺用户'

    let identityIdLine = ''
    if (identity === 'pr') {
      identityIdLine = lingqiIdentity.formatPrIdLabel(prProfile?.lingqiPrId)
    } else {
      const labels = identityIdLabels.buildIdentityIdLabels(identity, { member, account: acct })
      identityIdLine =
        labels.lingqiShootTeamIdLabel ||
        labels.lingqiEditTeamIdLabel ||
        labels.lingqiTalentIdLabel ||
        (identity === 'shoot' ? '拍摄团队ID：待生成' : identity === 'edit' ? '剪辑团队ID：待生成' : '')
    }

    const wxAcc = wxAccount.readWxAccount()
    const profileIncomplete =
      wxLoggedIn &&
      (identity === 'talent' || identity === 'shoot' || identity === 'edit') &&
      !!memberProfileApplyGate.validateMemberProfileForApply(member, identity)
    const stats = mineProfileStats.computeMineStats(identity)
    const profileVerified =
      wxLoggedIn &&
      (((identity === 'talent' || identity === 'shoot' || identity === 'edit') &&
        memberProfileApplyGate.isMemberProfileComplete(member, identity)) ||
        (identity === 'pr' && prProfile && String(prProfile.contactPhone || '').trim()))
    this.setData({
      identity,
      identityLabel: userProfile.identityLabel(identity),
      member,
      prProfile,
      wxLoggedIn,
      profileIncomplete,
      profileVerified,
      avatarUrl,
      profileNick,
      displayName,
      displaySub,
      identityIdLine,
      menus: identity === 'pr' ? buildPrMenus() : talentMenusForIdentity(identity),
      notifyBadge: 0,
      wxLoginNick: wxAcc?.wxNickName || this.data.wxLoginNick || '',
      wxLoginAvatar: wxAcc?.wxAvatarUrl || this.data.wxLoginAvatar || '',
      ...stats,
    })
  },
  async refreshNotifyBadge() {
    const identity = userProfile.readIdentity()
    const member = memberStore.readMember()
    let count = messagesStore.unreadNotificationCount()
    if (identity === 'talent' && member && api.hasApi()) {
      try {
        const reg = await ops.fetchRegistry()
        const rows = messagesStore.mergeRegistryInboxForTalent(reg, member)
        count = messagesStore.unreadNotificationCount(rows)
      } catch (_) {
        /* 使用本地未读数 */
      }
    }
    this.setData({ notifyBadge: count })
  },
  onHide() {
    setTabBarHidden(this, false)
  },
  ensureWxLoggedIn() {
    if (auth.isLoggedIn()) return true
    if (wxAccount.readWxAccount()) wxAccount.clearWxAccount()
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
  onGoLoginPage() {
    guestRoutes.redirectToLogin('/pages/mine/mine')
  },
  onSwitchIdentity() {
    if (auth.isLoggedIn()) {
      const label = profileMenuLabel(userProfile.readIdentity())
      wx.showModal({
        title: '请先退出登录',
        content: `请先在「${label}」中退出登录，关闭小程序后重新打开并选择身份进入。`,
        showCancel: false,
      })
      return
    }
    wx.reLaunch({ url: '/pages/welcome/welcome' })
  },
  onCloseWxLoginSheet() {
    this.setData({ showWxLoginSheet: false })
    setTabBarHidden(this, false)
  },
  onChooseAvatar(e) {
    const url = e.detail?.avatarUrl
    if (!url) return
    this.setData({ wxLoginAvatar: url })
    wxProfileDisplay.writeWxProfileCache({ wxAvatarUrl: url })
  },
  async onDyPickAvatar() {
    try {
      const path = await mpDouyinAuthUi.pickAvatarFromAlbum()
      this.setData({ wxLoginAvatar: path })
      wxProfileDisplay.writeWxProfileCache({ wxAvatarUrl: path })
    } catch (e) {
      const msg = mpDouyinAuthUi.formatPickErr(e, '选择头像失败')
      console.warn('[mine] pickAvatar', msg)
      if (!mpDouyinAuthUi.isUserCancel(msg)) {
        wx.showToast({
          title: msg.length > 24 ? msg.slice(0, 24) + '…' : msg,
          icon: 'none',
          duration: 3500,
        })
      }
    }
  },
  onNicknameInput(e) {
    const nick = e.detail.value || ''
    this.setData({ wxLoginNick: nick })
    if (nick) wxProfileDisplay.writeWxProfileCache({ wxNickName: nick })
  },
  onNicknameReview(e) {
    const nick = String(e.detail?.nickname || e.detail?.value || '').trim()
    if (!nick) return
    this.setData({ wxLoginNick: nick })
    wxProfileDisplay.writeWxProfileCache({ wxNickName: nick })
  },
  async onConfirmWxLogin() {
    if (this.data.wxLoginSubmitting) return
    let nick = String(this.data.wxLoginNick || '').trim()
    let avatar = String(this.data.wxLoginAvatar || '').trim()
    try {
      const resolved = await wxProfileDisplay.resolveWxProfileForLogin(nick, avatar)
      nick = resolved.nick
      avatar = resolved.avatar
    } catch (_) {}
    if (!nick) {
      wx.showToast({ title: OAUTH_COPY.confirmNickToast, icon: 'none' })
      return
    }
    if (wxProfileDisplay.isPlaceholderWxNick(nick)) {
      wx.showToast({ title: OAUTH_COPY.confirmNickTapToast, icon: 'none' })
      return
    }
    const identity = userProfile.readIdentity()
    if (!identityTypes.isWorkIdentity(identity)) {
      wx.showToast({ title: '请先选择登录身份', icon: 'none' })
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    wxProfileDisplay.writeWxProfileCache({ wxNickName: nick, wxAvatarUrl: avatar })
    this.setData({ wxLoginSubmitting: true, profileNick: nick, avatarUrl: avatar, displayName: nick })
    try {
      const role = identityTypes.accountRoleForWorkIdentity(identity)
      let data
      if (auth.isLoggedIn()) {
        await wxProfileDisplay.applyWxProfileAfterLogin(nick, avatar)
      } else {
        data = await auth.wxLogin({
          role,
          wxNickName: nick,
          wxAvatarUrl: avatar,
        })
        await switchWorkIdentity.applyWorkIdentityAfterLogin(
          (data && data.token) || auth.readSessionToken(),
          auth.readAccount() || (data && data.account),
          identity,
        )
        await wxProfileDisplay.applyWxProfileAfterLogin(nick, avatar)
      }
      try {
        await require('../../utils/registryProfileSync.js').pullRegistryProfileAfterLogin()
      } catch (_) {}
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
      const avatarPersisted = await wxProfileDisplay.persistWxAvatarUrl(av)
      wxAccount.writeWxAccount({ wxNickName: n, wxAvatarUrl: avatarPersisted })
      const avFinal = avatarPersisted || av
      try {
        await auth.updateWxProfile(n, avFinal)
      } catch (_) {}
      const identity = userProfile.readIdentity()
      const ts = new Date().toLocaleString('zh-CN', { hour12: false })
      if (identity === 'talent') {
        const prev = memberStore.readMember()
        if (prev) {
          const member = { ...prev, wxNickName: n, wxAvatarUrl: avFinal, updatedAt: ts }
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
        const saved = { ...prev, wxNickName: n, wxAvatarUrl: avFinal, updatedAt: ts }
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
              wxAvatarUrl: avFinal,
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
          part.avatarUrl = avFinal
          if (part.memberSnapshot) {
            part.memberSnapshot = { ...part.memberSnapshot, wxNickName: n, wxAvatarUrl: avFinal }
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
  onMenuTap(e) {
    const key = e.currentTarget.dataset.key
    const url = MENU_URLS[key]
    if (!url) return
    if (PR_MENU_KEYS.has(key)) {
      identityTheme.applyChrome('pr', { animate: false })
    }
    if (key === 'profile' || key === 'prProfile') {
      if (key === 'prProfile') {
        if (!auth.isLoggedIn()) {
          guestRoutes.redirectToLogin(url)
          return
        }
        wx.navigateTo({ url })
        return
      }
      mpProfileNav.goMyProfile(url)
      return
    }
    if (GUEST_FREE_MENU_KEYS.has(key)) {
      wx.navigateTo({ url })
      return
    }
    if (!this.ensureWxLoggedIn()) return
    wx.navigateTo({ url })
  },
  goEditProfile() {
    const url =
      this.data.identity === 'pr' ? '/pages/mine-pr-profile/mine-pr-profile' : mpProfileNav.DEFAULT_URL
    if (this.data.identity === 'pr') {
      if (!auth.isLoggedIn()) {
        guestRoutes.redirectToLogin(url)
        return
      }
      wx.navigateTo({ url })
      return
    }
    mpProfileNav.goMyProfile(url)
  },
})
