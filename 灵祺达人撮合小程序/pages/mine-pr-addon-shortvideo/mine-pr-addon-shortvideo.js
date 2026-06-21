const prFeatureAccess = require('../../utils/prFeatureAccess.js')
const auth = require('../../utils/auth.js')
const userProfile = require('../../utils/userProfile.js')
const addonApi = require('../../utils/mpAddonMerchantApi.js')
const media = require('../../utils/mpAddonMedia.js')
const iceApi = require('../../utils/mpAddonIceApi.js')

function newJobId() {
  return `ice-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

Page({
  behaviors: [require('../../behaviors/identityTheme')],
  data: {
    mainPane: 'optimize',
    engine: 'qwen',
    optPrompt: '',
    genPrompt: '',
    framePath: '',
    framePureB64: '',
    durationSec: '5',
    aspect: '9:16',
    busy: false,
    err: '',
    progress: '',
    resultUrl: '',
    iceConfigured: false,
    icePresets: ['无附加特效'],
    materialTab: 'video',
    videoJobs: [],
    imageItems: [],
    urlText: '',
    imageUrlText: '',
    editCopy: '',
    editInstruction: '',
    iceAspectId: '9:16',
    clipEndSec: 10,
    icePreset: '无附加特效',
    batchEnabled: false,
    batchCount: 10,
    iceBusy: false,
    iceErr: '',
    iceProgress: '',
    iceResultUrl: '',
    briefAiBusy: false,
  },
  onShow() {
    if (userProfile.readIdentity() !== 'pr' && userProfile.readIdentity() !== 'talent' && userProfile.readIdentity() !== 'shoot' && userProfile.readIdentity() !== 'edit') {
      wx.navigateBack()
      return
    }
    if (!prFeatureAccess.canUsePrAddons(auth.readAccount())) {
      wx.navigateBack()
      return
    }
    this.loadIceConfig()
  },
  onUnload() {
    this._cancelled = true
  },
  async loadIceConfig() {
    try {
      const cfg = await iceApi.fetchIceConfig()
      if (cfg && cfg.configured) {
        const presets = (cfg.effectOptions && cfg.effectOptions.map((o) => o.label)) || cfg.presets || ['无附加特效']
        this.setData({
          iceConfigured: true,
          icePresets: presets,
          icePreset: presets[0] || '无附加特效',
        })
      }
    } catch (_) {
      /* ignore */
    }
  },
  onPane(e) {
    this.setData({ mainPane: e.currentTarget.dataset.pane, err: '', progress: '', iceErr: '', iceProgress: '' })
  },
  onEngine(e) {
    this.setData({ engine: e.currentTarget.dataset.engine })
  },
  onOptPrompt(e) {
    this.setData({ optPrompt: e.detail.value })
  },
  onGenPrompt(e) {
    this.setData({ genPrompt: e.detail.value })
  },
  onDuration(e) {
    this.setData({ durationSec: e.currentTarget.dataset.val })
  },
  onAspect(e) {
    this.setData({ aspect: e.currentTarget.dataset.val })
  },
  flagsLine() {
    return `--dur ${this.data.durationSec} --fps 24 --ratio ${this.data.aspect} --wm false`
  },
  /** 防止隐私授权回调与 tap 重复触发导致多次打开相册 */
  _runMediaPickOnce(kind, runner) {
    if (this._mediaPicking) return
    this._mediaPicking = kind
    Promise.resolve()
      .then(runner)
      .finally(() => {
        this._mediaPicking = null
      })
  },
  onPickRefImage() {
    this._runMediaPickOnce('image', () =>
      media
        .chooseImage()
        .then((img) => {
          this.setData({ framePath: img.path, framePureB64: img.pureBase64 })
        })
        .catch((e) => {
          if (!/cancel|取消/i.test(String(e.message || ''))) {
            wx.showToast({ title: String(e.message || '选择失败').slice(0, 28), icon: 'none' })
          }
        }),
    )
  },
  onPickRefVideo() {
    this._runMediaPickOnce('video', () =>
      media
        .chooseVideo()
        .then(async (v) => {
          if (v.thumb) {
            const pure = await media.readFileBase64(v.thumb)
            this.setData({ framePath: v.thumb, framePureB64: pure })
            return
          }
          if (v.path) {
            this.setData({ framePath: v.path })
          }
        })
        .catch((e) => {
          if (!/cancel|取消/i.test(String(e.message || ''))) {
            wx.showToast({ title: String(e.message || '选择失败').slice(0, 28), icon: 'none' })
          }
        }),
    )
  },
  async onGenerate() {
    const pane = this.data.mainPane
    const prompt = String(pane === 'optimize' ? this.data.optPrompt : this.data.genPrompt).trim()
    if (!prompt) {
      wx.showToast({ title: '请填写提示词', icon: 'none' })
      return
    }
    if (pane === 'optimize' && !this.data.framePureB64) {
      wx.showToast({ title: '请先上传参考画面', icon: 'none' })
      return
    }
    this._cancelled = false
    this.setData({ busy: true, err: '', progress: '提交任务…', resultUrl: '' })
    try {
      const body = {
        prompt,
        flags: this.flagsLine(),
        images_base64: pane === 'optimize' || this.data.framePureB64 ? [this.data.framePureB64] : undefined,
      }
      if (pane === 'generate' && !body.images_base64) delete body.images_base64
      const start = await addonApi.postShortVideoWithFailover({ engine: this.data.engine, body })
      if (!start.ok) {
        this.setData({ err: start.message || '发起失败' })
        return
      }
      this.setData({ progress: '生成中…' })
      const done = await addonApi.pollVideoTask(addonApi.fetchSeedanceStatus, start.taskId, (label) => {
        if (!this._cancelled) this.setData({ progress: label })
      })
      if (!done.ok) {
        this.setData({ err: done.message })
        return
      }
      this.setData({ resultUrl: done.videoUrl, progress: '生成完成' })
    } catch (e) {
      this.setData({ err: String(e.message || e).slice(0, 100) })
    } finally {
      this.setData({ busy: false })
    }
  },
  onSaveVideo() {
    const url = this.data.resultUrl || this.data.iceResultUrl
    if (!url) return
    media
      .saveVideoToAlbum(url)
      .then(() => wx.showToast({ title: '已保存到相册', icon: 'success' }))
      .catch((e) => wx.showToast({ title: String(e.message || '保存失败').slice(0, 24), icon: 'none' }))
  },
  onMaterialTab(e) {
    this.setData({ materialTab: e.currentTarget.dataset.tab })
  },
  onUrlText(e) {
    this.setData({ urlText: e.detail.value })
  },
  onImageUrlText(e) {
    this.setData({ imageUrlText: e.detail.value })
  },
  onEditCopy(e) {
    this.setData({ editCopy: e.detail.value })
  },
  onEditInstruction(e) {
    this.setData({ editInstruction: e.detail.value })
  },
  onIceAspect(e) {
    this.setData({ iceAspectId: e.currentTarget.dataset.id })
  },
  onClipEnd(e) {
    this.setData({ clipEndSec: Number(e.currentTarget.dataset.val) || 10 })
  },
  onIcePreset(e) {
    this.setData({ icePreset: e.currentTarget.dataset.val })
  },
  onBatchToggle() {
    this.setData({ batchEnabled: !this.data.batchEnabled })
  },
  onBatchCount(e) {
    this.setData({ batchCount: Number(e.currentTarget.dataset.val) || 10 })
  },
  iceAspect() {
    return iceApi.ICE_ASPECT_PRESETS.find((a) => a.id === this.data.iceAspectId) || iceApi.ICE_ASPECT_PRESETS[0]
  },
  composedBrief() {
    return iceApi.composeIceEditBrief(this.data.editCopy, this.data.editInstruction)
  },
  onAddVideoUrls() {
    const urls = iceApi.parseUrlLines(this.data.urlText)
    if (!urls.length) {
      wx.showToast({ title: '请粘贴有效视频链接', icon: 'none' })
      return
    }
    const jobs = [...this.data.videoJobs]
    urls.forEach((u, i) => {
      jobs.push({ id: newJobId(), label: `视频${jobs.length + i + 1}`, mediaUrl: u, phase: 'pending' })
    })
    this.setData({ videoJobs: jobs, urlText: '' })
  },
  onAddImageUrls() {
    const urls = iceApi.parseUrlLines(this.data.imageUrlText)
    if (!urls.length) return
    const items = [...this.data.imageItems]
    urls.forEach((u, i) => {
      items.push({ id: newJobId(), label: `图片${items.length + i + 1}`, mediaUrl: u })
    })
    this.setData({ imageItems: items, imageUrlText: '' })
  },
  onUploadIceVideo() {
    this._runMediaPickOnce('ice-video', () =>
      media
        .chooseVideo()
        .then((v) => {
          this.setData({ iceProgress: '上传视频中…' })
          return iceApi.uploadIceLocalFile(v.path, `ice-${Date.now()}.mp4`, 'video/mp4').then((up) => ({ up, v }))
        })
        .then(({ up }) => {
          if (!up.ok) {
            wx.showToast({ title: up.message || '上传失败', icon: 'none' })
            this.setData({ iceProgress: '' })
            return
          }
          const jobs = [...this.data.videoJobs, { id: newJobId(), label: up.label || '本地视频', mediaUrl: up.mediaUrl, phase: 'pending' }]
          this.setData({ videoJobs: jobs, iceProgress: '' })
        })
        .catch((e) => {
          if (!/cancel|取消/i.test(String(e.message || ''))) {
            wx.showToast({ title: String(e.message || '上传失败').slice(0, 28), icon: 'none' })
          }
          this.setData({ iceProgress: '' })
        }),
    )
  },
  onUploadIceImage() {
    this._runMediaPickOnce('ice-image', () =>
      media
        .chooseImage()
        .then((img) => {
          this.setData({ iceProgress: '上传图片中…' })
          return iceApi.uploadIceLocalFile(img.path, `ice-${Date.now()}.jpg`, 'image/jpeg').then((up) => ({ up, img }))
        })
        .then(({ up, img }) => {
          if (!up.ok) {
            wx.showToast({ title: up.message || '上传失败', icon: 'none' })
            this.setData({ iceProgress: '' })
            return
          }
          const items = [
            ...this.data.imageItems,
            { id: newJobId(), label: up.label || '本地图片', mediaUrl: up.mediaUrl, previewUrl: img.path },
          ]
          this.setData({ imageItems: items, iceProgress: '' })
        })
        .catch((e) => {
          if (!/cancel|取消/i.test(String(e.message || ''))) {
            wx.showToast({ title: String(e.message || '上传失败').slice(0, 28), icon: 'none' })
          }
          this.setData({ iceProgress: '' })
        }),
    )
  },
  onRemoveJob(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ videoJobs: this.data.videoJobs.filter((j) => j.id !== id) })
  },
  onRemoveImage(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ imageItems: this.data.imageItems.filter((j) => j.id !== id) })
  },
  async onAiIceBrief() {
    const aspect = this.iceAspect()
    this.setData({ briefAiBusy: true, iceErr: '' })
    try {
      const r = await iceApi.generateIceEditBriefAi({
        model: 'qwen',
        imageUrls: this.data.imageItems.map((x) => x.mediaUrl),
        videoUrls: this.data.videoJobs.map((x) => x.mediaUrl),
        imageLabels: this.data.imageItems.map((x) => x.label),
        aspectLabel: aspect.label,
        clipEndSec: this.data.clipEndSec,
        preset: this.data.icePreset,
      })
      if (!r.ok) {
        this.setData({ iceErr: r.message })
        return
      }
      this.setData({ editCopy: r.copy, editInstruction: r.instruction })
    } catch (e) {
      this.setData({ iceErr: String(e.message || e).slice(0, 80) })
    } finally {
      this.setData({ briefAiBusy: false })
    }
  },
  async onSubmitIce() {
    if (!this.data.iceConfigured) {
      wx.showToast({ title: '云剪未配置，请联系运营', icon: 'none' })
      return
    }
    const brief = this.composedBrief().trim()
    if (brief.length < 4) {
      wx.showToast({ title: '请填写剪辑文案或指令', icon: 'none' })
      return
    }
    const aspect = this.iceAspect()
    const pending = this.data.videoJobs.filter((j) => j.phase === 'pending' || j.phase === 'failed')
    const imageUrls = this.data.imageItems.map((x) => x.mediaUrl)
    if (!pending.length && !imageUrls.length) {
      wx.showToast({ title: '请先添加素材', icon: 'none' })
      return
    }
    this._cancelled = false
    this.setData({ iceBusy: true, iceErr: '', iceProgress: '提交云剪…', iceResultUrl: '' })
    try {
      if (imageUrls.length) {
        const pipe = await iceApi.postIcePipeline({
          imageUrls,
          projectName: '灵祺AI云剪-多图成片',
          editBrief: brief,
          width: aspect.width,
          height: aspect.height,
          clipEndSec: this.data.clipEndSec,
          preset: this.data.icePreset,
        })
        if (!pipe.ok) {
          this.setData({ iceErr: pipe.message })
          return
        }
        const done = await iceApi.pollIceJob(pipe.jobId, (label) => {
          if (!this._cancelled) this.setData({ iceProgress: label })
        })
        if (!done.ok) {
          this.setData({ iceErr: done.message })
          return
        }
        this.setData({ iceResultUrl: done.videoUrl, iceProgress: '云剪完成' })
        return
      }
      const job = pending[0]
      const runs = this.data.batchEnabled ? this.data.batchCount : 1
      for (let i = 0; i < runs; i += 1) {
        this.setData({ iceProgress: `提交第 ${i + 1}/${runs} 条…` })
        const pipe = await iceApi.postIcePipeline({
          mediaUrl: job.mediaUrl,
          projectName: `灵祺AI云剪-${job.label}`.slice(0, 120),
          editBrief: brief,
          width: aspect.width,
          height: aspect.height,
          clipEndSec: this.data.clipEndSec,
          preset: this.data.icePreset,
        })
        if (!pipe.ok) {
          this.setData({ iceErr: pipe.message })
          return
        }
        const done = await iceApi.pollIceJob(pipe.jobId, (label) => {
          if (!this._cancelled) this.setData({ iceProgress: `第 ${i + 1} 条：${label}` })
        })
        if (!done.ok) {
          this.setData({ iceErr: done.message })
          return
        }
        this.setData({ iceResultUrl: done.videoUrl })
      }
      this.setData({ iceProgress: '云剪完成' })
    } catch (e) {
      this.setData({ iceErr: String(e.message || e).slice(0, 100) })
    } finally {
      this.setData({ iceBusy: false })
    }
  },
})
