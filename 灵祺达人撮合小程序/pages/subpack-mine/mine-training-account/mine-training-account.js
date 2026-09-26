const training = require('../../../utils/mpTraining.js')
const cityPicker = require('../../../utils/formRelayCityPicker.js')

const PLATFORMS = ['抖音', '小红书', '大众点评', '快手', '微信视频号']

function splitPlatforms(raw) {
  return String(raw || '')
    .split(/[、,，/]/)
    .map((s) => s.trim())
    .filter((s) => PLATFORMS.indexOf(s) >= 0)
}

function platformRows(selected) {
  const on = {}
  ;(selected || []).forEach((name) => {
    on[name] = true
  })
  return PLATFORMS.map((name) => ({ name, on: !!on[name] }))
}

Page({
  data: {
    mode: 'payout',
    lecturerStatus: 'none',
    kind: 'person',
    name: '',
    idNo: '',
    bank: '',
    bankNo: '',
    licenseNo: '',
    city: '',
    cityDisplay: '请选择城市',
    cityNational: false,
    selectedCities: [],
    cityModalOpen: false,
    cityKeyword: '',
    cityActiveProvince: '',
    cityProvinceRows: [],
    cityCheckGrid: [],
    citySelectedChips: [],
    platformMode: 'multi',
    platformRows: platformRows([]),
    platforms: '',
    skills: '',
    years: '',
    intro: '',
    avatar: '',
    advanced: false,
    depositPaid: false,
    yuan: training.DEPOSIT_YUAN,
    idFront: '',
    idBack: '',
    licenseImage: '',
  },
  onLoad(query) {
    const mode = query && query.mode === 'apply' ? 'apply' : 'payout'
    this.setData({ mode })
    wx.setNavigationBarTitle({ title: mode === 'apply' ? '申请讲师' : '收款认证' })
  },
  async onShow() {
    let depositPaid = training.depositPaid()
    try { depositPaid = await training.syncDeposit() } catch (_) {}
    this.setData({ depositPaid, advanced: training.isAdvancedMember(), yuan: training.DEPOSIT_YUAN })
    if (this._editing) return
    const p = await training.syncProfile()
    if (!p || this._editing) return
    const parsed = cityPicker.parseRegionToCityState(p.city || '')
    const picked = splitPlatforms(p.platforms)
    const cityPatch = this.cityPatch(parsed.cityNational, parsed.selectedCities, '', '')
    this.setData({
      lecturerStatus: training.lecturerState(p),
      kind: p.kind || 'person',
      name: p.name || '',
      idNo: p.idNo || '',
      bank: p.bank || '',
      bankNo: p.bankNo || '',
      licenseNo: p.licenseNo || '',
      platforms: picked.join('、'),
      platformMode: picked.length > 1 ? 'multi' : 'single',
      platformRows: platformRows(picked),
      skills: p.skills || '',
      years: p.years || '',
      intro: p.intro || '',
      avatar: p.avatar || '',
      idFront: p.idFront || '',
      idBack: p.idBack || '',
      licenseImage: p.licenseImage || '',
      ...cityPatch,
    })
  },
  cityPatch(national, cities, keyword, provinceHint) {
    const list = cities || []
    const st = cityPicker.initModalState(keyword || '', provinceHint || this.data.cityActiveProvince || '', list)
    const region = cityPicker.buildRegionFromCityState(!!national, list)
    return {
      cityNational: !!national,
      selectedCities: list,
      city: national ? '全国' : region === '全国' ? '' : region,
      cityDisplay: cityPicker.formatCityDisplayText(!!national, list).replace('请选择招募城市', '请选择城市'),
      cityKeyword: keyword || '',
      cityActiveProvince: st.activeProvince,
      cityProvinceRows: st.provinceRows,
      cityCheckGrid: st.cityCheckGrid,
      citySelectedChips: list.map((name) => ({ name })),
    }
  },
  openCity() {
    if (this.data.lecturerStatus === 'approved') return
    this._editing = true
    this.setData({ cityModalOpen: true, ...this.cityPatch(this.data.cityNational, this.data.selectedCities, this.data.cityKeyword, this.data.cityActiveProvince) })
  },
  closeCity() {
    this.setData({ cityModalOpen: false })
  },
  onCityNational() {
    this.setData(this.cityPatch(true, [], this.data.cityKeyword, this.data.cityActiveProvince))
  },
  onCityKeyword(e) {
    this.setData(this.cityPatch(this.data.cityNational, this.data.selectedCities, e.detail.value, this.data.cityActiveProvince))
  },
  onCityProvinceTap(e) {
    const name = e.currentTarget.dataset.name
    this.setData(this.cityPatch(this.data.cityNational, this.data.selectedCities, this.data.cityKeyword, name))
  },
  onCityCheckTap(e) {
    const name = e.currentTarget.dataset.name
    const cities = (this.data.selectedCities || []).slice()
    const idx = cities.indexOf(name)
    if (idx >= 0) cities.splice(idx, 1)
    else cities.push(name)
    this.setData(this.cityPatch(false, cities, this.data.cityKeyword, this.data.cityActiveProvince))
  },
  onRemoveCityChip(e) {
    const name = e.currentTarget.dataset.name
    const cities = (this.data.selectedCities || []).filter((c) => c !== name)
    this.setData(this.cityPatch(false, cities, this.data.cityKeyword, this.data.cityActiveProvince))
  },
  onPlatformMode(e) {
    if (this.data.lecturerStatus === 'approved') return
    const mode = e.currentTarget.dataset.id === 'single' ? 'single' : 'multi'
    let picked = splitPlatforms(this.data.platforms)
    if (mode === 'single' && picked.length > 1) picked = picked.slice(0, 1)
    this._editing = true
    this.setData({ platformMode: mode, platforms: picked.join('、'), platformRows: platformRows(picked) })
  },
  onPlatformTap(e) {
    if (this.data.lecturerStatus === 'approved') return
    const name = e.currentTarget.dataset.name
    if (!name) return
    let picked = splitPlatforms(this.data.platforms)
    if (this.data.platformMode === 'single') {
      picked = picked.length === 1 && picked[0] === name ? [] : [name]
    } else {
      const idx = picked.indexOf(name)
      if (idx >= 0) picked.splice(idx, 1)
      else picked.push(name)
    }
    this._editing = true
    this.setData({ platforms: picked.join('、'), platformRows: platformRows(picked) })
  },
  onPickAvatar() {
    if (this.data.lecturerStatus === 'approved') return
    this._editing = true
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: (res) => {
        const path = res.tempFilePaths && res.tempFilePaths[0]
        if (!path) return
        const read = (filePath) => wx.getFileSystemManager().readFile({
          filePath,
          encoding: 'base64',
          success: (file) => this.setData({ avatar: `data:image/jpeg;base64,${file.data}` }),
          fail: () => wx.showToast({ title: '读取照片失败', icon: 'none' }),
        })
        if (wx.compressImage) {
          wx.compressImage({ src: path, quality: 60, success: (c) => read(c.tempFilePath || path), fail: () => read(path) })
        } else {
          read(path)
        }
      },
    })
  },
  onPickDoc(e) {
    const kind = e.currentTarget.dataset.kind
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: (res) => {
        const path = res.tempFilePaths && res.tempFilePaths[0]
        if (!path) return
        wx.showLoading({ title: '识别中' })
        const read = (filePath) => wx.getFileSystemManager().readFile({
          filePath,
          encoding: 'base64',
          success: async (file) => {
            const imageDataUrl = `data:image/jpeg;base64,${file.data}`
            const patch = kind === 'id_front' ? { idFront: imageDataUrl } : kind === 'id_back' ? { idBack: imageDataUrl } : { licenseImage: imageDataUrl }
            try {
              const fields = await training.recognizeDoc(kind, imageDataUrl)
              if (fields.name) patch.name = fields.name
              if (fields.idNo) patch.idNo = fields.idNo
              if (fields.licenseNo) patch.licenseNo = fields.licenseNo
              if (fields.legalPerson && this.data.kind === 'entity' && !fields.name) patch.name = fields.legalPerson
              this.setData(patch)
              wx.showToast({ title: '已填入识别结果', icon: 'none' })
            } catch (err) {
              this.setData(patch)
              wx.showToast({ title: String(err.message || '识别失败').slice(0, 18), icon: 'none' })
            } finally {
              wx.hideLoading()
            }
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '读取照片失败', icon: 'none' })
          },
        })
        if (wx.compressImage) {
          wx.compressImage({
            src: path,
            quality: 60,
            success: (c) => read(c.tempFilePath || path),
            fail: () => read(path),
          })
        } else {
          read(path)
        }
      },
    })
  },
  onKind(e) { this._editing = true; this.setData({ kind: e.currentTarget.dataset.id }) },
  onName(e) { this._editing = true; this.setData({ name: e.detail.value }) },
  onId(e) { this.setData({ idNo: e.detail.value }) },
  onBank(e) { this.setData({ bank: e.detail.value }) },
  onBankNo(e) { this.setData({ bankNo: e.detail.value }) },
  onLicense(e) { this.setData({ licenseNo: e.detail.value }) },
  onCity() {},
  onPlatforms() {},
  onSkills(e) { this._editing = true; this.setData({ skills: e.detail.value }) },
  onYears(e) { this._editing = true; this.setData({ years: e.detail.value }) },
  onIntro(e) { this._editing = true; this.setData({ intro: e.detail.value }) },
  goApply() {
    wx.redirectTo({ url: '/pages/subpack-mine/mine-training-account/mine-training-account?mode=apply' })
  },
  onOpenMember() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-xingxuan-membership/mine-xingxuan-membership' })
  },
  async onPayDeposit() {
    if (this._paying) return
    this._paying = true
    wx.showLoading({ title: '拉起微信支付', mask: true })
    try {
      const pre = await training.prepay({ purpose: 'deposit' })
      const payApi = require('../../../utils/mpMembershipApi.js')
      await payApi.requestWxPayment(pre.jsapiParams)
      const q = await training.payQuery(pre.outTradeNo)
      wx.hideLoading()
      if (!q.paid) throw new Error('支付结果确认中，请稍后下拉刷新')
      this.setData({ depositPaid: true })
      wx.showToast({ title: '保证金已支付', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      const msg = String((e && e.message) || '支付未完成')
      if (!/cancel|取消/i.test(msg)) wx.showToast({ title: msg.slice(0, 18), icon: 'none' })
    } finally {
      this._paying = false
    }
  },
  async onApply() {
    if (!training.isAdvancedMember()) {
      wx.showModal({
        title: '请先开通高级会员',
        content: '专业版、旗舰版或企业版才能申请讲师。',
        confirmText: '去开通',
        success: (res) => {
          if (res.confirm) this.onOpenMember()
        },
      })
      return
    }
    if (!this.data.depositPaid) {
      wx.showToast({ title: '请先缴纳保证金', icon: 'none' })
      await this.onPayDeposit()
      return
    }
    try {
      await training.applyLecturer(this.data)
      wx.showToast({ title: '已提交审核', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (e) {
      wx.showToast({ title: String(e.message || '提交失败').slice(0, 18), icon: 'none' })
    }
  },
  async onSave() {
    try {
      await training.saveProfile(this.data)
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (e) {
      wx.showToast({ title: String(e.message || '保存失败').slice(0, 18), icon: 'none' })
    }
  },
})
