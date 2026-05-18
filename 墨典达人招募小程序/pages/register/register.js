const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const memberStore = require('../../utils/talentMember.js')
const platformForm = require('../../utils/platformForm.js')
const { labels } = require('../../utils/platformLabels.js')

const { MEMBER_TYPES, emptyPlatformProfile, writeMember } = memberStore
const { DOUYIN_LEVELS, validatePlatformProfile } = platformForm
const regionPicker = require('../../utils/regionPicker.js')
const { setupRegionState, onProvincePick, onCityPick, validateRegion } = regionPicker

function parseFollowers(raw) {
  return Number.parseInt(String(raw || '').replace(/,/g, ''), 10)
}

function buildServerProfile(platform, profile) {
  const followers = parseFollowers(profile.followers)
  const base = {
    platformAccount: String(profile.platformAccount || '').trim(),
    platformNickname: String(profile.platformNickname || '').trim(),
    profileLink: String(profile.profileLink || '').trim(),
    followers: Number.isFinite(followers) ? Math.max(0, followers) : 0,
    quotePrice: String(profile.quotePrice || '').trim(),
    alipayAccount: String(profile.alipayAccount || '').trim(),
  }
  if (platform === '抖音') {
    base.douyinSalesLevel = String(profile.douyinSalesLevel || '').trim() || undefined
  }
  return base
}

Page({
  data: {
    wxNickName: '',
    wxAvatarUrl: '',
    wxOpenId: '',
    memberType: '',
    memberTypeOptions: Object.values(MEMBER_TYPES),
    contact: '',
    wechatId: '',
    douyin: emptyPlatformProfile(),
    xiaohongshu: emptyPlatformProfile(),
    douyinLabels: labels('抖音'),
    xhsLabels: labels('小红书'),
    douyinLevels: DOUYIN_LEVELS,
    douyinLevelIndex: 0,
    submitting: false,
    editMode: false,
    provinces: [],
    cities: [],
    province: '',
    city: '',
    provinceIndex: 0,
    cityIndex: 0,
  },
  onLoad(options) {
    const edit = options && options.edit === '1'
    const cur = memberStore.readMember()
    const region = setupRegionState(cur?.province, cur?.city)
    const patch = { ...region, editMode: edit }
    if (cur) {
      Object.assign(patch, {
        wxNickName: cur.wxNickName || '',
        wxAvatarUrl: cur.wxAvatarUrl || '',
        wxOpenId: cur.wxOpenId || '',
        memberType: cur.memberType || '',
        contact: cur.contact || '',
        wechatId: cur.wechatId || '',
        douyin: { ...emptyPlatformProfile(), ...(cur.douyin || {}) },
        xiaohongshu: { ...emptyPlatformProfile(), ...(cur.xiaohongshu || {}) },
        douyinLevelIndex: Math.max(
          0,
          DOUYIN_LEVELS.indexOf((cur.douyin && cur.douyin.douyinSalesLevel) || ''),
        ),
      })
    }
    this.setData(patch)
  },
  onProvinceChange(e) {
    onProvincePick(this, e)
  },
  onCityChange(e) {
    onCityPick(this, e)
  },
  onGetWxProfile() {
    wx.getUserProfile({
      desc: '用于注册墨典达人会员并展示头像昵称',
      success: (res) => {
        const u = res.userInfo || {}
        this.setData({
          wxNickName: u.nickName || '',
          wxAvatarUrl: u.avatarUrl || '',
        })
        if (!this.data.wechatId && u.nickName) {
          this.setData({ wechatId: u.nickName })
        }
      },
      fail: () => {
        wx.showToast({ title: '需授权微信昵称头像', icon: 'none' })
      },
    })
  },
  onPickMemberType(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({ memberType: id })
  },
  onCommonField(e) {
    const k = e.currentTarget.dataset.k
    if (k) this.setData({ [k]: e.detail.value })
  },
  onPlatformField(e) {
    const platform = e.currentTarget.dataset.platform
    const k = e.currentTarget.dataset.k
    if (!platform || !k) return
    const key = platform === 'xiaohongshu' ? 'xiaohongshu' : 'douyin'
    this.setData({ [key]: { ...this.data[key], [k]: e.detail.value } })
  },
  onDouyinLevelChange(e) {
    const i = Number(e.detail.value)
    this.setData({
      douyinLevelIndex: i,
      douyin: { ...this.data.douyin, douyinSalesLevel: DOUYIN_LEVELS[i] || '' },
    })
  },
  needsDouyin() {
    const t = this.data.memberType
    return t === 'douyin' || t === 'both'
  },
  needsXhs() {
    const t = this.data.memberType
    return t === 'xiaohongshu' || t === 'both'
  },
  validateAll() {
    if (!String(this.data.wxNickName || '').trim()) return '请先授权获取微信昵称与头像'
    if (!this.data.memberType) return '请选择达人类型'
    if (!String(this.data.contact || '').trim()) return '请填写联系方式'
    if (!String(this.data.wechatId || '').trim()) return '请填写微信号'
    const regionErr = validateRegion(this.data.province, this.data.city)
    if (regionErr) return regionErr
    if (this.needsDouyin()) {
      const err = validatePlatformProfile('抖音', this.data.douyin)
      if (err) return err
    }
    if (this.needsXhs()) {
      const err = validatePlatformProfile('小红书', this.data.xiaohongshu)
      if (err) return err
    }
    return null
  },
  async onSubmit() {
    const errMsg = this.validateAll()
    if (errMsg) {
      wx.showToast({ title: errMsg, icon: 'none' })
      return
    }
    const memberType = this.data.memberType
    const member = {
      id: `MTM-${Date.now()}`,
      memberType,
      wxNickName: String(this.data.wxNickName || '').trim(),
      wxAvatarUrl: String(this.data.wxAvatarUrl || '').trim(),
      wxOpenId: String(this.data.wxOpenId || '').trim(),
      contact: String(this.data.contact || '').trim(),
      wechatId: String(this.data.wechatId || '').trim(),
      province: String(this.data.province || '').trim(),
      city: String(this.data.city || '').trim(),
      registeredAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    }
    if (memberType === 'douyin' || memberType === 'both') {
      member.douyin = buildServerProfile('抖音', this.data.douyin)
    }
    if (memberType === 'xiaohongshu' || memberType === 'both') {
      member.xiaohongshu = buildServerProfile('小红书', this.data.xiaohongshu)
    }

    this.setData({ submitting: true })
    try {
      writeMember(member)
      if (merchant.hasMerchantApi()) {
        try {
          await ops.registerTalentMember(member)
        } catch (e) {
          wx.showToast({
            title: '已保存本机，云端同步失败',
            icon: 'none',
            duration: 2500,
          })
        }
      }
      wx.showToast({ title: '注册成功', icon: 'success' })
      setTimeout(() => wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/index/index' }) }), 500)
    } finally {
      this.setData({ submitting: false })
    }
  },
})
