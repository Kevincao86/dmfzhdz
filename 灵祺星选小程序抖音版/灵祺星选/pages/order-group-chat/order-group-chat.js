const groupChat = require('../../utils/mpOrderGroupChatApi.js')
const composer = require('../../utils/mpChatComposer.js')
const { applyCapsulePadding } = require('../../utils/navLayout.js')

Page({
  data: {
    navBarStyle: '',
    navInnerStyle: '',
    mpOrderId: '',
    groupTitle: '商单群',
    memberCount: 0,
    messages: [],
    input: '',
    scrollTo: '',
    ready: false,
    statusSub: '连接中…',
    canSend: true,
    groupClosed: false,
    sending: false,
    showPlusPanel: false,
    voiceMode: false,
    recordingVoice: false,
    plusActions: composer.PLUS_ACTIONS,
    mentionMembers: [],
    pendingMentionKeys: [],
  },
  onLoad(options) {
    applyCapsulePadding(this, null, { band: 'navBarStyle', right: 'navInnerStyle' })
    const mpOrderId = options && options.mpOrderId ? decodeURIComponent(options.mpOrderId) : ''
    this._mpOrderId = mpOrderId
    this._sinceTs = 0
    this._pollTimer = null
    this._recorder = composer.createRecorderManager(this)
    this.setData({ mpOrderId })
    void this.bootstrap()
  },
  onShow() {
    this.startPoll()
    void this.syncGroup()
  },
  onHide() {
    this.stopPoll()
  },
  onUnload() {
    this.stopPoll()
  },
  onBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/messages/messages' }) })
  },
  startPoll() {
    this.stopPoll()
    this._pollTimer = setInterval(() => {
      void this.syncGroup()
    }, groupChat.POLL_MS)
  },
  stopPoll() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  },
  async bootstrap() {
    if (!this._mpOrderId) {
      this.setData({ ready: false, statusSub: '缺少商单号' })
      return
    }
    try {
      await this.syncGroup(true)
      this.setData({ ready: true })
    } catch (e) {
      this.setData({ ready: false, statusSub: String(e.message || '加载失败').slice(0, 40) })
    }
  },
  applyGroupPayload(body) {
    const group = body && body.group
    if (!group) return
    const myKey = groupChat.myParticipantKey()
    const ui = groupChat.mapMessages(group, myKey)
    const last = ui[ui.length - 1]
    if (ui.length) {
      this._sinceTs = Math.max(this._sinceTs, ...ui.map((m) => m.ts || 0))
    }
    const closed = group.status === 'closed' || body.canSend === false
    this.setData({
      groupTitle: group.title || '商单群',
      memberCount: (group.memberParticipantKeys || []).length,
      messages: ui,
      scrollTo: last && last.id ? `msg-${last.id}` : '',
      canSend: !closed,
      groupClosed: closed,
      statusSub: closed ? '已关闭' : `${(group.memberParticipantKeys || []).length} 人`,
      mentionMembers: groupChat.mapMentionMembers(group, myKey),
    })
  },
  async syncGroup(forceScroll) {
    if (!this._mpOrderId) return
    try {
      const body = await groupChat.getGroup(this._mpOrderId)
      this.applyGroupPayload(body)
      if (forceScroll) {
        const last = (this.data.messages || [])[this.data.messages.length - 1]
        if (last && last.id) this.setData({ scrollTo: `msg-${last.id}` })
      }
    } catch (e) {
      if (!this.data.ready) throw e
    }
  },
  onInput(e) {
    this.setData({ input: e.detail.value })
  },
  onTogglePlus() {
    if (!this.data.canSend) return
    this.setData({ showPlusPanel: !this.data.showPlusPanel, voiceMode: false })
  },
  onToggleVoiceMode() {
    if (!this.data.canSend) return
    this.setData({ voiceMode: !this.data.voiceMode, showPlusPanel: false })
  },
  onVoiceTouchStart() {
    if (!this.data.canSend || this.data.sending) return
    composer.startVoiceRecord(this, this._recorder)
  },
  onVoiceTouchEnd(e) {
    const cancel = !!(e && e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY < 120)
    composer.stopVoiceRecord(this, this._recorder, cancel)
  },
  async onVoiceRecorded({ filePath, durationSec }) {
    await this.sendPayload({ kind: 'audio', filePath, contentType: 'audio/mpeg', durationSec })
  },
  onPlusAction(e) {
    const id = e.currentTarget.dataset.id
    if (!id || !this.data.canSend || this.data.sending) return
    this.setData({ showPlusPanel: false })
    if (id === 'image') void this.pickAndSend(composer.chooseAlbumImage)
    else if (id === 'camera') void this.pickAndSend(composer.takePhoto)
    else if (id === 'location') void this.sendLocation()
    else if (id === 'file') void this.pickAndSend(composer.chooseFile)
  },
  async pickAndSend(fn) {
    try {
      const picked = await fn()
      await this.sendPayload(picked)
    } catch (e) {
      if (String(e.message || e) !== 'cancel') {
        wx.showToast({ title: String(e.message || '操作失败').slice(0, 20), icon: 'none' })
      }
    }
  },
  async sendLocation() {
    try {
      const loc = await composer.chooseLocation()
      await this.sendPayload(loc, false)
    } catch (e) {
      if (String(e.message || e) !== 'cancel') {
        wx.showToast({ title: String(e.message || '位置失败').slice(0, 20), icon: 'none' })
      }
    }
  },
  resolveMentionKeys(text) {
    const keys = []
    const members = this.data.mentionMembers || []
    for (let i = 0; i < members.length; i++) {
      const m = members[i]
      if (m && m.name && String(text).includes(`@${m.name}`)) keys.push(m.key)
    }
    const pending = this.data.pendingMentionKeys || []
    for (let j = 0; j < pending.length; j++) {
      if (keys.indexOf(pending[j]) < 0) keys.push(pending[j])
    }
    return keys
  },
  onMentionSomeone() {
    const members = this.data.mentionMembers || []
    if (!members.length) {
      wx.showToast({ title: '暂无可 @ 成员', icon: 'none' })
      return
    }
    wx.showActionSheet({
      itemList: members.map((m) => `@${m.name}`),
      success: (res) => {
        const m = members[res.tapIndex]
        if (!m) return
        const input = `${this.data.input || ''}@${m.name} `.trim() + ' '
        const pending = [...(this.data.pendingMentionKeys || [])]
        if (pending.indexOf(m.key) < 0) pending.push(m.key)
        this.setData({ input, pendingMentionKeys: pending })
      },
    })
  },
  async onSend() {
    const text = String(this.data.input || '').trim()
    if (!text || !this.data.canSend || this.data.sending) return
    const mentionKeys = this.resolveMentionKeys(text)
    this.setData({ sending: true, input: '', pendingMentionKeys: [] })
    try {
      await groupChat.sendMessage(this._mpOrderId, { type: 'text', text, mentionKeys })
      await this.syncGroup(true)
    } catch (e) {
      wx.showToast({ title: String(e.message || '发送失败'), icon: 'none' })
    } finally {
      this.setData({ sending: false })
    }
  },
  async sendPayload(picked, needUpload = true) {
    if (!this.data.canSend || this.data.sending) return
    this.setData({ sending: true })
    wx.showLoading({ title: '发送中…', mask: true })
    try {
      const kind = picked.kind || 'text'
      if (kind === 'location') {
        await groupChat.sendMessage(this._mpOrderId, {
          type: 'location',
          text: picked.text || picked.locationName || '',
          latitude: picked.latitude,
          longitude: picked.longitude,
          locationName: picked.locationName || '',
        })
      } else if (needUpload !== false && picked.filePath) {
        const up = await groupChat.uploadMedia(
          picked.filePath,
          picked.contentType || composer.guessContentType(picked.filePath),
          picked.fileName,
        )
        const mediaUrl = String(up.mediaUrl || '').trim()
        if (!mediaUrl) throw new Error('上传失败')
        await groupChat.sendMessage(this._mpOrderId, {
          type: kind === 'file' ? 'file' : kind,
          mediaUrl,
          fileName: picked.fileName || '',
          durationSec: picked.durationSec || 0,
          text: picked.text || '',
        })
      }
      await this.syncGroup(true)
    } catch (e) {
      wx.showToast({ title: String(e.message || '发送失败').slice(0, 24), icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ sending: false })
    }
  },
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    const urls = (this.data.messages || [])
      .filter((m) => m.type === 'image' && m.mediaUrl)
      .map((m) => m.mediaUrl)
    wx.previewImage({ urls: urls.length ? urls : [url], current: url })
  },
  onPlayVideo(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewMedia({ sources: [{ url, type: 'video' }] })
  },
  onPlayAudio(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    if (!this._innerAudio) this._innerAudio = wx.createInnerAudioContext()
    this._innerAudio.src = url
    this._innerAudio.play()
  },
  onOpenLocation(e) {
    const lat = Number(e.currentTarget.dataset.lat)
    const lng = Number(e.currentTarget.dataset.lng)
    const name = e.currentTarget.dataset.name || '位置'
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    wx.openLocation({ latitude: lat, longitude: lng, name, scale: 16 })
  },
  onOpenFile(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.showLoading({ title: '打开中…' })
    wx.downloadFile({
      url,
      success: (res) => {
        wx.openDocument({ filePath: res.tempFilePath, showMenu: true })
      },
      fail: () => wx.showToast({ title: '无法打开文件', icon: 'none' }),
      complete: () => wx.hideLoading(),
    })
  },
})
