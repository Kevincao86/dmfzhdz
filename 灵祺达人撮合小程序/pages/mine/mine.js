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
const accountSessionActions = require('../../utils/accountSessionActions.js')
const mpMembershipUi = require('../../utils/mpMembershipUi.js')
const orderCalendar = require('../../utils/orderCalendarEvents.js')
const appRegistrySync = require('../../utils/applicationsRegistrySync.js')
const applicationsStore = require('../../utils/applicationsStore.js')
const prPublishedOrders = require('../../utils/prPublishedOrders.js')

const MY_ORDERS_MENU = {
  key: 'myOrders',
  label: '我的订单',
  sub: '会员开通与积分充值记录',
  icon: 'list',
}

const POINTS_RECHARGE_MENU = {
  key: 'pointsRecharge',
  label: '积分充值',
  sub: '视频/文稿检核与 Brief 生成',
  icon: 'wallet',
}

const BRIEF_GEN_MENU = {
  key: 'briefGen',
  label: '爆款 Brief 生成',
  sub: '钩子 · 分镜 · 话题 · 审片清单',
  icon: 'tpl',
}

const AFFILIATE_PORTAL_MENU = {
  key: 'affiliatePortal',
  label: '我的推广',
  sub: '申请开通 · 推广码 · 佣金结算',
  icon: 'cooperation',
}

function injectAffiliatePortalMenu(menus) {
  const list = [...(menus || [])]
  if (list.some((item) => item.key === 'affiliatePortal' || item.key === 'affiliateApply')) return list
  const supportIdx = list.findIndex((item) => item.key === 'support')
  const at = supportIdx >= 0 ? supportIdx : list.length
  list.splice(at, 0, AFFILIATE_PORTAL_MENU)
  return list
}

const AI_REVIEW_MENU = {
  key: 'aiReview',
  label: '视频/文稿审核',
  sub: 'AI 合规检核 · 单条与批量',
  icon: 'briefTemplates',
}

const ADDONS_HUB_MENU = {
  key: 'addonsHub',
  label: '增值服务',
  sub: 'Brief · 审核 · 短视频 · 数字人 · 视觉工坊',
  icon: 'wallet',
}

const PR_MENU_KEYS = new Set(['prOrders', 'prProfile', 'formRelay', 'cooperation', 'briefTemplates', 'funnel', 'talentWatchlist'])

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
  return attachMenuGlyphs(injectAffiliatePortalMenu(list))
}

function injectBriefGenMenu(menus) {
  const list = [...(menus || [])]
  if (list.some((item) => item.key === 'briefGen')) return list
  const afterIdx = list.findIndex((item) => item.key === 'orderCalendar')
  const at = afterIdx >= 0 ? afterIdx + 1 : Math.min(4, list.length)
  list.splice(at, 0, BRIEF_GEN_MENU)
  return list
}

function injectAiReviewMenu(menus) {
  const list = [...(menus || [])]
  if (list.some((item) => item.key === 'aiReview')) return list
  const briefIdx = list.findIndex((item) => item.key === 'briefGen')
  const at = briefIdx >= 0 ? briefIdx + 1 : list.length
  list.splice(at, 0, AI_REVIEW_MENU)
  return list
}

function injectAfterKey(menus, afterKey, item) {
  const list = [...(menus || [])]
  if (list.some((m) => m.key === item.key)) return list
  const idx = list.findIndex((m) => m.key === afterKey)
  const at = idx >= 0 ? idx + 1 : list.length
  list.splice(at, 0, item)
  return list
}

