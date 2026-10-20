const vs = require('../../utils/visualStudioAiMp.js')
const points = require('../../utils/erpPointsSpendMp.js')

const CLARIFY_PROMPT =
  '这是同一张照片的高清修复。保持画面里的人物、物体、文字、构图和颜色不变，只提高清晰度、锐度和细节，去掉模糊和压缩噪点。不要换脸，不要重画，不要加字，不要改背景。'

Page({
  data: {
    sourcePath: '',
    sourceData: '',
    resultUrl: '',
    busy: false,
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
    try {
      const b64 = wx.getFileSystemManager().readFileSync(path, 'base64')
      this.setData({
        sourcePath: path,
        sourceData: `data:image/jpeg;base64,${b64}`,
        resultUrl: '',
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
    this.setData({ busy: true, msg: '校验积分…', resultUrl: '' })
    try {
      await points.assertVisualStudioImageAffordable(1, 'standard')
      this.setData({ msg: '正在按原图提高清晰度…' })
      const gen = await vs.postAiAgentImage(CLARIFY_PROMPT, {
        preferredVendor: 'qwen',
        exactPrompt: true,
        referenceImage: this.data.sourceData,
      })
      if (!gen.ok) throw new Error(gen.message || '修复失败')
      if (!(gen.pointsCharged > 0)) {
        await points.spendVisualStudioImagePoints({
          idempotencyKey: `erp-img-clarify-${Date.now()}`,
          note: '图片变清晰',
          tier: 'standard',
        })
      }
      this.setData({ resultUrl: gen.imageUrl, msg: `已完成，本次 ${this.data.imagePoints} 积分` })
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
      this.setData({ busy: false })
    }
  },
})
