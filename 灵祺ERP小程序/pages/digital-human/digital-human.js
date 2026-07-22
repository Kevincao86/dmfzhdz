const feat = require('../../utils/merchantFeatureApisMp.js')
const fs = wx.getFileSystemManager()

const VOICES = [
  { id: 'v-custom-female', label: '亲和女声' },
  { id: 'v-custom-male', label: '稳重男声' },
]

Page({
  data: {
    script: '',
    voices: VOICES,
    voiceId: VOICES[0].id,
    busy: false,
    err: '',
    playing: false,
    tip: '合成试听口播音频（与电脑端 TTS 同源）。形象成片与抖音发布请在电脑端完成。',
  },

  onUnload() {
    this.stopAudio()
  },

  onScript(e) {
    this.setData({ script: e.detail.value })
  },

  onPickVoice(e) {
    this.setData({ voiceId: e.currentTarget.dataset.id })
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
    if (text.length > 2000) {
      wx.showToast({ title: '文案过长（≤2000字）', icon: 'none' })
      return
    }
    this.setData({ busy: true, err: '' })
    void (async () => {
      const r = await feat.synthesizeDigitalHumanTts({
        text,
        voicePresetId: this.data.voiceId,
      })
      this.setData({ busy: false })
      if (!r.ok) {
        this.setData({ err: r.message || '合成失败' })
        return
      }
      this.playBase64(r.audioBase64)
      wx.showToast({ title: '已合成', icon: 'success' })
    })()
  },

  onStop() {
    this.stopAudio()
  },
})
