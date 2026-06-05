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
const userProfile = require('../../utils/userProfile.js')
const supplierTeamProfile = require('../../utils/supplierTeamProfile.js')
const switchWorkIdentity = require('../../utils/switchWorkIdentity.js')
const { notifySavedAndBack } = require('../../utils/profileSaveDone.js')
const loginCredPanel = require('../../utils/loginCredentialsPanel.js')
const credHandlers = loginCredPanel.createHandlers(auth)
const accountSessionActions = require('../../utils/accountSessionActions.js')
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
    lingqiShootTeamIdLabel: '',
    lingqiEditTeamIdLabel: '',
    workIdentity: 'talent',
    isSupplier: false,
    supplierProfile: supplierTeamProfile.emptySupplierProfile(),
    entityTypes: supplierTeamProfile.ENTITY_TYPES,
    experienceYears: supplierTeamProfile.EXPERIENCE_YEARS,
    dailyCapacity: supplierTeamProfile.DAILY_CAPACITY,
    shootTypes: supplierTeamProfile.SHOOT_TYPES,
    shootEquipment: supplierTeamProfile.SHOOT_EQUIPMENT,
    editTypes: supplierTeamProfile.EDIT_TYPES,
    editStyles: supplierTeamProfile.EDIT_STYLES,
    editSoftware: supplierTeamProfile.EDIT_SOFTWARE,
    categoryTagGrid: [],
    shootTypeGrid: [],
    equipmentGrid: [],
    editTypeGrid: [],
    editStyleGrid: [],
    softwareGrid: [],
    entityTypeIndex: 0,
    experienceIndex: 0,
    dailyCapacityIndex: 0,
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
  syncSupplierUi(profile) {
    const p = supplierTeamProfile.normalizeSupplierProfile(profile)
    this.setData({
      supplierProfile: p,
      categoryTagGrid: supplierTeamProfile.buildCategoryTagGrid(p.categoryTags),
      shootTypeGrid: supplierTeamProfile.buildMultiGrid(supplierTeamProfile.SHOOT_TYPES, p.shootTypes),
      equipmentGrid: supplierTeamProfile.buildMultiGrid(supplierTeamProfile.SHOOT_EQUIPMENT, p.equipment),
      editTypeGrid: supplierTeamProfile.buildMultiGrid(supplierTeamProfile.EDIT_TYPES, p.editTypes),
      editStyleGrid: supplierTeamProfile.buildMultiGrid(supplierTeamProfile.EDIT_STYLES, p.editStyles),
      softwareGrid: supplierTeamProfile.buildMultiGrid(supplierTeamProfile.EDIT_SOFTWARE, p.software),
      entityTypeIndex: Math.max(
        0,
        supplierTeamProfile.ENTITY_TYPES.findIndex((e) => e.id === p.entityType),
      ),
      experienceIndex: Math.max(0, supplierTeamProfile.EXPERIENCE_YEARS.indexOf(p.experienceYears)),
      dailyCapacityIndex: Math.max(0, supplierTeamProfile.DAILY_CAPACITY.indexOf(p.dailyCapacity)),
    })
  },
  onLoad(options) {
    const edit = !options || options.edit !== '0'
    const workIdentity = userProfile.readIdentity()
    const isSupplier = workIdentity === 'shoot' || workIdentity === 'edit'
    const cur = readMember()
    const profiles = cur?.platformProfiles || talentPlatforms.emptyAllProfiles()
    let douyinLevelIndex = 0
    const dy = profiles.douyin
    if (dy && dy.douyinSalesLevel) {
      douyinLevelIndex = Math.max(0, DOUYIN_LEVELS.indexOf(dy.douyinSalesLevel))
    }
    const region = setupRegionState(cur?.province, cur?.city)
    const supplierProf = supplierTeamProfile.normalizeSupplierProfile(cur?.supplierProfile)
    const patch = {
      ...region,
      editMode: edit,
      workIdentity,
      isSupplier,
      supplierProfile: supplierProf,
      platformProfiles: profiles,
      platformSections: talentPlatforms.uiSections(profiles, douyinLevelIndex),
      douyinLevelIndex,
    }
    const acct = auth.readAccount()
    if (acct) accountMemberSync.syncTalentMemberFromAccount(acct)
    const talentId = (acct && acct.lingqiTalentId) || (cur && cur.lingqiTalentId) || ''
    if (talentId) patch.lingqiTalentIdLabel = lingqiIdentity.formatTalentIdLabel(talentId)
    if (cur?.lingqiShootTeamId) {
      patch.lingqiShootTeamIdLabel = lingqiIdentity.formatShootTeamIdLabel(cur.lingqiShootTeamId)
    }
    if (cur?.lingqiEditTeamId) {
      patch.lingqiEditTeamIdLabel = lingqiIdentity.formatEditTeamIdLabel(cur.lingqiEditTeamId)
    }
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
    if (isSupplier) this.syncSupplierUi(supplierProf)
  },
  onSupplierField(e) {
    const k = e.currentTarget.dataset.k
    if (!k) return
    const supplierProfile = { ...this.data.supplierProfile, [k]: e.detail.value }
    this.setData({ supplierProfile })
  },
  onSupplierSwitch(e) {
    const k = e.currentTarget.dataset.k
    if (!k) return
    this.setData({ supplierProfile: { ...this.data.supplierProfile, [k]: !!e.detail.value } })
  },
  onEntityTypeChange(e) {
    const i = Number(e.detail.value)
    const item = supplierTeamProfile.ENTITY_TYPES[i]
    if (!item) return
    this.setData({
      entityTypeIndex: i,
      supplierProfile: { ...this.data.supplierProfile, entityType: item.id },
    })
  },
  onExperienceChange(e) {
    const i = Number(e.detail.value)
    const val = supplierTeamProfile.EXPERIENCE_YEARS[i] || ''
    this.setData({
      experienceIndex: i,
      supplierProfile: { ...this.data.supplierProfile, experienceYears: val },
    })
  },
  onDailyCapacityChange(e) {
    const i = Number(e.detail.value)
    const val = supplierTeamProfile.DAILY_CAPACITY[i] || ''
    this.setData({
      dailyCapacityIndex: i,
      supplierProfile: { ...this.data.supplierProfile, dailyCapacity: val },
    })
  },
  onCategoryTagTap(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const tags = [...(this.data.supplierProfile.categoryTags || [])]
    const idx = tags.indexOf(name)
    if (idx >= 0) tags.splice(idx, 1)
    else if (tags.length < 3) tags.push(name)
    else {
      wx.showToast({ title: '品类标签最多3个', icon: 'none' })
      return
    }
    const supplierProfile = { ...this.data.supplierProfile, categoryTags: tags }
    this.setData({
      supplierProfile,
      categoryTagGrid: supplierTeamProfile.buildCategoryTagGrid(tags),
    })
  },
  onSupplierMultiTap(e) {
    const field = e.currentTarget.dataset.field
    const name = e.currentTarget.dataset.name
    if (!field || !name) return
    const cur = Array.isArray(this.data.supplierProfile[field]) ? [...this.data.supplierProfile[field]] : []
    const idx = cur.indexOf(name)
    if (idx >= 0) cur.splice(idx, 1)
    else cur.push(name)
    const supplierProfile = { ...this.data.supplierProfile, [field]: cur }
    const gridKey =
      field === 'shootTypes'
        ? 'shootTypeGrid'
        : field === 'equipment'
          ? 'equipmentGrid'
          : field === 'editTypes'
            ? 'editTypeGrid'
            : field === 'editStyles'
              ? 'editStyleGrid'
              : 'softwareGrid'
    const options =
      field === 'shootTypes'
        ? supplierTeamProfile.SHOOT_TYPES
        : field === 'equipment'
          ? supplierTeamProfile.SHOOT_EQUIPMENT
          : field === 'editTypes'
            ? supplierTeamProfile.EDIT_TYPES
            : field === 'editStyles'
              ? supplierTeamProfile.EDIT_STYLES
              : supplierTeamProfile.EDIT_SOFTWARE
    this.setData({
      supplierProfile,
      [gridKey]: supplierTeamProfile.buildMultiGrid(options, cur),
    })
  },
  onChooseAvatar(e) {
    const url = e.detail?.avatarUrl
    if (url) this.setData({ wxAvatarUrl: url })
  },
  onNicknameInput(e) {
    const nick = e.detail.value || ''
    this.setData({ wxNickName: nick })
  },
  onSwitchAccount() {
    accountSessionActions.switchAccount()
  },
  onLogoutAccount() {
    accountSessionActions.logout()
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
    if (this.data.isSupplier) {
      return supplierTeamProfile.validateSupplierProfile(this.data.workIdentity, this.data.supplierProfile, {
        contact: this.data.contact,
        wechatId: this.data.wechatId,
        alipayAccount: this.data.alipayAccount,
        province: this.data.province,
        city: this.data.city,
      })
    }
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
    const workId = this.data.workIdentity || 'talent'
    const member = {
      id: (acct && acct.registryMemberId) || (prev && prev.id) || `MTM-${Date.now()}`,
      lingqiTalentId: (acct && acct.lingqiTalentId) || (prev && prev.lingqiTalentId) || '',
      lingqiShootTeamId: (prev && prev.lingqiShootTeamId) || (acct && acct.lingqiShootTeamId) || '',
      lingqiEditTeamId: (prev && prev.lingqiEditTeamId) || (acct && acct.lingqiEditTeamId) || '',
      workIdentity: this.data.isSupplier ? workId : 'talent',
      memberType: this.data.isSupplier ? 'douyin' : talentPlatforms.inferLegacyMemberType(profiles),
      wxNickName: String(this.data.wxNickName || '').trim(),
      wxAvatarUrl: String(this.data.wxAvatarUrl || '').trim(),
      wxOpenId: String((acct && acct.openid) || this.data.wxOpenId || (prev && prev.wxOpenId) || '').trim(),
      contact: String(this.data.contact || '').trim(),
      wechatId: String(this.data.wechatId || '').trim(),
      alipayAccount: String(this.data.alipayAccount || '').trim(),
      province: String(this.data.province || '').trim(),
      city: String(this.data.city || '').trim(),
      platformProfiles: profiles,
      supplierProfile: supplierTeamProfile.normalizeSupplierProfile(this.data.supplierProfile),
      registeredAt: (prev && prev.registeredAt) || new Date().toLocaleString('zh-CN', { hour12: false }),
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    }
    if (!this.data.isSupplier) {
      if (profiles.douyin?.enabled) member.douyin = buildServerProfile('抖音', profiles.douyin)
      if (profiles.xiaohongshu?.enabled) {
        member.xiaohongshu = buildServerProfile('小红书', profiles.xiaohongshu)
      }
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
          if (this.data.isSupplier && auth.isLoggedIn()) {
            await auth.ensureIdentity('talent', workId)
          }
          const payload = this.data.isSupplier
            ? supplierTeamProfile.memberToRegistryPayload(member, workId)
            : member
          const reg = await ops.registerTalentMember(payload)
          if (reg && reg.lingqiTalentId) member.lingqiTalentId = reg.lingqiTalentId
          if (reg && reg.lingqiShootTeamId) member.lingqiShootTeamId = reg.lingqiShootTeamId
          if (reg && reg.lingqiEditTeamId) member.lingqiEditTeamId = reg.lingqiEditTeamId
          if (reg && reg.id) member.id = reg.id
          writeMember(member)
          if (auth.isLoggedIn()) {
            switchWorkIdentity.syncLocalProfilesFromAccount(auth.readAccount(), workId)
          }
        } catch (_) {
          cloudWarn = '资料已写入本机，云端同步失败，请稍后重试。'
        }
      }
      this.setData({
        lingqiTalentIdLabel: lingqiIdentity.formatTalentIdLabel(member.lingqiTalentId),
        lingqiShootTeamIdLabel: lingqiIdentity.formatShootTeamIdLabel(member.lingqiShootTeamId),
        lingqiEditTeamIdLabel: lingqiIdentity.formatEditTeamIdLabel(member.lingqiEditTeamId),
      })
      notifySavedAndBack(cloudWarn)
    } finally {
      this.setData({ submitting: false })
    }
  },
})
