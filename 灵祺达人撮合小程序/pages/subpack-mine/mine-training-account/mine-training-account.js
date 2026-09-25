const training = require('../../../utils/mpTraining.js')

Page({
  data: {
    kind: 'person',
    name: '',
    idNo: '',
    bank: '',
    bankNo: '',
    licenseNo: '',
  },
  onShow() {
    const p = training.readProfile()
    if (!p) return
    this.setData({
      kind: p.kind || 'person',
      name: p.name || '',
      idNo: p.idNo || '',
      bank: p.bank || '',
      bankNo: p.bankNo || '',
      licenseNo: p.licenseNo || '',
    })
  },
  onKind(e) { this.setData({ kind: e.currentTarget.dataset.id }) },
  onName(e) { this.setData({ name: e.detail.value }) },
  onId(e) { this.setData({ idNo: e.detail.value }) },
  onBank(e) { this.setData({ bank: e.detail.value }) },
  onBankNo(e) { this.setData({ bankNo: e.detail.value }) },
  onLicense(e) { this.setData({ licenseNo: e.detail.value }) },
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
