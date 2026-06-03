const api = require('../../utils/api.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const lingqiIdentity = require('../../utils/lingqiIdentity.js')
const userProfile = require('../../utils/userProfile.js')
const wxAccount = require('../../utils/wxAccount.js')
const regionPicker = require('../../utils/regionPicker.js')
const { notifySavedAndBack } = require('../../utils/profileSaveDone.js')
const { setupRegionState, onProvincePick, onCityPick, validateRegion } = regionPicker

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
  },
  onShow() {
    const cur = userProfile.readPrProfile()
    const form = normalizeForm(cur)
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
      lingqiPrIdLabel: lingqiIdentity.formatPrIdLabel(form.lingqiPrId),
    })
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
    const wx = wxAccount.readWxAccount()
    const prev = userProfile.readPrProfile()
    const saved = {
      ...f,
      id: (prev && prev.id) || f.id || `MPR-${Date.now()}`,
      lingqiPrId: (prev && prev.lingqiPrId) || f.lingqiPrId || '',
      registeredAt: (prev && prev.registeredAt) || f.registeredAt || new Date().toLocaleString('zh-CN', { hour12: false }),
      companyName: f.accountType === 'company' ? org : '',
      personalName: f.accountType === 'personal' ? org : '',
      province: this.data.province,
      city: this.data.city,
      wxNickName: (wx && wx.wxNickName) || f.wxNickName || '',
      wxAvatarUrl: (wx && wx.wxAvatarUrl) || f.wxAvatarUrl || '',
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    }
    userProfile.writePrProfile(saved)
    let cloudWarn = ''
    if (api.hasApi()) {
      try {
        const prUser = {
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
          wxNickName: saved.wxNickName || '',
          wxAvatarUrl: saved.wxAvatarUrl || '',
          registeredAt: saved.registeredAt || saved.updatedAt,
          updatedAt: saved.updatedAt,
        }
        const reg = await ops.registerPrUser(prUser)
        if (reg && reg.lingqiPrId) {
          saved.lingqiPrId = reg.lingqiPrId
          saved.id = reg.id || saved.id
          userProfile.writePrProfile(saved)
        }
      } catch (_) {
        cloudWarn = '资料已写入本机，云端同步失败，请稍后重试。'
      }
    }
    this.setData({
      form: saved,
      lingqiPrIdLabel: lingqiIdentity.formatPrIdLabel(saved.lingqiPrId),
    })
    notifySavedAndBack(cloudWarn)
  },
})
