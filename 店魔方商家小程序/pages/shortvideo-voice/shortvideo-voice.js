const api = require('../../utils/api.js')
const { requestVoiceDraft } = require('../../utils/voiceDraft.js')

Page({
  data: { recording: false, busy: false },
  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
  },
  onLoad() {
    this.rm = wx.getRecorderManager()
    this.rm.onStop((res) => {
      this.setData({ recording: false })
      void this.processFile(res.tempFilePath)
    })
    this.rm.onError(() => {
      wx.showToast({ title: '录音失败', icon: 'none' })
      this.setData({ recording: false })
    })
  },
  toggleRecord() {
    if (this.data.busy) return
    if (!this.data.recording) {
      this.setData({ recording: true })
      this.rm.start({ format: 'mp3', sampleRate: 16000 })
    } else {
      this.rm.stop()
    }
  },
  async processFile(tempFilePath) {
    this.setData({ busy: true })
    wx.showLoading({ title: '识别中…' })
    try {
      const draft = await requestVoiceDraft('shortvideo', tempFilePath)
      wx.setStorageSync('meoo_draft_shortvideo', draft)
      wx.navigateTo({ url: '/pages/shortvideo-edit/shortvideo-edit' })
    } catch (e) {
      wx.showToast({ title: '生成草稿失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ busy: false })
    }
  },
  async useMock() {
    this.setData({ busy: true })
    try {
      const draft = await requestVoiceDraft('shortvideo', 'mock')
      wx.setStorageSync('meoo_draft_shortvideo', draft)
      wx.navigateTo({ url: '/pages/shortvideo-edit/shortvideo-edit' })
    } finally {
      this.setData({ busy: false })
    }
  },
})
