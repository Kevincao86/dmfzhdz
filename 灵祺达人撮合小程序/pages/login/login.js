const auth = require('../../utils/auth.js')
const mpApiErrors = require('../../utils/mpApiErrors.js')
const wxAccount = require('../../utils/wxAccount.js')
const userProfile = require('../../utils/userProfile.js')
const identityTypes = require('../../utils/identityTypes.js')
const switchWorkIdentity = require('../../utils/switchWorkIdentity.js')
const mpPhoneAuth = require('../../utils/mpPhoneAuth.js')
const api = require('../../utils/api.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')
const mpCdnAssets = require('../../utils/mpCdnAssets.js')
const { loginIdentityIcon } = require('../../utils/loginIdentityIcons.js')
const loginLegalAgree = require('../../utils/loginLegalAgree.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')
const mpShare = require('../../utils/mpShare.js')
const mpPrivacyAuthorize = require('../../utils/mpPrivacyAuthorize.js')
const { MP_ICP_FILING, MP_PSB_FILING } = require('../../utils/siteIcp.js')

const LEGAL_PROMPT_COPY = {
  wx: {
    text: '使用微信一键登录前，请勾选并同意《用户协议》和《隐私政策》。将使用当前微信身份登录，不会改绑手机号。',
    agree: '同意并登录',
  },
  phone: {
    text: '使用手机号快捷登录前，请勾选并同意《用户协议》和《隐私政策》。只按手机号进入账号，不会自动绑定微信。',
    agree: '同意并继续',
  },
  pwd: {
    text: '使用账号登录前，请勾选并同意《用户协议》和《隐私政策》。',
    agree: '同意并登录',
  },
  sms: {
    text: '使用手机验证码登录前，请勾选并同意《用户协议》和《隐私政策》。',
    agree: '同意并登录',
  },
}

function isWxPrivacyUndeclared(detail) {
  const errMsg = String((detail && detail.errMsg) || '')
  const errno = Number(detail && detail.errno)
  return errno === 112 || /not declared in the privacy agreement/i.test(errMsg)
}

function wxPhoneAuthFailHint(detail) {
  const errMsg = String((detail && detail.errMsg) || '')
  const errno = Number(detail && detail.errno)
  let platform = ''
  let envVersion = ''
  try {
    platform = String((wx.getSystemInfoSync() || {}).platform || '')
  } catch (_) {}
  try {
    envVersion = String(((wx.getAccountInfoSync() || {}).miniProgram || {}).envVersion || '')
  } catch (_) {}
  if (isWxPrivacyUndeclared(detail)) {
    return '微信后台还没在《用户隐私保护指引》里声明「手机号」。请用小程序账号登录 mp.weixin.qq.com → 设置 → 服务内容声明 → 用户隐私保护指引，勾选手机号后保存，约 5 分钟后再试'
  }
  if (platform === 'devtools') {
    return '开发者工具读不到真实手机号，请用「预览」扫到手机上再点手机号快捷登录'
  }
  if (errno === 104 || /needAuthorization/i.test(errMsg)) {
    return '请先同意《隐私保护指引》，再点手机号快捷登录'
  }
  if (/deny|cancel|拒绝/i.test(errMsg)) {
    return '需要在弹窗里允许获取绑定手机号'
  }
  if (/no permission|banned|jsapi/i.test(errMsg)) {
    return '当前小程序还不能读取手机号。请到微信公众平台确认已认证，并在「管理 → 付费管理」查看手机号快速验证额度'
  }
  if (envVersion === 'develop') {
    return '真机调试有时拉不起选号窗。请用开发者工具「预览」扫码，或上传体验版后再试'
  }
  return '未能读取手机号，请再点一次「手机号快捷登录」'
}

function isWxPrivacyBlock(detail) {
  if (isWxPrivacyUndeclared(detail)) return false
  const errMsg = String((detail && detail.errMsg) || '')
  const errno = Number(detail && detail.errno)
  return errno === 104 || /needAuthorization/i.test(errMsg)
}

function openLegalPrompt(page, workId, action) {
  const copy = LEGAL_PROMPT_COPY[action] || LEGAL_PROMPT_COPY.wx
  page.setData({
    showLegalPrompt: true,
    legalPromptWorkId: workId,
    legalPromptAction: action,
    legalPromptText: copy.text,
    legalPromptAgreeLabel: copy.agree,
    err: '',
  })
}

