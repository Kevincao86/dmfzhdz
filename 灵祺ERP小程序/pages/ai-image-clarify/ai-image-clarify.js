const vs = require('../../utils/visualStudioAiMp.js')
const points = require('../../utils/erpPointsSpendMp.js')

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
    imagePoints: points.VISUAL_STUDIO_IMAGE_POINTS,
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
  goRecharge() {
    wx.navigateTo({ url: '/pages/wallet/wallet' }).catch(() => {
      wx.showToast({ title: '请在「我的」充值积分', icon: 'none' })
    })
  },
  async onClarify() {
    if (this.data.busy || !this.data.sourceData) return
    this.setData({ busy: true, stage: '正在理解这张图…', msg: '', resultUrl: '', choice: '' })
    try {
      await points.assertVisualStudioImageAffordable(1, 'standard')
      const judged = await vs.postImageClarify({
        clarify_phase: 'judge',
        reference_image: this.data.sourceData,
        image_width: this.data.sourceW,
        image_height: this.data.sourceH,
      })
      if (!judged || !judged.route) throw new Error('没有选出可用的变清晰方式')
      this.setData({
        choice: choiceText(judged),
        stage: `选用${judged.label || '万相超分'}，${judged.detail || '正在变清晰'}`,
      })
      const ran = await vs.postImageClarify({
        clarify_phase: 'run',
        clarify_route: judged.route,
        reference_image: this.data.sourceData,
        image_width: this.data.sourceW,
        image_height: this.data.sourceH,
      })
      if (!ran || !ran.imageUrl) throw new Error('没有返回清晰后的图片')
      if (!(ran.pointsCharged > 0)) {
        await points.spendVisualStudioImagePoints({
          idempotencyKey: `erp-img-clarify-${Date.now()}`,
          note: '图片变清晰',
          tier: 'standard',
        })
      }
      const note = ran.fallbackNote ? `${ran.fallbackNote}。` : ''
      this.setData({
        resultUrl: ran.imageUrl,
        choice: choiceText(ran),
        msg: `${note}已完成，本次 ${this.data.imagePoints} 积分`,
      })
    } catch (e) {
      const msg = String((e && e.message) || e || '修复失败')
      this.setData({ msg })
      if (points.affordActionFromError(e) === 'recharge') {
        wx.showModal({
          title: '积分不足',
          content: msg,
          confirmText: '去充值',
          success: (res) => {
            if (res.confirm) this.goRecharge()
          },
        })
      }
    } finally {
      this.setData({ busy: false, stage: '' })
    }
  },
})
