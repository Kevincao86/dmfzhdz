const mpAddonPageGate = require('../../../utils/mpAddonPageGate.js')
const vs = require('../../../utils/mpVisualStudioAi.js')
const points = require('../../../utils/mpPointsSpendApi.js')

function mapChannels(selected) {
  const set = new Set(selected || [])
  return vs.CHANNELS.map((c) => ({ ...c, on: set.has(c.id) }))
}

Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  data: {
    step: 1,
    wizardSteps: [
      { n: 1, label: '渠道' },
      { n: 2, label: '玩法' },
      { n: 3, label: '文案' },
      { n: 4, label: '出图' },
    ],
    channels: mapChannels(['douyin', 'wechat_moments']),
    selectedChannels: ['douyin', 'wechat_moments'],
    industries: vs.INDUSTRIES,
    industry: 'dining',
    storeName: '',
    playbooks: vs.PLAYBOOKS,
    playbook: 'grand_opening',
    copyItems: [],
    copyIndex: 0,
    headline: '',
    subheadline: '',
    offer: '',
    refPath: '',
    refDataUrl: '',
    aspect: '3:4',
    copyBusy: false,
    genBusy: false,
    progress: '',
    err: '',
    resultUrl: '',
    copyPoints: points.VISUAL_STUDIO_COPY_POINTS,
    imagePoints: points.VISUAL_STUDIO_IMAGE_POINTS,
  },
  onShow() {
    if (!mpAddonPageGate.ensureAddonPageAccess('visualStudio')) return
  },
  formSnapshot() {
    return {
      channels: this.data.selectedChannels,
      industry: this.data.industry,
      storeName: this.data.storeName,
      playbook: this.data.playbook,
      headline: this.data.headline,
      subheadline: this.data.subheadline,
      offer: this.data.offer,
    }
  },
  onStep(e) {
    const n = Number(e.currentTarget.dataset.step)
    if (n >= 1 && n <= 4) this.setData({ step: n })
  },
  onNextStep() {
    if (this.data.step === 1 && !this.data.selectedChannels.length) {
      wx.showToast({ title: '请至少选一个渠道', icon: 'none' })
      return
    }
    if (this.data.step === 3 && !String(this.data.headline || '').trim()) {
      wx.showToast({ title: '请填写主标题或先生成文案', icon: 'none' })
      return
    }
    this.setData({ step: Math.min(4, this.data.step + 1), err: '' })
  },
  onPrevStep() {
    this.setData({ step: Math.max(1, this.data.step - 1), err: '' })
  },
  onToggleChannel(e) {
    const id = e.currentTarget.dataset.id
    let selected = [...this.data.selectedChannels]
    if (selected.includes(id)) selected = selected.filter((x) => x !== id)
    else selected.push(id)
    this.setData({ selectedChannels: selected, channels: mapChannels(selected) })
  },
  onIndustry(e) {
    this.setData({ industry: e.currentTarget.dataset.id })
  },
  onStoreName(e) {
    this.setData({ storeName: e.detail.value })
  },
  onPlaybook(e) {
    this.setData({ playbook: e.currentTarget.dataset.id })
  },
  onHeadline(e) {
    this.setData({ headline: e.detail.value })
  },
  onSubheadline(e) {
    this.setData({ subheadline: e.detail.value })
  },
  onOffer(e) {
    this.setData({ offer: e.detail.value })
  },
  onAspect(e) {
    this.setData({ aspect: e.currentTarget.dataset.val })
  },
  onPickCopy(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.copyItems[index]
    if (!item) return
    this.setData({
      copyIndex: index,
      headline: item.headline,
      subheadline: item.subheadline,
      offer: item.offer,
    })
  },
  async onAiCopy() {
    if (this.data.copyBusy) return
    this.setData({ copyBusy: true, err: '' })
    try {
      await points.assertVisualStudioCopyAffordable()
      const r = await vs.fetchCopySuggestions(this.formSnapshot())
      const items = r.items || []
      if (!items.length) throw new Error(r.message || '未生成文案')
      await points.spendVisualStudioCopyPoints({
        idempotencyKey: `vs-copy-${Date.now()}`,
        note: '视觉工坊文案包',
      })
      const first = items[0]
      this.setData({
        copyItems: items,
        copyIndex: 0,
        headline: first.headline,
        subheadline: first.subheadline,
        offer: first.offer,
      })
      wx.showToast({ title: r.source === 'ai' ? '文案已生成' : '已用本地文案', icon: 'none' })
    } catch (e) {
      const msg = String((e && e.message) || e)
      this.setData({ err: msg })
      const action = points.affordActionFromError(e)
      if (action === 'recharge') {
        wx.showModal({
          title: '积分不足',
          content: msg,
          confirmText: '去充值',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: '/pages/subpack-mine/mine-xingxuan-points-recharge/mine-xingxuan-points-recharge',
              })
            }
          },
        })
      } else {
        wx.showToast({ title: msg.slice(0, 40), icon: 'none' })
      }
    } finally {
      this.setData({ copyBusy: false })
    }
  },
  onPickRef() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (!f || !f.tempFilePath) return
        const path = f.tempFilePath
        const fs = wx.getFileSystemManager()
        try {
          const b64 = fs.readFileSync(path, 'base64')
          const dataUrl = `data:image/jpeg;base64,${b64}`
          this.setData({ refPath: path, refDataUrl: dataUrl })
        } catch (_) {
          this.setData({ refPath: path, refDataUrl: '' })
        }
      },
    })
  },
  async onGenerate() {
    if (this.data.genBusy) return
    const headline = String(this.data.headline || '').trim()
    if (!headline) {
      wx.showToast({ title: '请先填写主标题', icon: 'none' })
      return
    }
    this.setData({ genBusy: true, err: '', progress: '校验积分…', resultUrl: '' })
    try {
      await points.assertVisualStudioImageAffordable(1)
      this.setData({ progress: '整理出图需求…' })
      const copy = {
        headline,
        subheadline: this.data.subheadline,
        offer: this.data.offer,
      }
      this.setData({ progress: 'AI 生图中，约需数十秒…' })
      const r = await vs.generatePosterImage(this.formSnapshot(), copy, {
        aspectRatio: this.data.aspect,
        referenceImage: this.data.refDataUrl || '',
      })
      if (!r.ok) throw new Error(r.message || '出图失败')
      await points.spendVisualStudioImagePoints({
        idempotencyKey: `vs-img-${Date.now()}`,
        note: '视觉工坊生图',
      })
      this.setData({ resultUrl: r.imageUrl, progress: '生成完成' })
    } catch (e) {
      const msg = String((e && e.message) || e)
      this.setData({ err: msg, progress: '' })
      const action = points.affordActionFromError(e)
      if (action === 'recharge') {
        wx.showModal({
          title: '积分不足',
          content: msg,
          confirmText: '去充值',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: '/pages/subpack-mine/mine-xingxuan-points-recharge/mine-xingxuan-points-recharge',
              })
            }
          },
        })
      } else {
        wx.showToast({ title: msg.slice(0, 40), icon: 'none' })
      }
    } finally {
      this.setData({ genBusy: false })
    }
  },
  onPreview() {
    if (!this.data.resultUrl) return
    wx.previewImage({ urls: [this.data.resultUrl], current: this.data.resultUrl })
  },
  onSaveAlbum() {
    const url = this.data.resultUrl
    if (!url) return
    wx.showLoading({ title: '保存中' })
    const savePath = (filePath) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: () => wx.showToast({ title: '已保存', icon: 'success' }),
        fail: (err) => {
          const msg = String((err && err.errMsg) || '')
          if (/auth deny|authorize/i.test(msg)) {
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中允许保存到相册',
              confirmText: '去设置',
              success: (r) => {
                if (r.confirm) wx.openSetting({})
              },
            })
          } else {
            wx.showToast({ title: '保存失败', icon: 'none' })
          }
        },
        complete: () => wx.hideLoading(),
      })
    }
    if (/^wxfile:|^http:\/\/tmp/i.test(url)) {
      savePath(url)
      return
    }
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) savePath(res.tempFilePath)
        else {
          wx.hideLoading()
          wx.showToast({ title: '下载失败', icon: 'none' })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '下载失败', icon: 'none' })
      },
    })
  },
})