function filterMenusForAccount(menus, account, identity) {
  const mpBriefAccess = require('../../utils/mpBriefAccess.js')
  const mpAiReviewAccess = require('../../utils/mpAiReviewAccess.js')
  const prFeatureAccess = require('../../utils/prFeatureAccess.js')
  const mpFeatureFlags = require('../../utils/mpFeatureFlags.js')
  let list = [...(menus || [])]
  if (mpBriefAccess.canUseBriefFeature(account)) {
    list = attachMenuGlyphs(injectBriefGenMenu(list))
  }
  if (mpAiReviewAccess.canUseAiReviewFeature(account)) {
    list = attachMenuGlyphs(injectAiReviewMenu(list))
  }
  const access = prFeatureAccess.readAccountPrFeatureAccess(account)
  // 短视频 / 数字人 / 视觉工坊仅在「增值服务」hub 内进入，不在「我的」重复列出
  if (mpFeatureFlags.ADDONS_NAV_VISIBLE && access.any) {
    const afterKey = list.some((i) => i.key === 'aiReview')
      ? 'aiReview'
      : list.some((i) => i.key === 'briefGen')
        ? 'briefGen'
        : 'orderCalendar'
    list = attachMenuGlyphs(injectAfterKey(list, afterKey, ADDONS_HUB_MENU))
  }
  return list.filter((item) => {
    if (item.key === 'briefGen') return mpBriefAccess.canUseBriefFeature(account)
    if (item.key === 'aiReview') return mpAiReviewAccess.canUseAiReviewFeature(account)
    if (item.key === 'addonsHub') return mpFeatureFlags.ADDONS_NAV_VISIBLE && access.any
    return true
  })
}

const QUICK_MENU_KEYS = {
  talent: ['profile', 'applications', 'orderCalendar', 'favorites', 'talentCredit'],
  shoot: ['profile', 'applications', 'orderCalendar', 'favorites', 'talentCredit'],
  edit: ['profile', 'applications', 'orderCalendar', 'favorites', 'talentCredit'],
  pr: ['prProfile', 'prOrders', 'orderCalendar', 'cooperation', 'talentWatchlist'],
}

function workbenchGreeting(displayName) {
  const h = new Date().getHours()
  const tail =
    h < 11
      ? '早上好，今天又是元气满满的一天！'
      : h < 14
        ? '中午好，记得适当休息～'
        : h < 18
          ? '下午好，继续加油！'
          : '晚上好，辛苦啦！'
  const name = String(displayName || '').trim()
  return name && name !== '灵祺用户' ? `${name}，${tail}` : tail
}

function splitWorkbenchMenus(menus, identity) {
  const keys = QUICK_MENU_KEYS[identity] || QUICK_MENU_KEYS.talent
  const keySet = new Set(keys)
  const quick = []
  const biz = []
  for (const item of menus || []) {
    if (keySet.has(item.key)) quick.push({ ...item })
    else biz.push({ ...item })
  }
  const orderedQuick = keys.map((k) => quick.find((i) => i.key === k)).filter(Boolean)
  return { quickMenus: orderedQuick, bizMenus: biz }
}
const mpShare = require('../../utils/mpShare.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')
const mpProfileNav = require('../../utils/mpProfileNav.js')
const mineProfileStats = require('../../utils/mineProfileStats.js')

function patchOrderCalendarMenuItem(item, identity, todoCount) {
  if (!item || item.key !== 'orderCalendar') return item
  const badge = todoCount > 0 ? (todoCount > 99 ? '99+' : String(todoCount)) : ''
  return { ...item, sub: orderCalendar.calendarSubtitle(identity), badge }
}

function patchMenusCalendarMeta(menus, identity, todoCount) {
  return (menus || []).map((item) => patchOrderCalendarMenuItem(item, identity, todoCount))
}

