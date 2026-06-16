const api = require('../../utils/api.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const memberStore = require('../../utils/talentMember.js')
const platformForm = require('../../utils/platformForm.js')
const talentPlatforms = require('../../utils/talentPlatformProfiles.js')
const regionPicker = require('../../utils/regionPicker.js')
const regionAutoLocate = require('../../utils/regionAutoLocate.js')
const talentChat = require('../../utils/talentChat.js')
const participant = require('../../utils/participant.js')
const wxAccount = require('../../utils/wxAccount.js')
const auth = require('../../utils/auth.js')
const { setupRegionState, onProvincePick, onCityPick, validateRegion, applyRegionToPage } = regionPicker

const { DOUYIN_LEVELS, validatePlatformProfile } = platformForm
const identityIdLabels = require('../../utils/identityIdLabels.js')
const accountMemberSync = require('../../utils/accountMemberSync.js')
const userProfile = require('../../utils/userProfile.js')
const supplierTeamProfile = require('../../utils/supplierTeamProfile.js')
const switchWorkIdentity = require('../../utils/switchWorkIdentity.js')
const { notifySavedAndBack } = require('../../utils/profileSaveDone.js')
const identityTypes = require('../../utils/identityTypes.js')
const mpApiErrors = require('../../utils/mpApiErrors.js')
const wxProfileDisplay = require('../../utils/wxProfileDisplay.js')
const profileLinkParse = require('../../utils/profileLinkParse.js')
const loginCredPanel = require('../../utils/loginCredentialsPanel.js')
const credHandlers = loginCredPanel.createHandlers(auth)
const accountSessionActions = require('../../utils/accountSessionActions.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')
const mpProfileNav = require('../../utils/mpProfileNav.js')
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

function syncUiFromProfiles(page, profiles, douyinLevelIndex, expandedMap) {
  const expanded = expandedMap || page.data.platformExpanded || {}
  const platformSections = talentPlatforms.uiSections(profiles, douyinLevelIndex).map((s) => ({
    ...s,
    expanded: !!expanded[s.id],
  }))
  page.setData({
    platformProfiles: profiles,
    platformSections,
    platformExpanded: expanded,
    douyinLevelIndex: douyinLevelIndex || 0,
  })
}

function buildInitialExpanded(profiles) {
  const out = {}
  for (const p of talentPlatforms.TALENT_PLATFORMS) {
    const prof = profiles && profiles[p.id]
    out[p.id] = !!(prof && prof.enabled && !talentPlatforms.profileFilled(prof))
  }
  return out
}

function collapseAllPlatforms() {
  const out = {}
  for (const p of talentPlatforms.TALENT_PLATFORMS) out[p.id] = false
  return out
}

Page({
  behaviors: [require('../../behaviors/mpDefaultShare')],
  data: {
    wxNickName: '',
    wxAvatarUrl: '',
    wxOpenId: '',
    contact: '',
    wechatId: '',
    alipayAccount: '',
    gender: '',
    profileAutofillLoading: false,
    profileAutofillPlatform: '',
    platformProfiles: talentPlatforms.emptyAllProfiles(),
    platformSections: [],
    platformExpanded: {},
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
    regionLocating: false,
    regionLocateHint: '',
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
  applyIdentityIdLabels(workIdentity) {
    const wid = workIdentity || this.data.workIdentity || userProfile.readIdentity()
    const member = readMember()
    const account = auth.readAccount()
    const idPatch = identityIdLabels.buildIdentityIdLabels(wid, { member, account })
    this.setData(idPatch)
  },
  async onShow() {
    const workIdentity = userProfile.readIdentity()
    if (auth.isLoggedIn()) {
      try {
        await switchWorkIdentity.ensureWorkIdentityIfNeeded()
      } catch (_) {}
    }
    const acct = auth.readAccount()
    if (acct) accountMemberSync.syncTalentMemberFromAccount(acct)
    const patch = loginCredPanel.patchFromAccount(acct)
    Object.assign(patch, identityIdLabels.buildIdentityIdLabels(workIdentity, {
      member: readMember(),
      account: acct,
    }))
    patch.workIdentity = workIdentity
    patch.isSupplier = workIdentity === 'shoot' || workIdentity === 'edit'
    this.setData(patch)
    this.handleProfileFuzzyLocate()
  },
  /** 资料页展示后：用户从「我的信息」点入时触发系统模糊位置授权并填入 */
  handleProfileFuzzyLocate() {
    if (!auth.isLoggedIn() || !regionAutoLocate.fuzzyLocationEnabled()) return

    const pending = regionAutoLocate.consumePendingHit()
    if (pending) {
      applyRegionToPage(this, pending.province, pending.city)
      this.setData({ regionLocateHint: '已定位，可修改' })
      return
    }

    if (regionAutoLocate.consumeProfileLocateOnEnter()) {
      this.runProfileEnterLocate({ silent: true, fromUserTap: true })
      return
    }

    regionAutoLocate.readFuzzyScopeSetting().then((scope) => {
      if (scope === true) this.runProfileEnterLocate({ silent: true })
    })
  },
  runProfileEnterLocate(opts) {
    const silent = !!(opts && opts.silent)
    const forceRetry = !!(opts && opts.forceRetry)
    const fromUserTap = !!(opts && opts.fromUserTap)
    if (this._regionLocateRunning && !forceRetry && !fromUserTap) return
    this._regionLocateRunning = true
    this.setData({ regionLocating: true })
    regionAutoLocate.clearFuzzyLocationBlocked()
    regionAutoLocate
      .requestFuzzyLocationOnProfileEnter({ forceRetry, fromUserTap })
      .then((hit) => {
        if (!hit) {
          if (!silent) this.showLocateFailFeedback(forceRetry || fromUserTap)
          return
        }
        applyRegionToPage(this, hit.province, hit.city)
        this.setData({ regionLocateHint: '已定位，可修改' })
        if (!silent) wx.showToast({ title: '定位成功', icon: 'success' })
      })
      .finally(() => {
        this._regionLocateRunning = false
        this.setData({ regionLocating: false })
      })
  },
  showLocateFailFeedback(manual) {
    const reason = regionAutoLocate.readLastLocateFailReason()
    if (reason === 'scope_denied' && manual) {
      wx.showModal({
        title: '需要模糊位置权限',
        content: '请在设置中开启「位置信息 → 模糊位置」',
        confirmText: '去设置',
        cancelText: '取消',
        success(res) {
          if (res.confirm) regionAutoLocate.openFuzzyLocationSetting()
        },
      })
      return
    }
    const mpRuntime = require('../../utils/mpRuntime.js')
    const title =
      reason === 'api_blocked'
        ? '模糊定位接口未开通'
        : reason === 'no_api'
          ? '当前微信版本不支持模糊定位'
          : reason === 'geocode_fail'
            ? '定位解析失败，请手动选择'
            : mpRuntime.isDevtoolsEnv()
              ? '开发者工具请手动选择省市'
              : '定位失败，请允许模糊位置后重试'
    wx.showToast({ title, icon: 'none', duration: 2800 })
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
    if (!auth.isLoggedIn()) {
      const q = options && options.edit != null ? `?edit=${encodeURIComponent(String(options.edit))}` : '?edit=1'
      guestRoutes.redirectToLogin(`/pages/register/register${q}`, { replace: true })
      return
    }
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
    const platformExpanded = buildInitialExpanded(profiles)
    const patch = {
      ...region,
      editMode: edit,
      workIdentity,
      isSupplier,
      supplierProfile: supplierProf,
      platformProfiles: profiles,
      platformExpanded,
      platformSections: talentPlatforms.uiSections(profiles, douyinLevelIndex).map((s) => ({
        ...s,
        expanded: !!platformExpanded[s.id],
      })),
      douyinLevelIndex,
    }
    const acct = auth.readAccount()
    if (acct) accountMemberSync.syncTalentMemberFromAccount(acct)
    Object.assign(patch, identityIdLabels.buildIdentityIdLabels(workIdentity, { member: cur, account: acct }))
    Object.assign(patch, loginCredPanel.patchFromAccount(acct))
    if (cur) {
      Object.assign(patch, {
        wxNickName: cur.wxNickName || '',
        wxAvatarUrl: cur.wxAvatarUrl || '',
        wxOpenId: cur.wxOpenId || '',
        contact: cur.contact || '',
        wechatId: cur.wechatId || '',
        alipayAccount: cur.alipayAccount || '',
        gender: cur.gender || '',
        platformProfiles: profiles,
        platformSections: talentPlatforms.uiSections(profiles, douyinLevelIndex).map((s) => ({
          ...s,
          expanded: !!platformExpanded[s.id],
        })),
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
  tryAutoLocateRegion(opts) {
    if (this._regionLocateRunning) return
    this._regionLocateRunning = true
    const silent = !!(opts && opts.silent)
    const tryFuzzy = !!(opts && opts.tryFuzzy)
    const forceFuzzy = !!(opts && opts.forceFuzzy)
    const skipDevice = !!(opts && opts.skipDevice) || !tryFuzzy
    this.setData({ regionLocating: true })
    const run = (useSkipDevice) =>
      regionAutoLocate.autoLocateRegion({ skipDevice: useSkipDevice, tryFuzzy, forceFuzzy }).then((hit) => {
        if (hit) return hit
        if (!useSkipDevice && regionAutoLocate.ipLocateEnabled()) {
          return regionAutoLocate.autoLocateRegion({ skipDevice: true })
        }
        return null
      })

    run(skipDevice)
      .then((hit) => {
        if (!hit) {
          if (!silent) {
            const reason = regionAutoLocate.readLastLocateFailReason()
            if (reason === 'scope_denied') {
              wx.showModal({
                title: '需要模糊位置权限',
                content: '请允许「模糊位置」，以便自动填写您所在的省市',
                confirmText: '去设置',
                cancelText: '取消',
                success(res) {
                  if (res.confirm) regionAutoLocate.openFuzzyLocationSetting()
                },
              })
              return
            }
            const mpRuntime = require('../../utils/mpRuntime.js')
            const onDevtools = mpRuntime.isDevtoolsEnv()
            wx.showToast({
              title: tryFuzzy
                ? reason === 'api_blocked' || regionAutoLocate.readSkipFuzzyFlag()
                  ? '模糊定位接口未开通，请手动选择'
                  : reason === 'geocode_fail'
                    ? '定位成功但解析失败，请手动选择'
                    : '定位失败，请重试或手动选择'
                : onDevtools
                  ? '定位失败，请手动选择'
                  : '请手动选择省市',
              icon: 'none',
              duration: 2800,
            })
          }
          return
        }
        applyRegionToPage(this, hit.province, hit.city)
        const hint =
          hit.source === 'gps' || hit.source === 'fuzzy'
            ? '已定位，可修改'
            : hit.source === 'ip'
              ? '已根据网络推测，请核对后修改'
              : '已自动定位，可修改'
        this.setData({ regionLocateHint: hint })
        if (!silent) wx.showToast({ title: '定位成功', icon: 'success' })
      })
      .catch(() => {
        if (!silent) wx.showToast({ title: '定位失败，请手动选择', icon: 'none' })
      })
      .finally(() => {
        this._regionLocateRunning = false
        this.setData({ regionLocating: false })
      })
  },
  onRegionRelocate() {
    const mpRuntime = require('../../utils/mpRuntime.js')
    if (regionAutoLocate.fuzzyLocationEnabled()) {
      regionAutoLocate.clearFuzzyLocationBlocked()
      this.runProfileEnterLocate({ silent: false, forceRetry: true, fromUserTap: true })
      return
    }
    if (mpRuntime.isDevtoolsEnv() || regionAutoLocate.ipLocateEnabled()) {
      this.tryAutoLocateRegion({ silent: false })
      return
    }
    wx.showToast({
      title: '自动定位未开启，请手动选择省市',
      icon: 'none',
      duration: 2800,
    })
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
  onGenderTap(e) {
    const g = e.currentTarget.dataset.gender
    if (!g) return
    this.setData({ gender: this.data.gender === g ? '' : g })
  },
  async onProfileLinkAutofill(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const plat = talentPlatforms.TALENT_PLATFORMS.find((p) => p.id === id)
    const prof = (this.data.platformProfiles && this.data.platformProfiles[id]) || {}
    const link = String(prof.profileLink || '').trim()
    if (!link) {
      wx.showToast({ title: '请先粘贴主页链接', icon: 'none' })
      return
    }
    if (!api.hasApi()) {
      wx.showToast({ title: '请先配置 API 后再自动填写', icon: 'none' })
      return
    }
    this.setData({ profileAutofillLoading: true, profileAutofillPlatform: id })
    try {
      const parsed = await profileLinkParse.parseProfileLink(link, plat?.name || '抖音')
      const profiles = { ...this.data.platformProfiles }
      const cur = { ...talentPlatforms.emptyProfile(), ...(profiles[id] || {}), enabled: true }
      if (parsed.platformAccount) cur.platformAccount = parsed.platformAccount
      if (parsed.platformNickname) cur.platformNickname = parsed.platformNickname
      if (parsed.profileLink) cur.profileLink = parsed.profileLink
      if (parsed.followers > 0) cur.followers = String(parsed.followers)
      if (parsed.talentGrade && id === 'kuaishou') cur.talentGrade = parsed.talentGrade
      if (Array.isArray(parsed.accountTags) && parsed.accountTags.length) {
        const merged = [...new Set([...(cur.accountTags || []), ...parsed.accountTags])]
        cur.accountTags = merged
      }
      profiles[id] = cur
      syncUiFromProfiles(this, profiles, this.data.douyinLevelIndex)
      const patch = {}
      if (parsed.gender && !this.data.gender) patch.gender = parsed.gender
      if (Object.keys(patch).length) this.setData(patch)
      wx.showToast({ title: '已自动填写', icon: 'success' })
    } catch (err) {
      wx.showToast({
        title: (err && err.message) || '解析失败',
        icon: 'none',
        duration: 2800,
      })
    } finally {
      this.setData({ profileAutofillLoading: false, profileAutofillPlatform: '' })
    }
  },
  onTogglePlatformEnable(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const profiles = { ...this.data.platformProfiles }
    const cur = { ...talentPlatforms.emptyProfile(), ...(profiles[id] || {}) }
    cur.enabled = !!e.detail.value
    profiles[id] = cur
    const expanded = { ...this.data.platformExpanded, [id]: cur.enabled }
    if (!cur.enabled) expanded[id] = false
    syncUiFromProfiles(this, profiles, this.data.douyinLevelIndex, expanded)
  },
  onTogglePlatformDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const prof = (this.data.platformProfiles && this.data.platformProfiles[id]) || {}
    if (!prof.enabled) return
    const expanded = { ...this.data.platformExpanded, [id]: !this.data.platformExpanded[id] }
    syncUiFromProfiles(this, this.data.platformProfiles, this.data.douyinLevelIndex, expanded)
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
    const basicContact = require('../../utils/basicContactFields.js')
    const contactErr = basicContact.validateBasicContactFields({
      wxNickName: this.data.wxNickName,
      contact: this.data.contact,
      wechatId: this.data.wechatId,
    })
    if (contactErr) return contactErr
    const regionErr = validateRegion(this.data.province, this.data.city)
    if (regionErr) return regionErr
    if (this.data.isSupplier) {
      return supplierTeamProfile.validateSupplierProfile(this.data.workIdentity, this.data.supplierProfile, {
        wxNickName: this.data.wxNickName,
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
      gender: String(this.data.gender || '').trim(),
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
          member.wxAvatarUrl = await wxProfileDisplay.persistWxAvatarUrl(member.wxAvatarUrl)
          const loginOpts = {
            role: identityTypes.accountRoleForWorkIdentity(workId),
            wxNickName: member.wxNickName,
            wxAvatarUrl: member.wxAvatarUrl,
          }
          if (!this.data.isSupplier) loginOpts.registerTalent = member
          const acctAfterLogin = await auth.ensureWxAuthSession(loginOpts)
          if (acctAfterLogin) {
            Object.assign(member, accountMemberSync.mergeMemberForCloudRegister(member, acctAfterLogin))
          }
          if (this.data.isSupplier) {
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
          switchWorkIdentity.syncLocalProfilesFromAccount(auth.readAccount(), workId)
        } catch (cloudErr) {
          console.warn('[register] cloud sync failed', cloudErr)
          const detail = mpApiErrors.formatMpApiErr(cloudErr, '请稍后重试')
          cloudWarn = `资料已写入本机，云端同步失败：${detail}`
        }
      }
      this.applyIdentityIdLabels(workId)
      syncUiFromProfiles(this, profiles, this.data.douyinLevelIndex, collapseAllPlatforms())
      notifySavedAndBack(cloudWarn)
    } finally {
      this.setData({ submitting: false })
    }
  },
})
