const mpAddonPageGate = require('../../../utils/mpAddonPageGate.js')
const addonApi = require('../../../utils/mpAddonMerchantApi.js')
const media = require('../../../utils/mpAddonMedia.js')
const dhPresets = require('../../../utils/mpDigitalHumanPresets.js')

Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  data: {
    mainTab: 'create',
    step: 1,
    wizardSteps: dhPresets.WIZARD_STEPS,
    avatarFilter: 'all',
    avatars: dhPresets.PRESET_AVATARS,
    filteredAvatars: dhPresets.PRESET_AVATARS,
    backgrounds: dhPresets.BACKGROUNDS,
    gestures: dhPresets.GESTURES,
    subtitleStyles: dhPresets.SUBTITLE_STYLES,
    avatarId: 'av-real-1',
    backgroundId: 'studio',
    gestureId: 'none',
    subtitleId: 'bottom-white',
    driveMode: 'text',
    script: '',
    motionInstructions: '',
    douyinLinkUrl: '',
    aiTopic: '',
    resolution: '720P',
    works: [],
    ttsBusy: false,
    renderBusy: false,
    aiScriptBusy: false,
    linkBusy: false,
    err: '',
    progress: '',
    previewUrl: '',
    ttsPlaying: false,
  },
  onShow() {
    if (!mpAddonPageGate.ensureAddonPageAccess('digitalHuman')) return
    this.applyAvatarFilter(this.data.avatarFilter)
    this.setData({ works: dhPresets.loadWorks() })
  },
  onUnload() {
    this._cancelled = true
    if (this._audioCtx) {
      try {
        this._audioCtx.stop()
        this._audioCtx.destroy()
      } catch (_) {}
      this._audioCtx = null
    }
  },
  onTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ mainTab: tab })
    if (tab === 'works') this.setData({ works: dhPresets.loadWorks() })
  },
  onStep(e) {
    const step = Number(e.currentTarget.dataset.step) || 1
    this.setData({ step })
  },
  onNextStep() {
    if (this.data.step < 5) this.setData({ step: this.data.step + 1 })
  },
  onPrevStep() {
    if (this.data.step > 1) this.setData({ step: this.data.step - 1 })
  },
  applyAvatarFilter(filter) {
    const avatars = this.data.avatars
    const filteredAvatars =
      filter === 'all' ? avatars : avatars.filter((a) => a.style === filter)
    this.setData({ avatarFilter: filter, filteredAvatars })
  },
  onAvatarFilter(e) {
    this.applyAvatarFilter(e.currentTarget.dataset.filter)
  },
  onAvatar(e) {
    this.setData({ avatarId: e.currentTarget.dataset.id, previewUrl: '', err: '' })
  },
  onDriveMode(e) {
    this.setData({ driveMode: e.currentTarget.dataset.mode })
  },
  onBackground(e) {
    this.setData({ backgroundId: e.currentTarget.dataset.id })
  },
  onGesture(e) {
    this.setData({ gestureId: e.currentTarget.dataset.id })
  },
  onSubtitle(e) {
    this.setData({ subtitleId: e.currentTarget.dataset.id })
  },
  onResolution(e) {
    this.setData({ resolution: e.currentTarget.dataset.val })
  },
  onScript(e) {
    this.setData({ script: e.detail.value })
  },
  onMotion(e) {
    this.setData({ motionInstructions: e.detail.value })
  },
  onDouyinLink(e) {
    this.setData({ douyinLinkUrl: e.detail.value })
  },
  onAiTopic(e) {
    this.setData({ aiTopic: e.detail.value })
  },
  selectedAvatar() {
    return this.data.avatars.find((a) => a.id === this.data.avatarId) || this.data.avatars[0]
  },
  voiceParams() {
    return dhPresets.voiceForAvatar(this.data.avatarId)
  },
  async onAiScript() {
    const topic = String(this.data.aiTopic || this.data.script || '').trim()
    if (topic.length < 4) {
      wx.showToast({ title: '请填写创作主题', icon: 'none' })
      return
    }
    this.setData({ aiScriptBusy: true })
    try {
      const avatar = this.selectedAvatar()
      const r = await addonApi.postAiChat([
        {
          role: 'user',
          content: `你是短视频口播编剧。形象：${avatar.name}（${avatar.tag}）。请写 80-200 字口播稿，口语化、有转化力。主题：${topic}。只输出口播正文。`,
        },
      ])
      if (!r.ok) {
        wx.showToast({ title: r.message || '生成失败', icon: 'none' })
        return
      }
      this.setData({ script: r.content })
    } catch (e) {
      wx.showToast({ title: String(e.message || e).slice(0, 20), icon: 'none' })
    } finally {
      this.setData({ aiScriptBusy: false })
    }
  },
  async onParseDouyinLink() {
    const url = String(this.data.douyinLinkUrl || '').trim()
    if (!url) {
      wx.showToast({ title: '请粘贴抖音链接', icon: 'none' })
      return
    }
    this.setData({ linkBusy: true })
    try {
      const r = await addonApi.postDouyinLinkForDh(url)
      if (!r.ok) {
        wx.showToast({ title: r.message || '解析失败', icon: 'none' })
        return
      }
      this.setData({
        driveMode: 'link',
        script: r.script,
        motionInstructions: r.motionInstructions || this.data.motionInstructions,
        douyinLinkUrl: r.normalizedUrl,
      })
      wx.showToast({ title: '已提取口播文案', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: String(e.message || e).slice(0, 20), icon: 'none' })
    } finally {
      this.setData({ linkBusy: false })
    }
  },
  async onTtsPreview() {
    const text = String(this.data.script || '').trim()
    if (text.length < 4) {
      wx.showToast({ title: '口播稿至少 4 字', icon: 'none' })
      return
    }
    if (this._audioCtx) {
      try {
        this._audioCtx.stop()
        this._audioCtx.destroy()
      } catch (_) {}
      this._audioCtx = null
    }
    this.setData({ ttsBusy: true, err: '' })
    try {
      const voice = this.voiceParams()
      const r = await addonApi.postDigitalHumanTts({
        text: text.slice(0, 600),
        voicePresetId: voice.voicePresetId,
        speechRate: voice.speechRate,
        speechPitch: voice.speechPitch,
      })
      if (!r.ok) {
        this.setData({ err: r.message || '试听失败' })
        return
      }
      const path = media.writeBase64TempFile(r.audioBase64, 'mp3')
      const ctx = wx.createInnerAudioContext()
      this._audioCtx = ctx
      ctx.src = path
      ctx.onPlay(() => this.setData({ ttsPlaying: true }))
      ctx.onEnded(() => {
        this.setData({ ttsPlaying: false })
        ctx.destroy()
        if (this._audioCtx === ctx) this._audioCtx = null
      })
      ctx.onError(() => {
        this.setData({ ttsPlaying: false, err: '音频播放失败' })
        ctx.destroy()
      })
      ctx.play()
    } catch (e) {
      this.setData({ err: String(e.message || e).slice(0, 80) })
    } finally {
      this.setData({ ttsBusy: false })
    }
  },
  async onGenerate() {
    const text = String(this.data.script || '').trim()
    if (text.length < 8) {
      wx.showToast({ title: '口播稿至少 8 字', icon: 'none' })
      return
    }
    const avatar = this.selectedAvatar()
    this._cancelled = false
    this.setData({ renderBusy: true, err: '', progress: '合成配音…', previewUrl: '', step: 5 })
    try {
      const voice = this.voiceParams()
      const tts = await addonApi.postDigitalHumanTts({
        text: text.slice(0, 800),
        voicePresetId: voice.voicePresetId,
        speechRate: voice.speechRate,
        speechPitch: voice.speechPitch,
      })
      if (!tts.ok) {
        this.setData({ err: tts.message || '配音失败' })
        return
      }
      this.setData({ progress: '加载形象…' })
      const avatarB64 = await media.downloadUrlBase64(avatar.previewUrl)
      this.setData({ progress: '提交口型驱动…' })
      const start = await addonApi.postDhS2vStart({
        image_base64: avatarB64,
        audio_base64: tts.audioBase64,
        resolution: this.data.resolution,
        frame_mode: avatar.bodyFrame === 'full' ? 'full' : 'half',
      })
      if (!start.ok) {
        this.setData({ err: start.message || '提交失败' })
        return
      }
      const done = await addonApi.pollVideoTask(
        addonApi.fetchDhS2vStatus,
        start.taskId,
        (label) => {
          if (!this._cancelled) this.setData({ progress: label })
        },
      )
      if (!done.ok) {
        this.setData({ err: done.message })
        return
      }
      const work = {
        id: `dh-${Date.now()}`,
        title: text.slice(0, 24) + (text.length > 24 ? '…' : ''),
        avatarName: avatar.name,
        backgroundId: this.data.backgroundId,
        videoUrl: done.videoUrl,
        createdAt: new Date().toISOString(),
      }
      const works = dhPresets.upsertWork(work)
      this.setData({ previewUrl: done.videoUrl, progress: '合成完成', works })
    } catch (e) {
      this.setData({ err: String(e.message || e).slice(0, 100) })
    } finally {
      this.setData({ renderBusy: false })
    }
  },
  onSavePreview() {
    const url = this.data.previewUrl
    if (!url) return
    media
      .saveVideoToAlbum(url)
      .then(() => wx.showToast({ title: '已保存到相册', icon: 'success' }))
      .catch((e) => wx.showToast({ title: String(e.message || '保存失败').slice(0, 24), icon: 'none' }))
  },
  onOpenWork(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    this.setData({ mainTab: 'create', previewUrl: url, step: 4, progress: '', err: '' })
  },
  onSaveWork(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    media
      .saveVideoToAlbum(url)
      .then(() => wx.showToast({ title: '已保存', icon: 'success' }))
      .catch((err) => wx.showToast({ title: String(err.message || '保存失败').slice(0, 24), icon: 'none' }))
  },
})
