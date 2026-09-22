const feat = require('../../utils/merchantFeatureApisMp.js')
const vs = require('../../utils/visualStudioAiMp.js')
const econ = require('../../utils/mpPointsEconomicsMp.js')
const videoAi = require('../../utils/videoAiMp.js')
const erpPoints = require('../../utils/erpPointsSpendMp.js')
const labels = require('../../utils/shortVideoLabelsMp.js')
const dhPresets = require('../../utils/digitalHumanPresetsMp.js')
const fs = wx.getFileSystemManager()

const VOICES = [
  { id: 'v-custom-female', label: '亲和女声' },
  { id: 'v-custom-male', label: '稳重男声' },
]

const PRESETS = [
  { id: 'photo', label: '上传照片' },
  { id: 'library', label: '预设形象' },
  { id: 'video', label: '实拍视频' },
]

const LIBRARY = dhPresets.libraryAvatars()

const SEEDANCE_MODEL = labels.SEEDANCE_1_5_PRO_MODEL_ID

Page({
  data: {
    step: 1,
    wizardSteps: [
      { n: 1, label: '形象' },
      { n: 2, label: '文案配音' },
      { n: 3, label: '动作背景' },
      { n: 4, label: '预览' },
      { n: 5, label: '生成' },
    ],
    avatarMode: 'library',
    presets: PRESETS,
    libraryAvatars: LIBRARY,
    selectedAvatarId: '',
    photoPath: '',
    photoDataUrl: '',
    videoPath: '',
    script: '',
    aiTopic: '',
    shopName: '',
    shopOffer: '',
    voices: VOICES,
    voiceId: VOICES[0].id,
    motion: '',
    background: '',
    douyinUrl: '',
    durationSec: 8,
    busy: false,
    ttsBusy: false,
    aiBusy: false,
    linkBusy: false,
    err: '',
    playing: false,
    resultUrl: '',
    progress: '',
    rateLabel: econ.formatMpPointsRateLabel('digital_human'),
  },

  onUnload() {
    this.stopAudio()
  },

  onStep(e) {
    const n = Number(e.currentTarget.dataset.step)
    if (n >= 1 && n <= 5) this.setData({ step: n, err: '' })
  },
  onNext() {
    if (this.data.step === 1) {
      if (this.data.avatarMode === 'photo' && !this.data.photoPath) {
        wx.showToast({ title: '请先上传形象照片', icon: 'none' })
        return
      }
      if (this.data.avatarMode === 'library' && !this.data.photoDataUrl) {
        wx.showToast({ title: '请先点选一个预设形象', icon: 'none' })
        return
      }
    }
    if (this.data.step === 2 && String(this.data.script || '').trim().length < 8) {
      wx.showToast({ title: '请先填写口播文案（至少 8 字）', icon: 'none' })
      return
    }
    this.setData({ step: Math.min(5, this.data.step + 1), err: '' })
  },
  onPrev() {
    this.setData({ step: Math.max(1, this.data.step - 1), err: '' })
  },

  onAvatarMode(e) {
    this.setData({ avatarMode: e.currentTarget.dataset.id, err: '' })
  },
  async onPickLibrary(e) {
    const id = e.currentTarget.dataset.id
    const row = LIBRARY.find((x) => x.id === id)
    if (!row) return
    this.setData({ selectedAvatarId: id, avatarMode: 'library', err: '' })
    wx.showLoading({ title: '加载形象…', mask: true })
    try {
      const got = await dhPresets.downloadToDataUrl(row.url)
      this.setData({
        photoPath: got.path,
        photoDataUrl: got.dataUrl,
        avatarMode: 'library',
      })
    } catch (err) {
      this.setData({
        photoPath: row.url,
        photoDataUrl: '',
        err: (err && err.message) || '预设形象加载失败',
      })
    } finally {
      wx.hideLoading()
    }
  },
  onScript(e) {
    this.setData({ script: e.detail.value })
  },
  onAiTopic(e) {
    this.setData({ aiTopic: e.detail.value })
  },
  onShopName(e) {
    this.setData({ shopName: e.detail.value })
  },
  onShopOffer(e) {
    this.setData({ shopOffer: e.detail.value })
  },
  onMotion(e) {
    this.setData({ motion: e.detail.value })
  },
  onBackground(e) {
    this.setData({ background: e.detail.value })
  },
  onDouyinUrl(e) {
    this.setData({ douyinUrl: e.detail.value })
  },
  onPickVoice(e) {
    this.setData({ voiceId: e.currentTarget.dataset.id })
  },
  onDuration(e) {
    this.setData({ durationSec: Number(e.detail.value) || 8 })
  },

  onPickPhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (!f || !f.tempFilePath) return
        try {
          const b64 = fs.readFileSync(f.tempFilePath, 'base64')
          this.setData({ photoPath: f.tempFilePath, photoDataUrl: `data:image/jpeg;base64,${b64}` })
        } catch (_) {
          this.setData({ photoPath: f.tempFilePath })
        }
      },
    })
  },

  onPickVideo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (f && f.tempFilePath) this.setData({ videoPath: f.tempFilePath, avatarMode: 'video' })
      },
    })
  },

  async onAiScript() {
    const topic = String(this.data.aiTopic || this.data.shopOffer || this.data.script || '').trim()
    if (topic.length < 4) {
      wx.showToast({ title: '请填写主题或卖点（至少 4 字）', icon: 'none' })
      return
    }
    this.setData({ aiBusy: true, err: '' })
    try {
      const dur = Math.max(4, Number(this.data.durationSec) || 8)
      const chars = Math.max(80, Math.min(280, dur * 18))
      const r = await vs.postAiChat(
        [
          {
            role: 'system',
            content: '你是数字人口播撰稿。只输出可直接朗读的口播正文，不要标题和说明。',
          },
          {
            role: 'user',
            content: [
              `门店：${this.data.shopName || '本店'}`,
              `卖点：${this.data.shopOffer || ''}`,
              `主题：${topic}`,
              `口播成片时长 ${dur} 秒，正文约 ${chars} 字，不要明显超长或过短。口语化、有钩子、有到店/团购动作。`,
            ].join('\n'),
          },
        ],
        { provider: 'qwen', taskType: 'generate_copywriting', temperature: 0.45 },
      )
      if (!r.ok) throw new Error(r.message)
      this.setData({ script: String(r.content || '').trim() })
      wx.showToast({ title: 'AI 口播脚本已生成', icon: 'none' })
    } catch (e) {
      this.setData({ err: (e && e.message) || '生成失败' })
    } finally {
      this.setData({ aiBusy: false })
    }
  },

  async onAiRewrite() {
    const text = String(this.data.script || '').trim()
    if (text.length < 8) {
      wx.showToast({ title: '请先填写至少 8 个字的口播原文', icon: 'none' })
      return
    }
    this.setData({ aiBusy: true, err: '' })
    try {
      const r = await vs.postAiChat(
        [
          { role: 'system', content: '你改写口播，只输出改写后的正文。' },
          { role: 'user', content: `请把下列口播改得更口语、更有钩子，长度接近原文：\n${text}` },
        ],
        { provider: 'qwen', taskType: 'generate_copywriting', temperature: 0.4 },
      )
      if (!r.ok) throw new Error(r.message)
      this.setData({ script: String(r.content || '').trim() })
    } catch (e) {
      this.setData({ err: (e && e.message) || '改写失败' })
    } finally {
      this.setData({ aiBusy: false })
    }
  },

  async onAiMotion() {
    const text = String(this.data.script || '').trim()
    if (!text) {
      wx.showToast({ title: '请先填写口播文案', icon: 'none' })
      return
    }
    this.setData({ aiBusy: true, err: '' })
    try {
      const r = await vs.postAiChat(
        [
          { role: 'system', content: '你输出与口播同步的动作指令，短句分号分隔。' },
          { role: 'user', content: `根据口播写镜头动作（指向商品、点头、挥手等）：\n${text}` },
        ],
        { provider: 'qwen', taskType: 'generate_copywriting', temperature: 0.35 },
      )
      if (!r.ok) throw new Error(r.message)
      this.setData({ motion: String(r.content || '').trim() })
    } catch (e) {
      this.setData({ err: (e && e.message) || '动作改写失败' })
    } finally {
      this.setData({ aiBusy: false })
    }
  },

  async onParseLink() {
    const url = String(this.data.douyinUrl || '').trim()
    if (!url) {
      wx.showToast({ title: '请粘贴抖音链接', icon: 'none' })
      return
    }
    this.setData({ linkBusy: true, err: '' })
    const r = await feat.fetchDigitalHumanDouyinLink(url)
    this.setData({ linkBusy: false })
    if (!r.ok) {
      this.setData({ err: r.message })
      return
    }
    this.setData({
      script: r.script || this.data.script,
      motion: r.motion || this.data.motion,
    })
    wx.showToast({ title: r.title ? `已提取：${r.title}` : '已提取口播文案', icon: 'none' })
  },

  stopAudio() {
    if (this._audio) {
      try {
        this._audio.stop()
        this._audio.destroy()
      } catch (_) {}
      this._audio = null
    }
    this.setData({ playing: false })
  },

  playBase64(b64) {
    this.stopAudio()
    const path = `${wx.env.USER_DATA_PATH}/dh-tts-${Date.now()}.mp3`
    try {
      fs.writeFileSync(path, b64, 'base64')
    } catch (e) {
      this.setData({ err: (e && e.message) || '写入音频失败' })
      return
    }
    const audio = wx.createInnerAudioContext()
    this._audio = audio
    audio.src = path
    audio.onEnded(() => this.setData({ playing: false }))
    audio.onError(() => {
      this.setData({ playing: false, err: '播放失败' })
    })
    audio.play()
    this.setData({ playing: true })
  },

  onSynth() {
    const text = String(this.data.script || '').trim()
    if (!text) {
      wx.showToast({ title: '请输入口播文案', icon: 'none' })
      return
    }
    this.setData({ ttsBusy: true, err: '' })
    void (async () => {
      const r = await feat.synthesizeDigitalHumanTts({
        text,
        voicePresetId: this.data.voiceId,
      })
      this.setData({ ttsBusy: false })
      if (!r.ok) {
        this.setData({ err: r.message || '合成失败' })
        return
      }
      this.playBase64(r.audioBase64)
    })()
  },

  onStop() {
    this.stopAudio()
  },

  async onGenerate() {
    const text = String(this.data.script || '').trim()
    if ((this.data.avatarMode === 'photo' || this.data.avatarMode === 'library') && !this.data.photoDataUrl && !this.data.photoPath) {
      wx.showToast({ title: '请先选择数字人形象', icon: 'none' })
      return
    }
    if (!text) {
      wx.showToast({ title: '请先输入口播文案', icon: 'none' })
      return
    }
    const dur = Math.max(4, Math.min(15, Number(this.data.durationSec) || 8))
    const afford = await erpPoints.checkAddonPointsAffordable('digital_human', dur)
    if (!afford.ok) {
      this.setData({ err: afford.message })
      return
    }
    this.setData({ busy: true, err: '', progress: '提交口播渲染…', resultUrl: '' })
    try {
      const prompt = [
        '竖屏 9:16 数字人口播，人物口型与口播一致，画面稳定。',
        text,
        this.data.motion ? `动作：${this.data.motion}` : '',
        this.data.background ? `背景：${this.data.background}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      const body = {
        model: SEEDANCE_MODEL,
        prompt,
        flags: `--dur ${dur} --fps 24 --ratio 9:16 --wm false --rsn 720p`,
        generate_audio: true,
        durationSec: dur,
      }
      if (this.data.photoDataUrl) body.images_base64 = [this.data.photoDataUrl]
      const r = await videoAi.postSeedanceStart(body)
      if (!r.ok) throw new Error(r.message || '提交失败')
      const done = await videoAi.pollSeedanceUntilDone(r.taskId, (t) => this.setData({ progress: t }))
      if (!done.ok || !done.videoUrl) throw new Error(done.message || '生成未完成')
      await erpPoints.spendAddonPoints({
        kind: 'digital_human',
        durationSec: dur,
        idempotencyKey: `dh:${r.taskId}`,
        note: `digital_human:${r.taskId}`,
      })
      this.setData({ resultUrl: done.videoUrl, progress: '高清口播已生成', step: 5 })
    } catch (e) {
      this.setData({ err: (e && e.message) || '生成失败' })
    } finally {
      this.setData({ busy: false })
    }
  },

  async saveAlbum() {
    const u = this.data.resultUrl
    if (!u) return
    const r = await videoAi.saveVideoToAlbum(u)
    wx.showToast({ title: r.ok ? '已保存' : r.message || '保存失败', icon: r.ok ? 'success' : 'none' })
  },
})
