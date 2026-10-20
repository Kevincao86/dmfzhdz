const api = require('../../../utils/mpAddonMerchantApi.js')
const points = require('../../../utils/mpPointsSpendApi.js')

function choiceText(data) {
  if (!data) return ''
  const label = data.label || ''
  const detail = data.detail || ''
  const reason = data.reason || ''
  return [label, detail].filter(Boolean).join(' · ') + (reason ? `。${reason}` : '')
}

Page({
  data: {
    sourcePath: '',
    sourceData: '',
    sourceW: 0,
    sourceH: 0,
    resultUrl: '',
    busy: false,
    stage: '',
    choice: '',
    msg: '',
  },
  onPick() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) return
        wx.compressImage({
          src: file.tempFilePath,
          quality: 80,
          success: (compressed) => this.readSource(compressed.tempFilePath || file.tempFilePath),
          fail: () => this.readSource(file.tempFilePath),
        })
      },
    })
  },
  readSource(path) {
    wx.getImageInfo({
      src: path,
      success: (info) => this.storeSource(path, info.width, info.height),
      fail: () => this.storeSource(path, 0, 0),
    })
  },
  storeSource(path, width, height) {
    try {
      const b64 = wx.getFileSystemManager().readFileSync(path, 'base64')
      this.setData({
        sourcePath: path,
        sourceData: `data:image/jpeg;base64,${b64}`,
        sourceW: width || 0,
        sourceH: height || 0,
        resultUrl: '',
        choice: '',
        msg: '',
      })
    } catch (e) {
      this.setData({ msg: '读取图片失败' })
    }
  },
  onPreview() {
    if (!this.data.resultUrl) return
    wx.previewImage({ urls: [this.data.resultUrl], current: this.data.resultUrl })
  },
  async onClarify() {
    if (this.data.busy || !this.data.sourceData) return
    this.setData({ busy: true, stage: '正在理解这张图…', msg: '', resultUrl: '', choice: '' })
    try {
      await points.assertVisualStudioImageAffordable(1, 'standard')
      const judged = await api.postImageClarify({
        clarify_phase: 'judge',
        reference_image: this.data.sourceData,
        image_width: this.data.sourceW,
        image_height: this.data.sourceH,
      })
      if (!judged.ok) throw new Error(judged.message || '没能判断适合的方式')
      const choice = judged.data || {}
      if (!choice.route) throw new Error('没有选出可用的变清晰方式')
      this.setData({
        choice: choiceText(choice),
        stage: `选用${choice.label || '万相超分'}，${choice.detail || '正在变清晰'}`,
      })
      const ran = await api.postImageClarify({
        clarify_phase: 'run',
        clarify_route: choice.route,
        reference_image: this.data.sourceData,
        image_width: this.data.sourceW,
        image_height: this.data.sourceH,
      })
      if (!ran.ok) throw new Error(ran.message || '修复失败')
      const data = ran.data || {}
      if (!data.imageUrl) throw new Error('没有返回清晰后的图片')
      await points.spendVisualStudioImagePoints({
        idempotencyKey: `img-clarify-${Date.now()}`,
        note: '图片变清晰',
        tier: 'standard',
      })
      const note = data.fallbackNote ? `${data.fallbackNote}。` : ''
      this.setData({
        resultUrl: data.imageUrl,
        choice: choiceText(data),
        msg: `${note}已完成，本次 8 积分`,
      })
    } catch (e) {
      this.setData({ msg: (e && e.message) || '修复失败' })
    } finally {
      this.setData({ busy: false, stage: '' })
    }
  },
})
