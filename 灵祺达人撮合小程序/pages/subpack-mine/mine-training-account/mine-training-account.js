const training = require('../../../utils/mpTraining.js')

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
    platforms: '',
    skills: '',
    years: '',
    intro: '',
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
    const p = await training.syncProfile()
    if (!p) return
    this.setData({
      lecturerStatus: training.lecturerState(p),
      kind: p.kind || 'person',
      name: p.name || '',
      idNo: p.idNo || '',
      bank: p.bank || '',
      bankNo: p.bankNo || '',
      licenseNo: p.licenseNo || '',
      city: p.city || '',
      platforms: p.platforms || '',
      skills: p.skills || '',
      years: p.years || '',
      intro: p.intro || '',
      idFront: p.idFront || '',
      idBack: p.idBack || '',
      licenseImage: p.licenseImage || '',
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
  onKind(e) { this.setData({ kind: e.currentTarget.dataset.id }) },
  onName(e) { this.setData({ name: e.detail.value }) },
  onId(e) { this.setData({ idNo: e.detail.value }) },
  onBank(e) { this.setData({ bank: e.detail.value }) },
  onBankNo(e) { this.setData({ bankNo: e.detail.value }) },
  onLicense(e) { this.setData({ licenseNo: e.detail.value }) },
  onCity(e) { this.setData({ city: e.detail.value }) },
  onPlatforms(e) { this.setData({ platforms: e.detail.value }) },
  onSkills(e) { this.setData({ skills: e.detail.value }) },
  onYears(e) { this.setData({ years: e.detail.value }) },
  onIntro(e) { this.setData({ intro: e.detail.value }) },
  goApply() {
    wx.redirectTo({ url: '/pages/subpack-mine/mine-training-account/mine-training-account?mode=apply' })
  },
  async onApply() {
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
