const feat = require('../../utils/merchantFeatureApisMp.js')
const econ = require('../../utils/mpPointsEconomicsMp.js')
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
    tip: `小程序提供口播 TTS 试听（不扣积分）。完整数字人口播成片（选形象/参数/Seedance 合成）请在电脑端商家 ERP「数字人口播」完成，成片按 ${econ.MP_POINTS_DIGITAL_HUMAN_PER_SEC} 积分/秒计费（最低 ${econ.MP_POINTS_DIGITAL_HUMAN_MIN_CHARGE} 积分，与 CS 一致）。`,
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