function syncLoginIdentityFromProfile(page) {
  const id = userProfile.readIdentity()
  const meta = identityTypes.WORK_IDENTITIES[id] || identityTypes.WORK_IDENTITIES.talent
  page.setData({
    loginIdentity: id,
    loginIdentityLabel: meta.label,
    loginIdentityIcon: loginIdentityIcon(id),
  })
}

async function applyLoginIdentity(data) {
  const account = (data && data.account) || auth.readAccount()
  if (account) userProfile.adoptAccountIdentity(account)
}

function navigateAfterLogin(page) {
  const tabBar = require('../../utils/tabBar.js')
  tabBar.refreshTabBar()
  const pendingPublish = require('../../utils/publishPendingAfterLogin.js').read()
  if (pendingPublish && pendingPublish.autoSubmit) {
    wx.showToast({ title: '登录成功，正在发布招募', icon: 'none', duration: 2200 })
  }
  const redirect = page && page.data && page.data.redirect ? String(page.data.redirect).trim() : ''
  if (redirect && redirect.startsWith('/pages/')) {
    const pathOnly = redirect.split('?')[0].replace(/^\//, '')
    const tabPaths = new Set([
      'pages/index/index',
      'pages/recommend/recommend',
      'pages/publish/publish',
      'pages/messages/messages',
      'pages/mine/mine',
    ])
    const url = redirect.startsWith('/') ? redirect : `/${redirect}`
    if (tabPaths.has(pathOnly)) {
      wx.switchTab({ url: pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}` })
    } else {
      wx.redirectTo({ url })
    }
    return
  }
  wx.switchTab({ url: '/pages/index/index' })
}

function accountNeedsPhoneBind() {
  return auth.needsPhoneBind()
}

function resumeOrNavigateAfterLogin(page) {
  if (accountNeedsPhoneBind()) {
    const workId =
      (page.data && page.data.pendingWorkIdForBind) ||
      (page.data && page.data.pendingWorkId) ||
      (identityTypes.isWorkIdentity(page.data.loginIdentity)
        ? page.data.loginIdentity
        : userProfile.readIdentity())
    page.setData({
      showPhoneBindSheet: true,
      pendingWorkIdForBind: workId,
      err: '',
    })
    return
  }
  void navigateAfterLogin(page)
}

function wxNickFromDetail(detail) {
  if (!detail || typeof detail !== 'object') return ''
  return String(detail.nickname || detail.nickName || detail.value || '').trim()
}

function readWxNickInput(page) {
  return new Promise((resolve) => {
    page
      .createSelectorQuery()
      .select('#login-wx-nick-input')
      .fields({ properties: ['value'] })
      .exec((res) => {
        const qv = res && res[0] && res[0].value
        resolve(String(qv || (page.data && page.data.wxNickName) || '').trim())
      })
  })
}

function dismissWxNickPicker(page) {
  if (page._nickDismissTimer) {
    clearTimeout(page._nickDismissTimer)
    page._nickDismissTimer = null
  }
  page.setData({ wxNickInputFocus: false })
  const hide = () => {
    try {
      wx.hideKeyboard()
    } catch (_) {}
  }
  hide()
  setTimeout(() => {
    page.setData({ wxNickInputVisible: false })
    hide()
  }, 60)
  setTimeout(hide, 180)
  setTimeout(hide, 360)
}

function applyWxNick(page, nick, opts) {
  const options = opts || {}
  const name = String(nick || '').trim()
  if (!name) return false
  page.setData({
    wxNickName: name,
    wxNickInputFocus: false,
    ...(options.keepInputVisible ? {} : { wxNickInputVisible: false }),
  })
  require('../../utils/wxProfileDisplay.js').writeWxProfileCache({ wxNickName: name })
  if (!options.keepInputVisible) dismissWxNickPicker(page)
  return true
}

function finalizeWxNickFromInput(page) {
  return readWxNickInput(page).then((nick) => {
    const fromState = String((page.data && page.data.wxNickName) || '').trim()
    const name = String(nick || fromState).trim()
    if (!name) return false
    return applyWxNick(page, name)
  })
}

Page({
  behaviors: [
    require('../../behaviors/mpDefaultShare'),
    require('../../behaviors/identityTheme'),
  ],
  data: {
    tab: 'wx',
    loginIdentity: '',
    loginIdentityLabel: '',
    loginIdentityIcon: '',
    loginName: '',
    password: '',
    smsPhone: '',
    smsLoginCode: '',
    smsSending: false,
    smsCooldown: 0,
    loading: false,
    err: '',
    navBandStyle: '',
    navInnerStyle: '',
    featureItems: [
      { tag: 'AI荐达人', text: '高匹配人才', glyph: '★' },
      { tag: '招募大厅', text: '多行业覆盖', glyph: '👥' },
      { tag: '私信沟通', text: '实时对接', glyph: '💬' },
    ],
    authHeroBg: mpCdnAssets.loginHeroBg,
    shareCoverPreloadUrl: mpCdnAssets.defaultShareCover,
    wxNickName: '',
    wxAvatarUrl: '',
    wxAvatarPlaceholder: '/images/logo.png',
    showWxAuthSheet: false,
    wxAuthStep: 'avatar',
    wxNickInputFocus: false,
    wxNickInputVisible: true,
    pendingWorkId: '',
    redirect: '',
    legalAgreed: false,
    showLegalPrompt: false,
    legalPromptWorkId: '',
    legalPromptAction: 'wx',
    legalPromptText: LEGAL_PROMPT_COPY.wx.text,
    legalPromptAgreeLabel: LEGAL_PROMPT_COPY.wx.agree,
    icpFiling: MP_ICP_FILING,
    psbFiling: MP_PSB_FILING,
    showPhoneBindSheet: false,
    bindPhone: '',
    pendingWorkIdForBind: '',
    wxPrivacyPending: false,
    wxPhoneDebug: '',
  },

  onLoad(options) {
    mpShare.enableShareMenu()
    this.applyLoginNavPadding()
    const redirect =
      options && options.redirect ? decodeURIComponent(String(options.redirect)) : ''
    const wxProfileDisplay = require('../../utils/wxProfileDisplay.js')
    const cache = wxProfileDisplay.readWxProfileCache()
    const local = wxAccount.readWxAccount()
    this.setData({
      err: '',
      redirect,
      legalAgreed: loginLegalAgree.readAgreed(),
      wxNickName: wxProfileDisplay.pickWxNick(cache && cache.wxNickName, local && local.wxNickName),
      wxAvatarUrl: wxProfileDisplay.pickWxAvatar(cache && cache.wxAvatarUrl, local && local.wxAvatarUrl),
    })
    syncLoginIdentityFromProfile(this)
    if (this.data.legalAgreed) this.primeWxPrivacy()
    if (auth.isLoggedIn()) {
      if (accountNeedsPhoneBind()) {
        this.setData({
          showPhoneBindSheet: true,
          pendingWorkIdForBind: userProfile.readIdentity(),
        })
        return
      }
      void navigateAfterLogin(this)
    }
  },

  onShow() {
    mpShare.enableShareMenu()
    this.applyLoginNavPadding()
    syncLoginIdentityFromProfile(this)
    try {
      require('../../utils/identityTheme.js').applyToPage(this)
    } catch (_) {}
  },

  primeWxPrivacy() {
    if (typeof wx.requirePrivacyAuthorize !== 'function') return
    wx.requirePrivacyAuthorize({
      success: () => this.setData({ wxPrivacyPending: false }),
      fail: () => {},
    })
  },

  onShareAppMessage() {
    return mpShare.defaultShare('/pages/index/index')
  },

  onShareTimeline() {
    return mpShare.defaultTimelineShare()
  },

  applyLoginNavPadding() {
    applyCapsulePadding(this, null, { band: 'navBandStyle', right: 'navInnerStyle' })
  },

  noopSheetTap() {},

  _handleNeedPrivacyAuthorization(resolve) {
    this._privacyResolve = resolve
    if (this.data.showWxAuthSheet) {
      this.setData({ wxAuthStep: 'privacy', err: '' })
      return
    }
    this.setData({ wxPrivacyPending: true, err: '' })
  },

  onPrivacyAuthorizeAgree() {
    mpPrivacyAuthorize.resolvePrivacyAuthorization(this, mpPrivacyAuthorize.PRIVACY_AGREE_BTN_ID)
    this.setData({ wxPrivacyPending: false, err: '' })
    if (this.data.wxAuthStep === 'privacy') {
      this.setData({ wxAuthStep: 'avatar' })
      wx.showToast({ title: '请授权微信头像', icon: 'none' })
    }
  },

  onWxPrivacyAgreeThenPhone() {
    mpPrivacyAuthorize.resolvePrivacyAuthorization(this, mpPrivacyAuthorize.PRIVACY_AGREE_BTN_ID)
    this.setData({
      wxPrivacyPending: false,
      err: '请再点一次「手机号快捷登录」，选择绑定的手机号',
      wxPhoneDebug: '',
    })
  },

  onOpenPrivacyContract() {
    mpPrivacyAuthorize.openPrivacyContract(() => {
      wx.navigateTo({ url: '/pages/subpack-signup/legal/legal?doc=privacy' })
    })
  },

  _openWxAvatarStep(workId) {
    this.setData({
      err: '',
      showWxAuthSheet: true,
      wxAuthStep: 'avatar',
      wxNickInputFocus: false,
      wxNickInputVisible: true,
      pendingWorkId: workId,
      wxNickName: '',
      wxAvatarUrl: '',
    })
    wx.showToast({ title: '请授权微信头像', icon: 'none' })
  },

  onTabWx() {
    this.setData({ tab: 'wx', err: '' })
  },
  onTabPwd() {
    this.setData({ tab: 'pwd', err: '' })
  },
  onTabSms() {
    this.setData({
      tab: 'sms',
      err: '',
      smsPhone: this.data.loginName || this.data.smsPhone || '',
    })
  },
  onForgotPassword() {
    this.setData({
      tab: 'sms',
      err: '',
      smsPhone: this.data.loginName || this.data.smsPhone || '',
    })
    wx.showToast({ title: '已切换验证码登录', icon: 'none' })
  },
  onGoSignup() {
    wx.navigateTo({ url: '/pages/subpack-signup/signup/signup' })
  },
  onSmsPhone(e) {
    this.setData({ smsPhone: mpPhoneAuth.sanitizePhoneInput(e.detail.value) })
  },
  onSmsLoginCode(e) {
    this.setData({
      smsLoginCode: String(e.detail.value || '')
        .replace(/\D/g, '')
        .slice(0, 6),
    })
  },

  onGuestMode() {
    guestRoutes.enterGuestBrowse()
    const redirect = String(this.data.redirect || '').trim()
    const authRequired =
      redirect.includes('/pages/apply/') ||
      redirect.includes('/pages/register/') ||
      redirect.includes('/pages/subpack-pr/mine-pr-profile/') ||
      redirect.includes('openFormRelay=1')
    wx.navigateBack({
      delta: 1,
      fail: () => {
        if (redirect && !authRequired) {
          navigateAfterLogin(this)
          return
        }
        wx.switchTab({ url: '/pages/index/index' })
      },
    })
  },

  onBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.switchTab({ url: '/pages/index/index' })
      },
    })
  },

  onLoginName(e) {
    this.setData({ loginName: mpPhoneAuth.sanitizePhoneInput(e.detail.value) })
  },
  onPassword(e) {
    this.setData({ password: e.detail.value })
  },

  onWxChooseAvatar(e) {
    const url = e.detail && e.detail.avatarUrl
    if (!url) return
    const wxProfileDisplay = require('../../utils/wxProfileDisplay.js')
    this.setData({ wxAvatarUrl: url })
    wxProfileDisplay.writeWxProfileCache({ wxAvatarUrl: url })
    if (this.data.showWxAuthSheet && this.data.wxAuthStep === 'avatar') {
      this.setData({ wxAuthStep: 'nick', wxNickInputVisible: true, wxNickInputFocus: true })
      wx.showToast({ title: '请选用微信昵称', icon: 'none' })
    }
  },

  onReEditWxNick() {
    this.setData({ wxNickInputVisible: true, wxNickInputFocus: false, wxNickName: '' }, () => {
      this.setData({ wxNickInputFocus: true })
    })
  },

  onWxNicknameFocus() {
    this.setData({ wxNickInputFocus: true })
  },

  onWxNicknameInput(e) {
    const nick = wxNickFromDetail(e.detail) || String((e.detail && e.detail.value) || '').trim()
    if (!nick) return
    this.setData({ wxNickName: nick })
    if (this._nickDismissTimer) clearTimeout(this._nickDismissTimer)
    this._nickDismissTimer = setTimeout(() => {
      this._nickDismissTimer = null
      const latest = String(this.data.wxNickName || '').trim()
      if (latest) applyWxNick(this, latest)
    }, 320)
  },

  onWxNicknameBlur(e) {
    if (this._nickDismissTimer) {
      clearTimeout(this._nickDismissTimer)
      this._nickDismissTimer = null
    }
    const nick = wxNickFromDetail(e.detail) || String((e.detail && e.detail.value) || '').trim()
    void finalizeWxNickFromInput(this).then((ok) => {
      if (!ok && nick) applyWxNick(this, nick)
    })
  },

  onWxNicknameReview(e) {
    const detail = (e && e.detail) || {}
    if (detail.pass === false) {
      wx.showToast({ title: '昵称需重新选用', icon: 'none' })
      return
    }
    if (this._nickDismissTimer) {
      clearTimeout(this._nickDismissTimer)
      this._nickDismissTimer = null
    }
    setTimeout(() => {
      void finalizeWxNickFromInput(this)
    }, 100)
  },

  onWxNicknameConfirm() {
    if (this._nickDismissTimer) {
      clearTimeout(this._nickDismissTimer)
      this._nickDismissTimer = null
    }
    void finalizeWxNickFromInput(this)
  },

  onCloseWxAuthSheet() {
    dismissWxNickPicker(this)
    this._privacyResolve = null
    this.setData({
      showWxAuthSheet: false,
      wxAuthStep: 'avatar',
      wxNickInputVisible: true,
      pendingWorkId: '',
    })
  },

  onConfirmWxNickStep() {
    void (async () => {
      dismissWxNickPicker(this)
      await finalizeWxNickFromInput(this)
      await this.finishWxAuthAndLogin()
    })()
  },

  onToggleLegalAgree() {
    const next = !this.data.legalAgreed
    loginLegalAgree.writeAgreed(next)
    this.setData({ legalAgreed: next, err: '', wxPhoneDebug: '' })
    if (next) this.primeWxPrivacy()
  },

  onOpenLegal(e) {
    const doc = e.currentTarget.dataset.doc === 'aup' ? 'aup' : 'privacy'
    wx.navigateTo({ url: `/pages/subpack-signup/legal/legal?doc=${doc}` })
  },

  onWxLogin() {
    if (!this.data.legalAgreed) {
      openLegalPrompt(this, 'talent', 'wx')
      return
    }
    this.startWxLoginFlow('talent')
  },

  onLegalDecline() {
    this.setData({ showLegalPrompt: false, legalPromptWorkId: '', legalPromptAction: 'wx' })
  },

  onLegalAgreeLogin() {
    const workId = this.data.legalPromptWorkId
    const action = this.data.legalPromptAction || 'wx'
    if (!workId) {
      this.setData({ showLegalPrompt: false })
      return
    }
    loginLegalAgree.writeAgreed(true)
    this.setData({
      legalAgreed: true,
      showLegalPrompt: false,
      legalPromptWorkId: '',
      legalPromptAction: 'wx',
      err: '',
    })
    if (action === 'wx') this.primeWxPrivacy()
    if (action === 'pwd') {
      void this.doPwdLogin(workId)
      return
    }
    if (action === 'sms') {
      void this.doSmsLogin(workId)
      return
    }
    if (action === 'phone') return
  },

  onGetPhoneNumber(e) {
    const detail = (e && e.detail) || {}
    const phoneCode = String(detail.code || '').trim()
    if (!this.data.legalAgreed) {
      openLegalPrompt(this, 'talent', 'phone')
      return
    }
    if (detail.errMsg && String(detail.errMsg).indexOf('ok') < 0) {
      const debug = [detail.errMsg, detail.errno != null ? `#${detail.errno}` : '']
        .filter(Boolean)
        .join(' ')
      console.warn('[mp] getPhoneNumber fail', debug)
      if (isWxPrivacyBlock(detail)) {
        this.setData({
          wxPrivacyPending: true,
          err: '请先点「同意隐私保护指引」，再点手机号快捷登录',
          wxPhoneDebug: debug,
        })
        return
      }
      this.setData({ err: wxPhoneAuthFailHint(detail), wxPhoneDebug: debug })
      return
    }
    if (!phoneCode) {
      this.setData({ err: '未能读取手机号，请再点一次「手机号快捷登录」' })
      return
    }
    void this.doPhoneQuickLogin(phoneCode)
  },

  onPhoneQuickTap() {
    if (!this.data.legalAgreed) {
      openLegalPrompt(this, 'talent', 'phone')
    }
  },

  async doPhoneQuickLogin(phoneCode) {
    this.setData({ loading: true, err: '' })
    try {
      const data = await auth.phoneQuickLogin(phoneCode)
      await applyLoginIdentity(data)
      if (data && data.isNew) {
        wx.redirectTo({ url: '/pages/subpack-signup/signup/signup?from=wx' })
        return
      }
      resumeOrNavigateAfterLogin(this)
    } catch (e) {
      const msg = e && e.message ? e.message : '登录失败'
      this.setData({
        err: /invalid_phone_code|wx_phone_failed/i.test(msg)
          ? '未能读取手机号，请再点一次「手机号快捷登录」'
          : msg,
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  startWxLoginFlow(workId) {
    if (!this.data.legalAgreed) {
      openLegalPrompt(this, workId, 'wx')
      return
    }
    if (!loginLegalAgree.readAgreed()) {
      loginLegalAgree.writeAgreed(true)
    }
    void mpPrivacyAuthorize.queryNeedAuthorization().then((needPrivacy) => {
      if (needPrivacy) {
        this.setData({
          err: '',
          showWxAuthSheet: true,
          wxAuthStep: 'privacy',
          wxNickInputFocus: false,
          wxNickInputVisible: true,
          pendingWorkId: workId,
          wxNickName: '',
          wxAvatarUrl: '',
        })
        return
      }
      this._openWxAvatarStep(workId)
    })
  },

  async finishWxAuthAndLogin() {
    if (this.data.loading) return
    const wxProfileDisplay = require('../../utils/wxProfileDisplay.js')
    const workId = this.data.pendingWorkId
    if (!workId) {
      this.onCloseWxAuthSheet()
      return
    }
    const nickFromState = String(this.data.wxNickName || '').trim()
    let nick = nickFromState
    if (!nick) {
      nick = await readWxNickInput(this)
      if (nick) this.setData({ wxNickName: nick })
    }
    let avatar = String(this.data.wxAvatarUrl || '').trim()
    if (!avatar) {
      wx.showToast({ title: '请先授权微信头像', icon: 'none' })
      this.setData({ wxAuthStep: 'avatar' })
      return
    }
    if (!nick || wxProfileDisplay.isPlaceholderWxNick(nick)) {
      wx.showToast({ title: '请选用微信昵称', icon: 'none' })
      this.setData({ wxAuthStep: 'nick' })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const wxLoginCode = new Promise((resolve, reject) => {
        wx.login({ success: (r) => resolve(r.code || ''), fail: reject })
      })
      const [persistedAvatar, code] = await Promise.all([
        wxProfileDisplay.persistWxAvatarUrl(avatar),
        wxLoginCode,
      ])
      avatar = persistedAvatar
      this.setData({ wxAvatarUrl: avatar })
      const data = await auth.wxLogin({
        wxNickName: nick,
        wxAvatarUrl: avatar,
        code,
      })
      const account = (data && data.account) || auth.readAccount()
      await applyLoginIdentity(data)
      await wxProfileDisplay.applyWxProfileAfterLogin(nick, avatar, {
        alreadyPersisted: true,
        skipRemote: true,
      })
      this.setData({ showWxAuthSheet: false, pendingWorkId: '', pendingWorkIdForBind: workId })
      if (data.isNew || auth.needsPhoneBind(account)) {
        wx.redirectTo({ url: '/pages/subpack-signup/signup/signup?from=wx' })
        return
      }
      resumeOrNavigateAfterLogin(this)
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      let hint = msg
      if (msg.indexOf('wx_not_configured') >= 0) {
        hint = '登录暂时失败，请稍后再试'
      } else if (/invalid_phone_code|wx_phone_failed/i.test(msg)) {
        hint = '未能读取手机号，请再点一次「手机号快捷登录」'
      } else if (/invalid code|wx_code2session/i.test(msg)) {
        hint = '登录码无效或已过期，请再点一次「微信一键登录」重试'
      } else if (api.isNetReset(msg)) {
        hint = '网络不稳定，请稍后重试或删除小程序重新扫码'
      } else if (/admin_not_configured|not_configured/i.test(msg)) {
        hint = '登录暂时失败，请稍后再试'
      }
      this.setData({ err: hint })
    } finally {
      this.setData({ loading: false })
    }
  },

  async onPwdLogin() {
    if (!this.data.legalAgreed) {
      openLegalPrompt(this, 'talent', 'pwd')
      return
    }
    await this.doPwdLogin()
  },

  async doPwdLogin(workId) {
    this.setData({ loading: true, err: '' })
    try {
      const data = await auth.passwordLogin(this.data.loginName.trim(), this.data.password)
      await applyLoginIdentity(data)
      await navigateAfterLogin(this)
    } catch (e) {
      this.setData({ err: e && e.message ? e.message : '登录失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async onSendSmsLoginCode() {
    const err = mpPhoneAuth.validatePhoneAccount(this.data.smsPhone)
    if (err) {
      this.setData({ err })
      return
    }
    this.setData({ smsSending: true, err: '' })
    try {
      await auth.sendRegisterSms(this.data.smsPhone)
      wx.showToast({ title: '验证码已发送', icon: 'none' })
      this.setData({ smsCooldown: 60 })
      const tick = setInterval(() => {
        const n = this.data.smsCooldown - 1
        if (n <= 0) {
          clearInterval(tick)
          this.setData({ smsCooldown: 0 })
        } else {
          this.setData({ smsCooldown: n })
        }
      }, 1000)
    } catch (e) {
      this.setData({ err: mpApiErrors.formatMpApiErr(e, '验证码发送失败') })
    } finally {
      this.setData({ smsSending: false })
    }
  },

  async onSmsLogin() {
    if (!this.data.legalAgreed) {
      openLegalPrompt(this, 'talent', 'sms')
      return
    }
    await this.doSmsLogin()
  },

  async doSmsLogin(workId) {
    const phoneErr = mpPhoneAuth.validatePhoneAccount(this.data.smsPhone)
    if (phoneErr) {
      this.setData({ err: phoneErr })
      return
    }
    if (!/^\d{6}$/.test(this.data.smsLoginCode)) {
      this.setData({ err: '请输入 6 位验证码' })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const data = await auth.smsLogin(this.data.smsPhone, this.data.smsLoginCode)
      await applyLoginIdentity(data)
      await navigateAfterLogin(this)
    } catch (e) {
      const msg = e && e.message ? e.message : '登录失败'
      this.setData({
        err: /phone_not_registered/i.test(msg) ? '该手机号尚未注册，请先注册' : msg,
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onBindPhone(e) {
    this.setData({ bindPhone: mpPhoneAuth.sanitizePhoneInput(e.detail.value), err: '' })
  },

  async onConfirmPhoneBind() {
    const phoneErr = mpPhoneAuth.validatePhoneAccount(this.data.bindPhone)
    if (phoneErr) {
      this.setData({ err: phoneErr })
      return
    }
    const phone = mpPhoneAuth.normalizeMpLoginPhone(this.data.bindPhone)
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认手机号',
        content: `请确认绑定手机号为 ${phone}\n绑定后各端共用同一灵祺账号`,
        confirmText: '确认绑定',
        cancelText: '返回修改',
        success: (r) => resolve(!!(r && r.confirm)),
        fail: () => resolve(false),
      })
    })
    if (!confirmed) return
    const workId = this.data.pendingWorkIdForBind || userProfile.readIdentity()
    if (!workId) return
    this.setData({ loading: true, err: '' })
    try {
      const data = await auth.bindPhoneLogin({
        phone,
        platform: 'wx',
      })
      await applyLoginIdentity(data)
      this.setData({
        showPhoneBindSheet: false,
        bindPhone: '',
        pendingWorkIdForBind: '',
      })
      wx.showToast({ title: '手机号绑定成功', icon: 'success' })
      await navigateAfterLogin(this)
    } catch (e) {
      this.setData({ err: mpApiErrors.formatMpApiErr(e, '绑定失败，请稍后重试') })
    } finally {
      this.setData({ loading: false })
    }
  },
})
