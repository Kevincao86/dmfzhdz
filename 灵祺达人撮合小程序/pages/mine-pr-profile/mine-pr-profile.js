const api = require('../../utils/api.js')
const { syncPageIdentity } = require('../../utils/pageIdentityChrome.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const lingqiIdentity = require('../../utils/lingqiIdentity.js')
const userProfile = require('../../utils/userProfile.js')
const wxAccount = require('../../utils/wxAccount.js')
const regionPicker = require('../../utils/regionPicker.js')
const { notifySavedAndBack } = require('../../utils/profileSaveDone.js')
const mpApiErrors = require('../../utils/mpApiErrors.js')
const mpPhoneAuth = require('../../utils/mpPhoneAuth.js')
const auth = require('../../utils/auth.js')
const accountMemberSync = require('../../utils/accountMemberSync.js')
const loginCredPanel = require('../../utils/loginCredentialsPanel.js')
const credHandlers = loginCredPanel.createHandlers(auth)
const accountSessionActions = require('../../utils/accountSessionActions.js')
const { setupRegionState, onProvincePick, onCityPick, validateRegion } = regionPicker
const { validateBasicContactFields } = require('../../utils/basicContactFields.js')

const ACCOUNT_TYPES = [
  { id: 'company', label: '公司（机构）' },
  { id: 'personal', label: '个人' },
]

function normalizeForm(raw) {
  const base = userProfile.emptyPrProfile()
  const form = { ...base, ...(raw || {}) }
  if (!form.accountType) form.accountType = 'company'
  if (form.accountType === 'personal' && !form.personalName && form.contactName) {
    form.personalName = form.contactName
  }
  if (form.city && !form.province) {
    /* 旧数据仅填了城市，保留 */
  }
  return form
}

Page({
  behaviors: [require('../../behaviors/identityTheme')],
  data: {
    form: userProfile.emptyPrProfile(),
    accountTypes: ACCOUNT_TYPES,
    provinces: [],
    cities: [],
    province: '',
    city: '',
    provinceIndex: 0,
    cityIndex: 0,
    orgLabel: '公司/机构名称',
    orgPlaceholder: '请输入公司或机构全称',
    lingqiPrIdLabel: '',
    submitting: false,
    ...loginCredPanel.patchFromAccount(null),
  },
  ...credHandlers,
  async onShow() {
    syncPageIdentity(this)
    if (auth.isLoggedIn()) {
      try {
        await auth.refreshSession()
      } catch (_) {}
    }
    const acct = auth.readAccount()
    const cur = userProfile.readPrProfile()
    const form = normalizeForm(cur)
    if (acct) accountMemberSync.syncPrProfileFromAccount(acct)
    const wx = wxAccount.readWxAccount()
    if (wx) {
      form.wxNickName = form.wxNickName || wx.wxNickName
      form.wxAvatarUrl = form.wxAvatarUrl || wx.wxAvatarUrl
    }
    const region = setupRegionState(form.province, form.city)
    this.setData({
      form,
      ...region,
      orgLabel: form.accountType === 'personal' ? '个人名称' : '公司/机构名称',
      orgPlaceholder: form.accountType === 'personal' ? '请输入您的姓名或昵称' : '请输入公司或机构全称',
      lingqiPrIdLabel: lingqiIdentity.formatPrIdLabel(
        (acct && acct.lingqiPrId) || form.lingqiPrId,
      ),
      ...loginCredPanel.patchFromAccount(acct),
    })
  },
  onSwitchAccount() {
    accountSessionActions.switchAccount()
  },
  onLogoutAccount() {
    accountSessionActions.logout()
  },
  onField(e) {
    const k = e.currentTarget.dataset.k
    if (k) this.setData({ [`form.${k}`]: e.detail.value })
  },
  onChooseAvatar(e) {
    const url = e.detail?.avatarUrl
    if (!url) return
    this.setData({ 'form.wxAvatarUrl': url })
    wxAccount.writeWxAccount({
      wxNickName: this.data.form.wxNickName || wxAccount.readWxAccount()?.wxNickName || '',
      wxAvatarUrl: url,
    })
  },
  onNicknameInput(e) {
    const nick = e.detail.value || ''
    this.setData({ 'form.wxNickName': nick })
  },
  onPickAccountType(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.form.accountType) return
    const form = { ...this.data.form, accountType: id }
    if (id === 'personal') form.companyName = ''
    else form.personalName = ''
    this.setData({
      form,
      orgLabel: id === 'personal' ? '个人名称' : '公司/机构名称',
      orgPlaceholder: id === 'personal' ? '请输入您的姓名或昵称' : '请输入公司或机构全称',
    })
  },
  onProvinceChange(e) {
    onProvincePick(this, e)
    this.setData({
      'form.province': this.data.province,
      'form.city': this.data.city,
    })
  },
  onCityChange(e) {
    onCityPick(this, e)
    this.setData({ 'form.city': this.data.city })
  },
  async onSave() {
    const f = { ...this.data.form }
    const org =
      f.accountType === 'personal'
        ? String(f.personalName || '').trim()
        : String(f.companyName || '').trim()
    if (!org) {
      wx.showToast({
        title: f.accountType === 'personal' ? '请填写个人名称' : '请填写公司/机构名称',
        icon: 'none',
      })
      return
    }
    const wx = wxAccount.readWxAccount()
    const nick = String(f.wxNickName || (wx && wx.wxNickName) || '').trim()
    const contactErr = validateBasicContactFields({
      wxNickName: nick,
      contactPhone: f.contactPhone,
      wechatId: f.wechatId,
    })
    if (contactErr) {
      wx.showToast({ title: contactErr, icon: 'none' })
      return
    }
    if (!String(f.contactName || '').trim() && f.accountType === 'company') {
      wx.showToast({ title: '请填写联系人', icon: 'none' })
      return
    }
    if (f.accountType === 'personal' && !String(f.contactName || '').trim()) {
      f.contactName = org
    }
    const regionErr = validateRegion(this.data.province, this.data.city)
    if (regionErr) {
      wx.showToast({ title: regionErr, icon: 'none' })
      return
    }
    const prev = userProfile.readPrProfile()
    const acct = auth.readAccount()
    const saved = {
      ...f,
      id: (acct && acct.registryPrId) || (prev && prev.id) || f.id || `MPR-${Date.now()}`,
      lingqiPrId: (acct && acct.lingqiPrId) || (prev && prev.lingqiPrId) || f.lingqiPrId || '',
      wxOpenId: String((acct && acct.openid) || f.wxOpenId || (prev && prev.wxOpenId) || '').trim(),
      registeredAt: (prev && prev.registeredAt) || f.registeredAt || new Date().toLocaleString('zh-CN', { hour12: false }),
      companyName: f.accountType === 'company' ? org : '',
      personalName: f.accountType === 'personal' ? org : '',
      province: this.data.province,
      city: this.data.city,
      wxNickName: (wx && wx.wxNickName) || f.wxNickName || '',
      wxAvatarUrl: (wx && wx.wxAvatarUrl) || f.wxAvatarUrl || '',
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    }
    if (this.data.submitting) return
    this.setData({ submitting: true })
    userProfile.writePrProfile(saved)
    let cloudWarn = ''
    let credNote = ''
    try {
      if (api.hasApi()) {
        try {
          await auth.ensureWxAuthSession({
            role: 'pr',
            wxNickName: saved.wxNickName,
            wxAvatarUrl: saved.wxAvatarUrl,
          })
          const acct0 = auth.readAccount()
          if (acct0) {
            saved.id = String(acct0.registryPrId || saved.id || '').trim() || saved.id
            saved.lingqiPrId = String(acct0.lingqiPrId || saved.lingqiPrId || '').trim()
            saved.wxOpenId = String(acct0.openid || saved.wxOpenId || '').trim()
          }
        } catch (loginErr) {
          cloudWarn = mpApiErrors.formatMpApiErr(loginErr, '请先完成微信登录')
        }
      }
      if (api.hasApi() && auth.isLoggedIn() && !cloudWarn) {
        try {
          const prUser = {
            id: saved.id || `MPR-${Date.now()}`,
            lingqiPrId: saved.lingqiPrId || '',
            wxOpenId: saved.wxOpenId || '',
            accountType: saved.accountType,
            companyName: saved.companyName || '',
            personalName: saved.personalName || '',
            contactName: saved.contactName || '',
            contactPhone: saved.contactPhone || '',
            wechatId: saved.wechatId || '',
            province: saved.province || '',
            city: saved.city || '',
            intro: saved.intro || '',
            wxNickName: saved.wxNickName || '',
            wxAvatarUrl: saved.wxAvatarUrl || '',
            registeredAt: saved.registeredAt || saved.updatedAt,
            updatedAt: saved.updatedAt,
          }
          const reg = await ops.registerPrUser(prUser)
          if (reg && reg.lingqiPrId) {
            saved.lingqiPrId = reg.lingqiPrId
            saved.id = reg.id || saved.id
          }
          userProfile.writePrProfile(saved)
          try {
            await auth.refreshSession()
            accountMemberSync.syncPrProfileFromAccount(auth.readAccount())
            const acct1 = auth.readAccount()
            if (acct1?.lingqiPrId) saved.lingqiPrId = acct1.lingqiPrId
            if (acct1?.registryPrId) saved.id = acct1.registryPrId
            userProfile.writePrProfile(saved)
          } catch (_) {}
        } catch (cloudErr) {
          console.warn('[pr-profile] cloud sync failed', cloudErr)
          cloudWarn = `资料已写入本机，云端同步失败：${mpApiErrors.formatMpApiErr(cloudErr, '请稍后重试')}`
        }
      }
      const credPhone = mpPhoneAuth.normalizeMpLoginPhone(
        this.data.modalLoginName || saved.contactPhone || '',
      )
      const credPwd = String(this.data.modalPassword || '')
      const wantCred =
        auth.isLoggedIn() &&
        credPhone &&
        (credPwd.length >= 6 || this.data.wantWebLogin || this.data.showCredModal)
      if (wantCred && credPwd.length >= 6) {
        try {
          await auth.setLoginCredentials(credPhone, credPwd)
          await auth.refreshSession()
          accountMemberSync.syncPrProfileFromAccount(auth.readAccount())
          credNote = '账号密码已保存'
          this.setData({
            ...loginCredPanel.patchFromAccount(auth.readAccount()),
            showCredModal: false,
            wantWebLogin: false,
            modalPassword: '',
          })
        } catch (credErr) {
          const mapped = loginCredPanel.mapCredError(credErr)
          const acct2 = auth.readAccount()
          if (/已被注册/.test(mapped) && acct2 && String(acct2.loginName || '').trim() === credPhone) {
            credNote = '账号密码已保存'
          } else {
            credNote = mapped
          }
        }
      }
      this.setData({
        form: saved,
        lingqiPrIdLabel: lingqiIdentity.formatPrIdLabel(saved.lingqiPrId),
      })
      let summary = ''
      if (!cloudWarn) summary = '资料已保存并同步云端'
      else summary = cloudWarn
      if (credNote) summary = summary ? `${summary}；${credNote}` : credNote
      notifySavedAndBack(summary || '您的资料已保存。')
    } finally {
      this.setData({ submitting: false })
    }
  },
})