function talentMenusForIdentity(identity) {
  const calSub = orderCalendar.calendarSubtitle(identity)
  if (identity === 'shoot') {
    return withManualMenu([
      { key: 'profile', label: '拍摄团队信息', sub: '团队资料 · 设备 · 作品集', icon: 'info' },
      { key: 'applications', label: '我的报名', sub: '查看已提交的招募报名', icon: 'list' },
      { key: 'orderCalendar', label: '商单日历', sub: calSub, icon: 'chart' },
      { key: 'favorites', label: '我的收藏', sub: '收藏的招募商单', icon: 'star' },
      { key: 'prQuotes', label: '我的报价', sub: '为合作 PR 设置专属报价', icon: 'quote' },
      POINTS_RECHARGE_MENU,
      MY_ORDERS_MENU,
      { key: 'subscriptions', label: '商单订阅', sub: '匹配城市/平台/品类的新招募提醒', icon: 'star' },
      { key: 'talentCredit', label: '达人信用', sub: '履约评分与提升建议', icon: 'chart' },
      { key: 'analytics', label: '数据分析', sub: '报名与发单概况', icon: 'chart' },
      { key: 'support', label: '小灵同学', sub: '我的客服与常见问题', icon: 'support' },
    ])
  }
  if (identity === 'edit') {
    return withManualMenu([
      { key: 'profile', label: '剪辑团队信息', sub: '团队资料 · 风格 · 作品集', icon: 'info' },
      { key: 'applications', label: '我的报名', sub: '查看已提交的招募报名', icon: 'list' },
      { key: 'orderCalendar', label: '商单日历', sub: calSub, icon: 'chart' },
      { key: 'favorites', label: '我的收藏', sub: '收藏的招募商单', icon: 'star' },
      { key: 'prQuotes', label: '我的报价', sub: '为合作 PR 设置专属报价', icon: 'quote' },
      POINTS_RECHARGE_MENU,
      MY_ORDERS_MENU,
      { key: 'subscriptions', label: '商单订阅', sub: '匹配城市/平台/品类的新招募提醒', icon: 'star' },
      { key: 'talentCredit', label: '达人信用', sub: '履约评分与提升建议', icon: 'chart' },
      { key: 'analytics', label: '数据分析', sub: '报名与发单概况', icon: 'chart' },
      { key: 'support', label: '小灵同学', sub: '我的客服与常见问题', icon: 'support' },
    ])
  }
  return withManualMenu([
    { key: 'profile', label: '我的信息', sub: '多平台达人资料（抖音/小红书等）', icon: 'info' },
    { key: 'applications', label: '我的报名', sub: '查看已提交的招募报名', icon: 'list' },
    { key: 'targetedInvites', label: '我的邀约', sub: 'PR 定向合作邀约，接受或拒绝', icon: 'list' },
    { key: 'wechatOaBind', label: '服务号邀约通知', sub: '关注服务号，定向邀约推送到微信', icon: 'star' },
    { key: 'orderCalendar', label: '商单日历', sub: calSub, icon: 'chart' },
    { key: 'favorites', label: '我的收藏', sub: '收藏的招募商单', icon: 'star' },
    { key: 'prQuotes', label: '我的报价', sub: '为合作 PR 设置专属报价', icon: 'quote' },
    POINTS_RECHARGE_MENU,
    MY_ORDERS_MENU,
    { key: 'subscriptions', label: '商单订阅', sub: '匹配城市/平台/品类的新招募提醒', icon: 'star' },
    { key: 'talentCredit', label: '达人信用', sub: '履约评分与提升建议', icon: 'chart' },
    { key: 'analytics', label: '数据分析', sub: '报名与发单概况', icon: 'chart' },
    { key: 'support', label: '小灵同学', sub: '我的客服与常见问题', icon: 'support' },
  ])
}

function buildPrMenus() {
  const calSub = orderCalendar.calendarSubtitle('pr')
  return withManualMenu([
    { key: 'prProfile', label: '我的 PR 信息', sub: '机构/个人资料与所在城市', icon: 'info' },
    { key: 'prOrders', label: '我的发单', sub: '已发布的招募订单', icon: 'list' },
    { key: 'orderCalendar', label: '商单日历', sub: calSub, icon: 'chart' },
    POINTS_RECHARGE_MENU,
    MY_ORDERS_MENU,
    { key: 'templates', label: '我的模版', sub: '达人 / 拍摄 / 剪辑报名表单', icon: 'tpl' },
    { key: 'briefTemplates', label: 'Brief 模版', sub: '结构化发单模版 · 一键套用', icon: 'tpl' },
    { key: 'cooperation', label: '合作达人池', sub: '已完成商单沉淀 · 优先复用', icon: 'star' },
    { key: 'talentWatchlist', label: '黑灰名单', sub: '团队共享 · 避免重复踩坑', icon: 'list' },
    { key: 'formRelay', label: '转发工具', sub: '外部表单代收 · 导出回填', icon: 'tpl' },
    { key: 'funnel', label: '招募漏斗', sub: '曝光→报名→入选→发布转化', icon: 'chart' },
    { key: 'analytics', label: '数据分析', sub: '发单与转化概况', icon: 'chart' },
    { key: 'support', label: '小灵同学', sub: '我的客服与常见问题', icon: 'support' },
  ])
}

