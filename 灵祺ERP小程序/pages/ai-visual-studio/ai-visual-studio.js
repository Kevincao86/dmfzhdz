const vs = require('../../utils/visualStudioAiMp.js')
const points = require('../../utils/erpPointsSpendMp.js')

function mapChannels(selected) {
  const set = new Set(selected || [])
  return vs.CHANNELS.map((c) => ({ ...c, on: set.has(c.id) }))
}

Page({
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
    imageStdPoints: points.VISUAL_STUDIO_IMAGE_POINTS,
    imageProPoints: points.VISUAL_STUDIO_IMAGE_PRO_POINTS,
    imageTier: 'standard',
    imagePoints: points.VISUAL_STUDIO_IMAGE_POINTS,
  },
  onImageTier(e) {
    const tier = e.currentTarget.dataset.tier === 'pro' ? 'pro' : 'standard'
    this.setData({
      imageTier: tier,
      imagePoints:
        tier === 'pro' ? points.VISUAL_STUDIO_IMAGE_PRO_POINTS : points.VISUAL_STUDIO_IMAGE_POINTS,
    })
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
  goRecharge() {
    wx.navigateTo({ url: '/pages/wallet/wallet' }).catch(() => {
      wx.showToast({ title: '请在「我的」充值积分', icon: 'none' })
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
        idempotencyKey: `erp-vs-copy-${Date.now()}`,
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
      if (points.affordActionFromError(e) === 'recharge') {
        wx.showModal({
          title: '积分不足',
          content: msg,
          confirmText: '去充值',
          success: (res) => {
            if (res.confirm) this.goRecharge()
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
        try {
          const b64 = wx.getFileSystemManager().readFileSync(path, 'base64')
          this.setData({ refPath: path, refDataUrl: `data:image/jpeg;base64,${b64}` })
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
    const tier = this.data.imageTier === 'pro' ? 'pro' : 'standard'
    this.setData({ genBusy: true, err: '', progress: '校验积分…', resultUrl: '' })
    try {
      await points.assertVisualStudioImageAffordable(1, tier)
      this.setData({ progress: '整理出图需求…' })
      const copy = {
        headline,
        subheadline: this.data.subheadline,
        offer: this.data.offer,
      }
      this.setData({
        progress: tier === 'pro' ? '高级生图中…' : '生图中，约需数十秒…',
      })
      const r = await vs.generatePosterImage(this.formSnapshot(), copy, {
        aspectRatio: this.data.aspect,
        referenceImage: this.data.refDataUrl || '',
        tier,
      })
      if (!r.ok) throw new Error(r.message || '出图失败')
      // JWT 路径已由 /api/meoo-ai-agent-image 扣费；仅当接口未扣时再补扣
      if (!(r.pointsCharged > 0)) {
        await points.spendVisualStudioImagePoints({
          idempotencyKey: `erp-vs-img-${Date.now()}`,
          note: tier === 'pro' ? '视觉工坊高级生图' : '视觉工坊生图',
          tier: r.usedPro ? 'pro' : 'standard',
        })
      }
      this.setData({ resultUrl: r.imageUrl, progress: '生成完成' })
    } catch (e) {
      const msg = String((e && e.message) || e)
      this.setData({ err: msg, progress: '' })
      if (points.affordActionFromError(e) === 'recharge') {
        wx.showModal({
          title: '积分不足',
          content: msg,
          confirmText: '去充值',
          success: (res) => {
            if (res.confirm) this.goRecharge()
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
  _writeDataUrlTemp(dataUrl) {
    return new Promise((resolve, reject) => {
      const m = String(dataUrl || '').match(/^data:image\/(\w+);base64,(.+)$/i)
      if (!m) {
        reject(new Error('invalid_data_url'))
        return
      }
      const ext = m[1] === 'png' ? 'png' : 'jpg'
      const dest = `${wx.env.USER_DATA_PATH}/erp-vs-save-${Date.now()}.${ext}`
      wx.getFileSystemManager().writeFile({
        filePath: dest,
        data: m[2],
        encoding: 'base64',
        success: () => resolve(dest),
        fail: (e) => reject(new Error((e && e.errMsg) || '写临时文件失败')),
      })
    })
  },
  _resolveLocalImagePath(url) {
    const s = String(url || '').trim()
    if (!s) return Promise.reject(new Error('empty'))
    if (/^wxfile:|^http:\/\/tmp/i.test(s) || s.indexOf(wx.env.USER_DATA_PATH) === 0) {
      return Promise.resolve(s)
    }
    if (s.startsWith('data:image/')) return this._writeDataUrlTemp(s)
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url: s,
        success: (res) => {
          if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath)
          else reject(new Error('download_failed'))
        },
        fail: () => reject(new Error('download_failed')),
      })
    })
  },
  onSaveAlbum() {
    const url = this.data.resultUrl
    if (!url || this._savingAlbum) return
    this._savingAlbum = true
    wx.showLoading({ title: '保存中', mask: true })
    const finish = () => {
      this._savingAlbum = false
      wx.hideLoading()
    }
    this._resolveLocalImagePath(url)
      .then(
        (filePath) =>
          new Promise((resolve, reject) => {
            wx.saveImageToPhotosAlbum({
              filePath,
              success: () => resolve(),
              fail: (err) => reject(err),
            })
          }),
      )
      .then(() => {
        finish()
        wx.showToast({ title: '已保存', icon: 'success' })
      })
      .catch((err) => {
        finish()
        const msg = String((err && err.errMsg) || (err && err.message) || err || '')
        if (/auth deny|authorize|writePhotosAlbum/i.test(msg)) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存到相册',
            confirmText: '去设置',
            success: (r) => {
              if (r.confirm) wx.openSetting({})
            },
          })
          return
        }
        wx.showToast({ title: /download/i.test(msg) ? '下载失败，请长按图片保存' : '保存失败', icon: 'none' })
      })
  },
})
