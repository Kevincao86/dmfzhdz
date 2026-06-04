const api = require('../../utils/api.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const memberStore = require('../../utils/talentMember.js')
const platformForm = require('../../utils/platformForm.js')
const talentPlatforms = require('../../utils/talentPlatformProfiles.js')
const regionPicker = require('../../utils/regionPicker.js')
const talentChat = require('../../utils/talentChat.js')
const participant = require('../../utils/participant.js')
const wxAccount = require('../../utils/wxAccount.js')
const auth = require('../../utils/auth.js')
const { setupRegionState, onProvincePick, onCityPick, validateRegion } = regionPicker

const { DOUYIN_LEVELS, validatePlatformProfile } = platformForm
const lingqiIdentity = require('../../utils/lingqiIdentity.js')
const accountMemberSync = require('../../utils/accountMemberSync.js')
const { notifySavedAndBack } = require('../../utils/profileSaveDone.js')
const loginCredPanel = require('../../utils/loginCredentialsPanel.js')
const credHandlers = loginCredPanel.createHandlers(auth)
const { writeMember, readMember } = memberStore

function parseFollowers(raw) {
  return Number.parseInt(String(raw || '').replace(/,/g, ''), 10)
}

function buildServerProfile(platformName, profile) {
  const followers = parseFollowers(profile.followers)
  const tags = Array.isArray(profile.accountTags) ? profile.accountTags : []
  const base = {
    platformAccount: String(profile.platformAccount || '').trim(),
    platformNickname: String(profile.platformNickname || '').trim(),
    profileLink: String(profile.profileLink || '').trim(),
    followers: Number.isFinite(followers) ? Math.max(0, followers) : 0,
    quotePrice: String(profile.quotePrice || '').trim(),
    accountTags: tags,
    talentGrade: String(profile.talentGrade || '').trim() || undefined,
  }
  if (platformName === '抖音') {
    base.douyinSalesLevel = String(profile.douyinSalesLevel || '').trim() || undefined
  }
  return base
}

function syncUiFromProfiles(page, profiles, douyinLevelIndex) {
  page.setData({
    platformProfiles: profiles,
    platformSections: talentPlatforms.uiSections(profiles, douyinLevelIndex),
    douyinLevelIndex: douyinLevelIndex || 0,
  })
}

Page({
  data: {
    wxNickName: '',
    wxAvatarUrl: '',
    wxOpenId: '',
    contact: '',
    wechatId: '',
    alipayAccount: '',
    platformProfiles: talentPlatforms.emptyAllProfiles(),
    platformSections: [],
    douyinLevels: DOUYIN_LEVELS,
    douyinLevelIndex: 0,
    submitting: false,
    editMode: true,
    provinces: [],
    cities: [],
    province: '',
    city: '',
    provinceIndex: 0,
    cityIndex: 0,
    lingqiTalentIdLabel: '',
    ...loginCredPanel.patchFromAccount(null),
  },
  ...credHandlers,
  async onShow() {
    if (auth.isLoggedIn()) {
      try {
        await auth.refreshSession()
      } catch (_) {}
    }
    const acct = auth.readAccount()
    if (acct) {
      accountMemberSync.syncTalentMemberFromAccount(acct)
      const patch = loginCredPanel.patchFromAccount(acct)
      if (acct.lingqiTalentId) {
        patch.lingqiTalentIdLabel = lingqiIdentity.formatTalentIdLabel(acct.lingqiTalentId)
      }
      this.setData(patch)
    }
  },
  onLoad(options) {
    const edit = !options || options.edit !== '0'
    const cur = readMember()
    const profiles = cur?.platformProfiles || talentPlatforms.emptyAllProfiles()
    let douyinLevelIndex = 0
    const dy = profiles.douyin
    if (dy && dy.douyinSalesLevel) {
      douyinLevelIndex = Math.max(0, DOUYIN_LEVELS.indexOf(dy.douyinSalesLevel))
    }
    const region = setupRegionState(cur?.province, cur?.city)
    const patch = {
      ...region,
      editMode: edit,
      platformProfiles: profiles,
      platformSections: talentPlatforms.uiSections(profiles, douyinLevelIndex),
      douyinLevelIndex,
    }
    const acct = auth.readAccount()
    if (acct) accountMemberSync.syncTalentMemberFromAccount(acct)
    const talentId = (acct && acct.lingqiTalentId) || (cur && cur.lingqiTalentId) || ''
    if (talentId) patch.lingqiTalentIdLabel = lingqiIdentity.formatTalentIdLabel(talentId)
    Object.assign(patch, loginCredPanel.patchFromAccount(acct))
    if (cur) {
      Object.assign(patch, {
        wxNickName: cur.wxNickName || '',
        wxAvatarUrl: cur.wxAvatarUrl || '',
        wxOpenId: cur.wxOpenId || '',
        contact: cur.contact || '',
        wechatId: cur.wechatId || '',
        alipayAccount: cur.alipayAccount || '',
        platformProfiles: profiles,
        platformSections: talentPlatforms.uiSections(profiles, douyinLevelIndex),
      })
    } else if (acct) {
      Object.assign(patch, {
        wxNickName: acct.wxNickName || '',
        wxAvatarUrl: acct.wxAvatarUrl || '',
      })
    }
    const wx = wxAccount.readWxAccount()
    if (wx) {
      Object.assign(patch, {
        wxNickName: patch.wxNickName || wx.wxNickName || '',
        wxAvatarUrl: patch.wxAvatarUrl || wx.wxAvatarUrl || '',
        wxOpenId: patch.wxOpenId || wx.wxOpenId || '',
      })
    }
    this.setData(patch)
  },
  onChooseAvatar(e) {
    const url = e.detail?.avatarUrl
    if (url) this.setData({ wxAvatarUrl: url })
  },
  onNicknameInput(e) {
    const nick = e.detail.value || ''
    this.setData({ wxNickName: nick })
  },
  onProvinceChange(e) {
    onProvincePick(this, e)
  },
  onCityChange(e) {
    onCityPick(this, e)
  },
  onGetWxProfile() {
    wx.getUserProfile({
      desc: '用于展示头像昵称',
      success: (res) => {
        const u = res.userInfo || {}
        this.setData({ wxNickName: u.nickName || '', wxAvatarUrl: u.avatarUrl || '' })
        if (u.nickName) {
          wxAccount.writeWxAccount({ wxNickName: u.nickName, wxAvatarUrl: u.avatarUrl || '' })
        }
      },
      fail: () => wx.showToast({ title: '请使用头像/昵称填写', icon: 'none' }),
    })
  },
  onCommonField(e) {
    const k = e.currentTarget.dataset.k
    if (k) this.setData({ [k]: e.detail.value })
  },
  onTogglePlatformEnable(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const profiles = { ...this.data.platformProfiles }
    const cur = { ...talentPlatforms.emptyProfile(), ...(profiles[id] || {}) }
    cur.enabled = !!e.detail.value
    profiles[id] = cur
    syncUiFromProfiles(this, profiles, this.data.douyinLevelIndex)
  },
  onPlatformField(e) {
    const id = e.currentTarget.dataset.id
    const k = e.currentTarget.dataset.k
    if (!id || !k) return
    const profiles = { ...this.data.platformProfiles }
    profiles[id] = { ...talentPlatforms.emptyProfile(), ...(profiles[id] || {}), [k]: e.detail.value }
    syncUiFromProfiles(this, profiles, this.data.douyinLevelIndex)
  },
  onAccountTagTap(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    if (!id || !name) return
    const profiles = { ...this.data.platformProfiles }
    const prof = { ...talentPlatforms.emptyProfile(), ...(profiles[id] || {}) }
    const tags = Array.isArray(prof.accountTags) ? [...prof.accountTags] : []
    const idx = tags.indexOf(name)
    if (idx >= 0) tags.splice(idx, 1)
    else tags.push(name)
    prof.accountTags = tags
    profiles[id] = prof
    syncUiFromProfiles(this, profiles, this.data.douyinLevelIndex)
  },
  onDouyinLevelChange(e) {
    const i = Number(e.detail.value)
    const profiles = { ...this.data.platformProfiles }
    const dy = { ...talentPlatforms.emptyProfile(), ...(profiles.douyin || {}), enabled: true }
    dy.douyinSalesLevel = DOUYIN_LEVELS[i] || ''
    profiles.douyin = dy
    syncUiFromProfiles(this, profiles, i)
  },
  validateAll() {
    if (!String(this.data.wxNickName || '').trim()) return '请填写微信昵称'
    if (!String(this.data.contact || '').trim()) return '请填写联系方式'
    if (!String(this.data.wechatId || '').trim()) return '请填写微信号'
    if (!String(this.data.alipayAccount || '').trim()) return '请填写支付宝账号'
    const regionErr = validateRegion(this.data.province, this.data.city)
    if (regionErr) return regionErr
    const profiles = this.data.platformProfiles || {}
    const enabled = talentPlatforms.TALENT_PLATFORMS.filter((p) => profiles[p.id]?.enabled)
    if (!enabled.length) return '请至少开启并填写一个平台资料'
    for (const p of enabled) {
      const plat = talentPlatforms.TALENT_PLATFORMS.find((x) => x.id === p.id)
      const err = validatePlatformProfile(plat.name, profiles[p.id])
      if (err) return `${plat.name}：${err}`
    }
    return null
  },
  async onSubmit() {
    const errMsg = this.validateAll()
    if (errMsg) {
      wx.showToast({ title: errMsg, icon: 'none' })
      return
    }
    const profiles = this.data.platformProfiles
    const prev = readMember()
    const acct = auth.readAccount()
    const member = {
      id: (acct && acct.registryMemberId) || (prev && prev.id) || `MTM-${Date.now()}`,
      lingqiTalentId: (acct && acct.lingqiTalentId) || (prev && prev.lingqiTalentId) || '',
      memberType: talentPlatforms.inferLegacyMemberType(profiles),
      wxNickName: String(this.data.wxNickName || '').trim(),
      wxAvatarUrl: String(this.data.wxAvatarUrl || '').trim(),
      wxOpenId: String((acct && acct.openid) || this.data.wxOpenId || (prev && prev.wxOpenId) || '').trim(),
      contact: String(this.data.contact || '').trim(),
      wechatId: String(this.data.wechatId || '').trim(),
      alipayAccount: String(this.data.alipayAccount || '').trim(),
      province: String(this.data.province || '').trim(),
      city: String(this.data.city || '').trim(),
      platformProfiles: profiles,
      registeredAt: (prev && prev.registeredAt) || new Date().toLocaleString('zh-CN', { hour12: false }),
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    }
    if (profiles.douyin?.enabled) member.douyin = buildServerProfile('抖音', profiles.douyin)
    if (profiles.xiaohongshu?.enabled) {
      member.xiaohongshu = buildServerProfile('小红书', profiles.xiaohongshu)
    }

    this.setData({ submitting: true })
    try {
      try {
        await wxAccount.completeWxLogin({
          wxNickName: member.wxNickName,
          wxAvatarUrl: member.wxAvatarUrl,
        })
      } catch (_) {
        wxAccount.writeWxAccount({
          wxNickName: member.wxNickName,
          wxAvatarUrl: member.wxAvatarUrl,
        })
      }
      writeMember(member)
      let cloudWarn = ''
      if (talentChat.canChat()) {
        try {
          const part = participant.getCurrentParticipant()
          part.memberSnapshot = member
          part.participantKey = participant.talentParticipantKey(member)
          part.displayName = member.wxNickName || '达人'
          part.avatarUrl = member.wxAvatarUrl || ''
          await talentChat.syncProfile(part)
        } catch (_) {}
      }
      if (api.hasApi()) {
        try {
          const reg = await ops.registerTalentMember(member)
          if (reg && reg.lingqiTalentId) {
            member.lingqiTalentId = reg.lingqiTalentId
          }
          if (reg && reg.id) member.id = reg.id
          writeMember(member)
        } catch (_) {
          cloudWarn = '资料已写入本机，云端同步失败，请稍后重试。'
        }
      }
      this.setData({
        lingqiTalentIdLabel: lingqiIdentity.formatTalentIdLabel(member.lingqiTalentId),
      })
      notifySavedAndBack(cloudWarn)
    } finally {
      this.setData({ submitting: false })
    }
  },
})