const MENU_URLS = {
  profile: '/pages/register/register?edit=1',
  applications: '/pages/subpack-mine/mine-applications/mine-applications',
  targetedInvites: '/pages/subpack-mine/mine-targeted-invites/mine-targeted-invites',
  wechatOaBind: '/pages/subpack-mine/mine-wechat-oa-bind/mine-wechat-oa-bind',
  orderCalendar: '/pages/subpack-mine/mine-order-calendar/mine-order-calendar',
  favorites: '/pages/subpack-mine/mine-favorites/mine-favorites',
  templates: '/pages/subpack-mine/mine-templates/mine-templates',
  notifications: '/pages/subpack-mine/mine-notifications/mine-notifications',
  analytics: '/pages/subpack-mine/mine-analytics/mine-analytics',
  subscriptions: '/pages/subpack-mine/mine-subscriptions/mine-subscriptions',
  talentCredit: '/pages/subpack-mine/mine-talent-credit/mine-talent-credit',
  cooperation: '/pages/subpack-mine/mine-cooperation/mine-cooperation',
  talentWatchlist: '/pages/subpack-mine/mine-talent-watchlist/mine-talent-watchlist',
  briefTemplates: '/pages/subpack-mine/mine-brief-templates/mine-brief-templates',
  funnel: '/pages/subpack-mine/mine-funnel/mine-funnel',
  prQuotes: '/pages/subpack-pr/mine-pr-quotes/mine-pr-quotes',
  support: '/pages/subpack-mine/mine-support/mine-support',
  manual: '/pages/subpack-mine/mine-manual/mine-manual',
  prProfile: '/pages/subpack-pr/mine-pr-profile/mine-pr-profile',
  prOrders: '/pages/subpack-pr/mine-pr-orders/mine-pr-orders',
  formRelay: '/pages/subpack-pr/mine-form-relay/mine-form-relay',
  myOrders: '/pages/subpack-mine/mine-my-orders/mine-my-orders',
  pointsRecharge: '/pages/subpack-mine/mine-xingxuan-points-recharge/mine-xingxuan-points-recharge',
  briefGen: '/pages/subpack-pr/mine-pr-addon-ai-content/mine-pr-addon-ai-content',
  aiReview: '/pages/subpack-pr/mine-pr-addon-ai-review/mine-pr-addon-ai-review',
  addonsHub: '/pages/subpack-pr/mine-pr-addons/mine-pr-addons',
  xingxuanMembership: '/pages/subpack-mine/mine-xingxuan-membership/mine-xingxuan-membership',
  affiliatePortal: '/pages/subpack-mine/mine-affiliate-portal/mine-affiliate-portal',
  affiliateApply: '/pages/subpack-mine/mine-affiliate-apply/mine-affiliate-apply',
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
    displaySub: '微信登录后使用完整功能',
    identityIdLine: '',
    menus: talentMenusForIdentity('talent'),
    quickMenus: [],
    bizMenus: [],
    greeting: '',
    notifyBadge: 0,
    calendarTodoCount: 0,
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
    statAppliedKey: 'applications',
    profileVerified: false,
    membershipPlanLabel: '基础版（免费）',
    membershipExpiryLabel: '',
    membershipCtaLabel: '升级会员',
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
        ...splitWorkbenchMenus(talentMenusForIdentity('talent'), 'talent'),
        greeting: workbenchGreeting('灵祺用户'),
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
    void this.refreshCalendarTodoBadge()
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
    let displaySub = '微信登录后使用完整功能'

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
    const menus = filterMenusForAccount(
      identity === 'pr' ? buildPrMenus() : talentMenusForIdentity(identity),
      acct,
      identity,
    )
    const { quickMenus, bizMenus } = splitWorkbenchMenus(menus, identity)
    const planId = mpMembershipUi.readMembershipPlanId(acct, identity, member, prProfile)
    const membershipPlanLabel = mpMembershipUi.planLabel(planId)
    const membershipExpiryLabel = mpMembershipUi.formatExpiryLabel(
      planId,
      mpMembershipUi.readMembershipExpiresAt(acct, identity, member, prProfile),
    )
    const membershipCtaLabel = mpMembershipUi.membershipCtaLabel(planId)
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
      menus,
      quickMenus,
      bizMenus,
      greeting: workbenchGreeting(displayName),
      statAppliedKey: identity === 'pr' ? 'prOrders' : 'applications',
      notifyBadge: 0,
      calendarTodoCount: this.data.calendarTodoCount || 0,
      wxLoginNick: wxAcc?.wxNickName || this.data.wxLoginNick || '',
      wxLoginAvatar: wxAcc?.wxAvatarUrl || this.data.wxLoginAvatar || '',
      membershipPlanLabel,
      membershipExpiryLabel,
      membershipCtaLabel,
      ...stats,
    })
    if (identity === 'pr' && wxLoggedIn) void this.refreshPrStatsIfNeeded()
  },
  async refreshPrStatsIfNeeded() {
    if (userProfile.readIdentity() !== 'pr' || !auth.isLoggedIn()) return
    try {
      const stats = await mineProfileStats.loadPrStatsAsync()
      if (userProfile.readIdentity() !== 'pr') return
      this.setData(stats)
    } catch (_) {}
  },
  onGoMembership() {
    if (!this.ensureWxLoggedIn()) return
    wx.navigateTo({ url: MENU_URLS.xingxuanMembership })
  },
  async refreshCalendarTodoBadge() {
    if (!auth.isLoggedIn() || !api.hasApi()) return
    const identity = userProfile.readIdentity()
    if (!identityTypes.isWorkIdentity(identity)) return
    try {
      const isPr = identity === 'pr'
      const reg = await appRegistrySync.fetchRegistryAndReconcileApplications(
        isPr ? { includePrOwned: true } : { includeLocalContext: true },
      )
      const orders = (reg && reg.mpRecruitmentOrders) || []
      let events
      if (isPr) {
        const account = auth.readAccount()
        const owned = orders.filter((o) => prPublishedOrders.mpOrderOwnedByCurrentPr(o, account))
        events = orderCalendar.aggregatePrOrderCalendarEvents(owned)
      } else {
        const apps = applicationsStore.readApplications()
        const ids = apps.map((a) => String(a.applicantId || '').trim()).filter(Boolean)
        const acct = auth.readAccount()
        const talentMemberId = String(
          (acct && acct.registryMemberId) || participant.resolveTalentMemberId() || '',
        ).trim()
        events = orderCalendar.aggregateOrderCalendarEvents(orders, {
          identity,
          applicantIds: ids,
          talentMemberId,
        })
      }
      const count = orderCalendar.countActiveTodos(events)
      const menus = patchMenusCalendarMeta(this.data.menus, identity, count)
      const quickMenus = patchMenusCalendarMeta(this.data.quickMenus, identity, count)
      const bizMenus = patchMenusCalendarMeta(this.data.bizMenus, identity, count)
      const app = getApp()
      if (app && app.globalData) app.globalData.calendarTodoCount = count
      this.setData({ calendarTodoCount: count, menus, quickMenus, bizMenus })
    } catch (_) {}
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
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/welcome/welcome' })
      return
    }
    wx.showModal({
      title: '切换身份',
      content: '是否退出当前账号？退出后将返回身份选择页。',
      confirmText: '退出',
      confirmColor: '#0284c7',
      success(res) {
        if (res.confirm) accountSessionActions.logout()
      },
    })
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
      wx.showToast({ title: '请填写微信昵称', icon: 'none' })
      return
    }
    if (wxProfileDisplay.isPlaceholderWxNick(nick)) {
      wx.showToast({ title: '请点击昵称框选用微信昵称', icon: 'none' })
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
  async openAffiliateEntry() {
    const applyUrl = MENU_URLS.affiliateApply
    const portalUrl = MENU_URLS.affiliatePortal
    if (!auth.isLoggedIn()) {
      guestRoutes.redirectToLogin(applyUrl)
      return
    }
    wx.showLoading({ title: '加载中', mask: true })
    try {
      const affiliateApply = require('../../utils/mpDistributionAffiliateApply.js')
      const affiliate = await affiliateApply.fetchMyStatus()
      wx.hideLoading()
      if (affiliate && affiliate.status === 'active') {
        wx.navigateTo({ url: portalUrl })
        return
      }
      wx.navigateTo({ url: applyUrl })
    } catch (_) {
      wx.hideLoading()
      wx.navigateTo({ url: applyUrl })
    }
  },
  onMenuTap(e) {
    const key = e.currentTarget.dataset.key
    const url = MENU_URLS[key]
    if (!url) return
    if (PR_MENU_KEYS.has(key)) {
      identityTheme.applyChrome('pr', { animate: false })
    }
    if (key === 'affiliatePortal' || key === 'affiliateApply') {
      void this.openAffiliateEntry()
      return
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
      this.data.identity === 'pr' ? '/pages/subpack-pr/mine-pr-profile/mine-pr-profile' : mpProfileNav.DEFAULT_URL
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
