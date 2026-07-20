const mpAddonPageGate = require('../../../utils/mpAddonPageGate.js')
const addonApi = require('../../../utils/mpAddonMerchantApi.js')
const media = require('../../../utils/mpAddonMedia.js')
const dhPresets = require('../../../utils/mpDigitalHumanPresets.js')
const pointsHints = require('../../../utils/mpAddonPointsHints.js')
const mpPointsSpend = require('../../../utils/mpPointsSpendApi.js')

Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  data: {
    mainTab: 'create',
    step: 1,
    wizardSteps: dhPresets.WIZARD_STEPS,
    avatarFilter: 'all',
    avatars: dhPresets.allAvatars(),
    filteredAvatars: dhPresets.allAvatars(),
    backgrounds: dhPresets.BACKGROUNDS,
    gestures: dhPresets.GESTURES,
    subtitleStyles: dhPresets.SUBTITLE_STYLES,
    avatarId: 'av-real-1',
    selectedAvatarName: '晓晨',
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
    createBusy: false,
    err: '',
    progress: '',
    previewUrl: '',
    ttsPlaying: false,
    voiceId: 'v-av-real-1',
    voiceLabel: '晓晨 · 商务男声',
    speechRate: 0.94,
    createName: '',
    createPhotoPath: '',
    createVoicePath: '',
    createVoiceName: '',
    createVoiceBase64: '',
    voiceOptions: dhPresets.ALL_VOICE_OPTIONS,
    voiceLabels: dhPresets.ALL_VOICE_OPTIONS.map((v) => v.label),
    voiceIndex: 0,
    pointsHint: pointsHints.bannerText('digital_human', 15),
  },
  onShow() {
    if (!mpAddonPageGate.ensureAddonPageAccess('digitalHuman')) return
    this.reloadAvatars(this.data.avatarFilter)
    this.setData({
      works: dhPresets.loadWorks(),
      pointsHint: pointsHints.bannerText('digital_human', 15),
    })
  },
  onUnload() {
    this._cancelled = true
    this.stopAudio()
  },
  stopAudio() {
    if (this._audioCtx) {
      try {
        this._audioCtx.stop()
        this._audioCtx.destroy()
      } catch (_) {}
      this._audioCtx = null
    }
    this.setData({ ttsPlaying: false })
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
    if (this.data.step === 1 && !this.data.avatarId) {
      wx.showToast({ title: '请先选择形象', icon: 'none' })
      return
    }
    if (this.data.step < 5) this.setData({ step: this.data.step + 1 })
  },
  onPrevStep() {
    if (this.data.step > 1) this.setData({ step: this.data.step - 1 })
  },
  reloadAvatars(filter) {
    const avatars = dhPresets.allAvatars()
    let filteredAvatars = avatars
    if (filter === 'custom') filteredAvatars = avatars.filter((a) => a.custom)
    else if (filter === 'realistic' || filter === 'cartoon') {
      filteredAvatars = avatars.filter((a) => a.style === filter)
    }
    const cur = avatars.find((a) => a.id === this.data.avatarId) || avatars[0]
    this.setData({
      avatarFilter: filter || 'all',
      avatars,
      filteredAvatars,
      avatarId: cur ? cur.id : '',
      selectedAvatarName: cur ? cur.name : '',
      voiceId: cur ? cur.voicePresetId || `v-${cur.id}` : '',
      voiceLabel: cur ? cur.voiceLabel || cur.tag : '',
      speechRate: cur && cur.custom ? Number(cur.speechRate) || 1 : dhPresets.voiceForAvatar(cur && cur.id).speechRate,
    })
  },
  onAvatarFilter(e) {
    this.reloadAvatars(e.currentTarget.dataset.filter)
  },
  onAvatar(e) {
    const avatarId = e.currentTarget.dataset.id
    const av = dhPresets.findAvatar(avatarId)
    const preferId = av.voicePresetId || `v-${avatarId}`
    const voiceOptions = dhPresets.voiceOptionsForAvatar(avatarId)
    let voiceIndex = Math.max(0, voiceOptions.findIndex((v) => v.id === preferId))
    const selected = voiceOptions[voiceIndex] || voiceOptions[0]
    this.setData({
      avatarId,
      selectedAvatarName: av.name,
      voiceOptions,
      voiceLabels: voiceOptions.map((v) => v.label),
      voiceIndex,
      voiceId: selected ? selected.id : preferId,
      voiceLabel: selected ? selected.label : av.voiceLabel || av.tag,
      speechRate: av.custom
        ? Number(av.speechRate) || 1
        : selected
          ? selected.speechRate
          : dhPresets.voiceForAvatar(avatarId).speechRate,
      previewUrl: '',
      err: '',
    })
    void this.previewSelectedVoice()
  },
  onVoicePick(e) {
    const voiceIndex = Number(e.detail.value) || 0
    const selected = (this.data.voiceOptions || [])[voiceIndex]
    if (!selected) return
    this.setData({
      voiceIndex,
      voiceId: selected.id,
      voiceLabel: selected.label,
      speechRate: selected.speechRate,
    })
    void this.previewSelectedVoice()
  },
  onPreviewVoiceTap() {
    void this.previewSelectedVoice()
  },
  async previewSelectedVoice() {
    const av = this.selectedAvatar()
    const voice = this.voiceParams()
    this.stopAudio()
    this.setData({ ttsBusy: true, err: '' })
    try {
      const body = {
        text: dhPresets.TTS_PREVIEW_SAMPLE,
        voicePresetId: voice.voicePresetId,
        speechRate: voice.speechRate,
        speechPitch: voice.speechPitch || 1,
      }
      if (voice.referenceAudioBase64) body.referenceAudioBase64 = voice.referenceAudioBase64
      const r = await addonApi.postDigitalHumanTts(body)
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
  selectedAvatar() {
    return dhPresets.findAvatar(this.data.avatarId)
  },
  voiceParams() {
    const av = this.selectedAvatar()
    const base = dhPresets.voiceById(this.data.voiceId, this.data.avatarId, av && av.custom ? av : null)
    return {
      ...base,
      speechRate: Number(this.data.speechRate) || base.speechRate || 1,
    }
  },
  onCreateName(e) {
    this.setData({ createName: e.detail.value })
  },
  onPickCreatePhoto() {
    media
      .chooseImage()
      .then((img) => {
        this.setData({ createPhotoPath: img.path, err: '' })
      })
      .catch((e) => {
        if (!/cancel|取消/i.test(String(e.message || ''))) {
          wx.showToast({ title: String(e.message || '选择失败').slice(0, 24), icon: 'none' })
        }
      })
  },
  onPickCreateVoice() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['mp3', 'wav', 'm4a', 'aac'],
      success: async (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (!f || !f.path) return
        try {
          const b64 = await media.readFileBase64(f.path)
          if (!b64 || b64.length < 64) {
            wx.showToast({ title: '音频过短，请换一段', icon: 'none' })
            return
          }
          this.setData({
            createVoicePath: f.path,
            createVoiceName: String(f.name || '音色样本').slice(0, 28),
            createVoiceBase64: b64,
            err: '',
          })
        } catch (e) {
          wx.showToast({ title: String(e.message || '读取失败').slice(0, 24), icon: 'none' })
        }
      },
      fail: (err) => {
        const msg = String((err && err.errMsg) || '')
        if (!/cancel|取消/i.test(msg)) {
          wx.showToast({ title: '请选择音频文件', icon: 'none' })
        }
      },
    })
  },
  async onSaveCreateAvatar() {
    const name = String(this.data.createName || '').trim() || '我的形象'
    if (!this.data.createPhotoPath) {
      wx.showToast({ title: '请先上传照片', icon: 'none' })
      return
    }
    if (!this.data.createVoiceBase64) {
      wx.showToast({ title: '请先上传音色样本', icon: 'none' })
      return
    }
    this.setData({ createBusy: true, err: '' })
    try {
      const r = await addonApi.postDigitalHumanTts({
        text: dhPresets.TTS_PREVIEW_SAMPLE,
        voicePresetId: 'v-clone',
        speechRate: 1,
        speechPitch: 1,
        referenceAudioBase64: this.data.createVoiceBase64,
      })
      if (!r.ok) {
        this.setData({ err: r.message || '音色生成失败，请换一段更清晰的录音' })
        return
      }
      const id = `custom-${Date.now()}`
      const avatar = {
        id,
        name,
        tag: '自定义',
        voiceLabel: `${name} · 我的音色`,
        gender: '女',
        style: 'realistic',
        bodyFrame: 'half',
        previewUrl: this.data.createPhotoPath,
        custom: true,
        voicePresetId: 'v-clone',
        speechRate: 1,
        speechPitch: 1,
        referenceAudioBase64: this.data.createVoiceBase64,
      }
      dhPresets.upsertCustomAvatar(avatar)
      this.setData({
        createName: '',
        createPhotoPath: '',
        createVoicePath: '',
        createVoiceName: '',
        createVoiceBase64: '',
        avatarId: id,
        selectedAvatarName: name,
        voiceId: 'v-clone',
        voiceLabel: avatar.voiceLabel,
        avatarFilter: 'custom',
      })
      this.reloadAvatars('custom')
      this.setData({ avatarId: id, selectedAvatarName: name, voiceLabel: avatar.voiceLabel })
      wx.showToast({ title: '形象已保存', icon: 'success' })
      void this.previewSelectedVoice()
    } catch (e) {
      this.setData({ err: String(e.message || e).slice(0, 80) })
    } finally {
      this.setData({ createBusy: false })
    }
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
  async onGenerate() {
    const text = String(this.data.script || '').trim()
    if (text.length < 8) {
      wx.showToast({ title: '口播稿至少 8 字', icon: 'none' })
      return
    }
    /** 口播时长粗估：约 4 字/秒，最低按 5 秒计费 */
    const durationSec = Math.max(5, Math.ceil(text.length / 4))
    try {
      await mpPointsSpend.assertAddonAffordable('digital_human', durationSec)
    } catch (e) {
      this.setData({ err: String(e.message || '积分不足').slice(0, 100) })
      return
    }
    const avatar = this.selectedAvatar()
    this._cancelled = false
    this.setData({ renderBusy: true, err: '', progress: '合成配音…', previewUrl: '', step: 5 })
    try {
      const voice = this.voiceParams()
      const ttsBody = {
        text: text.slice(0, 800),
        voicePresetId: voice.voicePresetId,
        speechRate: voice.speechRate,
        speechPitch: voice.speechPitch || 1,
      }
      if (voice.referenceAudioBase64) ttsBody.referenceAudioBase64 = voice.referenceAudioBase64
      const tts = await addonApi.postDigitalHumanTts(ttsBody)
      if (!tts.ok) {
        this.setData({ err: tts.message || '配音失败' })
        return
      }
      this.setData({ progress: '加载形象…' })
      let avatarB64 = ''
      if (avatar.custom && avatar.previewUrl && !/^https?:\/\//i.test(avatar.previewUrl)) {
        avatarB64 = await media.readFileBase64(avatar.previewUrl)
      } else {
        avatarB64 = await media.downloadUrlBase64(avatar.previewUrl)
      }
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
      let progress = '合成完成'
      try {
        const charge = await mpPointsSpend.spendAddonPoints('digital_human', {
          durationSec,
          idempotencyKey: `digital_human:${start.taskId || work.id}`,
          note: `digital_human:${start.taskId || work.id}`,
        })
        if (charge && charge.pointsCharged > 0) {
          progress = `合成完成 · 消耗 ${charge.pointsCharged} 积分`
        }
        const works = dhPresets.upsertWork(work)
        this.setData({ previewUrl: done.videoUrl, progress, works })
      } catch (spendErr) {
        this.setData({
          previewUrl: '',
          err: String(spendErr.message || '积分不足，请充值或升级套餐').slice(0, 80),
          progress: '',
        })
      }
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
    this.setData({ mainTab: 'create', previewUrl: url, step: 5, progress: '', err: '' })
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
