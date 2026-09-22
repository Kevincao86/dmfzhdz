const api = require('../../utils/api.js')
const erpNav = require('../../utils/erpNavMp.js')
const { decodeJwtSub } = require('../../utils/jwtDecode.js')
const { assetUrl } = require('../../utils/mpStaticAssets.js')
const composer = require('../../utils/agentComposerMp.js')

let agent = null
let exec = null
let confirmMp = null
let membershipMp = null
try {
  agent = require('../../utils/aiAgentMp.js')
  exec = require('../../utils/aiAgentExecutionMp.js')
  confirmMp = require('../../utils/aiAgentConfirmMp.js')
  membershipMp = require('../../utils/membershipMp.js')
} catch (e) {
  console.error('ai-agent deps', e)
}

function lastScrollId(list, sending) {
  if (sending) return 'msg-thinking'
  const last = list[list.length - 1]
  return last && last.id ? `msg-${last.id}` : ''
}

Page({
  data: {
    logoSrc: assetUrl('logo.png'),
    messages: [],
    shortcuts: [],
    shortcutsCollapsed: true,
    input: '',
    sending: false,
    hasChat: false,
    scrollTo: '',
    attachments: [],
    recordingVoice: false,
    showSendBtn: false,
    voiceMode: false,
    showPlusPanel: false,
    plusActions: composer.PLUS_ACTIONS,
  },

  onLoad() {
    if (!agent || !exec) {
      wx.showToast({ title: '助手模块需重新编译', icon: 'none', duration: 2500 })
      return
    }
    this._execState = exec.createAgentExecutionState()
    this.setData({ shortcuts: agent.AI_AGENT_SHORTCUTS || [] })
    this._recorder = composer.createRecorderManager(this)
  },

  onUnload() {
    if (this.data.recordingVoice && this._recorder) {
      composer.stopVoiceRecord(this, this._recorder, true)
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    if (!agent) return
    if (!api.isRealAuthed()) {
      this.setData({
        messages: [],
        hasChat: false,
        shortcuts: agent.AI_AGENT_SHORTCUTS || [],
      })
      return
    }
    const sub = decodeJwtSub(api.getBearerToken ? api.getBearerToken() : api.getAccessToken())
    if (sub) agent.setCurrentUserId(sub)
    const messages = agent.loadThread()
    this.setData({
      messages,
      hasChat: messages.some((m) => m.role === 'user'),
      scrollTo: lastScrollId(messages, false),
    })
    void this.refreshShortcuts()
  },

  async refreshShortcuts() {
    if (!agent) return
    try {
      const snap = membershipMp ? await membershipMp.loadMembershipSnapshot() : null
      const plan = (snap && snap.ent && snap.ent.plan) || 'free'
      this.setData({ shortcuts: agent.shortcutsForPlan(plan) })
    } catch (_) {
      this.setData({ shortcuts: agent.shortcutsForPlan('free') })
    }
  },

  persist(messages) {
    agent.saveThread(messages)
    this.setData({
      messages,
      hasChat: messages.some((m) => m.role === 'user'),
      scrollTo: lastScrollId(messages, this.data.sending),
    })
  },

  onInput(e) {
    this.setData({ input: e.detail.value }, () => composer.syncShowSendBtn(this))
  },

  onNewChat() {
    agent.clearThread()
    this._execState = exec.createAgentExecutionState()
    this.setData({
      messages: [],
      hasChat: false,
      input: '',
      sending: false,
      scrollTo: '',
      attachments: [],
      recordingVoice: false,
      showSendBtn: false,
      voiceMode: false,
      showPlusPanel: false,
    })
  },

  onToggleShortcuts() {
    this.setData({ shortcutsCollapsed: !this.data.shortcutsCollapsed })
  },

  onShortcut(e) {
    const prompt = String(e.currentTarget.dataset.prompt || '').trim()
    if (!prompt || this.data.sending) return
    this.setData({ input: prompt })
    void this.sendLine(prompt, [])
  },

  onSend() {
    if (this.data.sending || this.data.recordingVoice) return
    const line = String(this.data.input || '').trim()
    const attachments = this.data.attachments || []
    if (!line && !attachments.length) return
    void this.sendLine(line, attachments)
  },

  remainAttachSlots() {
    const max = (agent && agent.MAX_ATTACH) || 8
    return Math.max(0, max - (this.data.attachments || []).length)
  },

  async appendPicked(rows) {
    const remain = this.remainAttachSlots()
    if (!remain) {
      wx.showToast({ title: '附件已达上限', icon: 'none' })
      return
    }
    const sliced = (rows || []).slice(0, remain)
    const next = (this.data.attachments || []).slice()
    for (const row of sliced) {
      let preview = row.thumbPath || ''
      let dataUrl = ''
      if (row.kind === 'image' && row.filePath) {
        try {
          dataUrl = await agent.readFileDataUrl(row.filePath, row.contentType || 'image/jpeg')
          preview = dataUrl
        } catch (_) {
          preview = row.filePath
        }
      } else if (row.kind === 'video' && row.thumbPath) {
        try {
          dataUrl = await agent.readFileDataUrl(row.thumbPath, 'image/jpeg')
          preview = dataUrl
        } catch (_) {
          preview = row.thumbPath
        }
      }
      next.push({
        id: `att-${Date.now()}-${next.length}`,
        kind: row.kind,
        name: row.fileName || (row.kind === 'image' ? '照片' : row.kind === 'video' ? '视频' : '文件'),
        filePath: row.filePath,
        preview,
        dataUrl,
        contentType: row.contentType || '',
      })
    }
    this.setData({ attachments: next, showPlusPanel: false }, () => composer.syncShowSendBtn(this))
  },

  onRemoveAttach(e) {
    const id = e.currentTarget.dataset.id
    const next = (this.data.attachments || []).filter((a) => a.id !== id)
    this.setData({ attachments: next }, () => composer.syncShowSendBtn(this))
  },

  async onPickPhoto() {
    if (this.data.sending) return
    const remain = this.remainAttachSlots()
    if (!remain) {
      wx.showToast({ title: '附件已达上限', icon: 'none' })
      return
    }
    try {
      const rows = await composer.chooseAlbumImages(remain)
      await this.appendPicked(rows)
    } catch (e) {
      if (!/cancel/i.test((e && e.message) || '')) wx.showToast({ title: e.message || '选择失败', icon: 'none' })
    }
  },

  async onPickVideo() {
    if (this.data.sending) return
    const remain = this.remainAttachSlots()
    if (!remain) {
      wx.showToast({ title: '附件已达上限', icon: 'none' })
      return
    }
    try {
      const rows = await composer.chooseAlbumVideos(remain)
      await this.appendPicked(rows)
    } catch (e) {
      if (!/cancel/i.test((e && e.message) || '')) wx.showToast({ title: e.message || '选择失败', icon: 'none' })
    }
  },

  async onPickFile() {
    if (this.data.sending) return
    if (!this.remainAttachSlots()) {
      wx.showToast({ title: '附件已达上限', icon: 'none' })
      return
    }
    try {
      const row = await composer.chooseFile()
      const isImg = /^image\//i.test(row.contentType || '') || /\.(png|jpe?g|webp|gif)$/i.test(row.filePath || '')
      const isVid = /^video\//i.test(row.contentType || '') || /\.(mp4|mov|m4v)$/i.test(row.filePath || '')
      await this.appendPicked([
        {
          ...row,
          kind: isImg ? 'image' : isVid ? 'video' : 'file',
          thumbPath: isImg ? row.filePath : '',
        },
      ])
    } catch (e) {
      if (!/cancel/i.test((e && e.message) || '')) wx.showToast({ title: e.message || '选择失败', icon: 'none' })
    }
  },

  onTogglePlus() {
    if (this.data.sending) return
    this.setData({ showPlusPanel: !this.data.showPlusPanel, voiceMode: false })
  },

  onToggleVoiceMode() {
    if (this.data.sending) return
    if (this.data.recordingVoice) composer.stopVoiceRecord(this, this._recorder, true)
    this.setData({
      voiceMode: !this.data.voiceMode,
      showPlusPanel: false,
      recordingVoice: false,
    })
  },

  async onPlusAction(e) {
    const id = e.currentTarget.dataset.id
    if (id === 'image') await this.onPickPhoto()
    else if (id === 'camera') await this.onPickCamera()
    else if (id === 'video') await this.onPickVideo()
    else if (id === 'file') await this.onPickFile()
  },

  async onPickCamera() {
    if (this.data.sending) return
    if (!this.remainAttachSlots()) {
      wx.showToast({ title: '附件已达上限', icon: 'none' })
      return
    }
    try {
      const row = await composer.takePhoto()
      await this.appendPicked([row])
    } catch (e) {
      if (!/cancel/i.test((e && e.message) || '')) wx.showToast({ title: e.message || '拍摄失败', icon: 'none' })
    }
  },

  async onVoiceTouchStart() {
    if (this.data.sending || this.data.recordingVoice) return
    const ok = await composer.authorizeRecord()
    if (!ok) return
    this._voiceStartedAt = Date.now()
    if (!this._recorder) this._recorder = composer.createRecorderManager(this)
    composer.startVoiceRecord(this, this._recorder)
  },

  onVoiceTouchEnd() {
    if (!this.data.recordingVoice) return
    const ms = Date.now() - (this._voiceStartedAt || 0)
    composer.stopVoiceRecord(this, this._recorder, ms < 400)
    if (ms < 400) wx.showToast({ title: '说话时间太短', icon: 'none' })
  },

  async onToggleVoice() {
    this.onToggleVoiceMode()
  },

  async onVoiceRecorded(payload) {
    const path = payload && payload.filePath
    if (!path || !agent) return
    wx.showLoading({ title: '识别中…', mask: true })
    try {
      const r = await agent.transcribeVoiceTempPath(path)
      wx.hideLoading()
      if (!r.ok || !r.text) {
        wx.showToast({ title: (r && r.message) || '语音识别失败', icon: 'none' })
        return
      }
      const cur = String(this.data.input || '').trim()
      const next = cur ? `${cur} ${r.text}` : r.text
      this.setData({ input: next, voiceMode: false, showPlusPanel: false }, () => composer.syncShowSendBtn(this))
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '识别失败', icon: 'none' })
    }
  },

  onPreviewBubbleImage(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },

  async sendLine(line, attachments) {
    if (!agent || this.data.sending) return
    if (!api.requireRealAuth('/pages/ai-agent/ai-agent')) return
    const atts = Array.isArray(attachments) ? attachments : []
    const fileNote = atts
      .filter((a) => a.kind === 'file')
      .map((a) => `【附件：${a.name || '文件'}】`)
      .join(' ')
    const packed = atts
      .filter((a) => a.kind === 'image' || a.kind === 'video')
      .map((a) => ({
        kind: a.kind,
        dataUrl: a.dataUrl,
        preview: a.preview || a.dataUrl,
        name: a.name,
      }))
    const text =
      [String(line || '').trim(), fileNote].filter(Boolean).join('\n') ||
      (atts.some((a) => a.kind === 'video')
        ? '请结合附带的视频说明你的需求。'
        : atts.length
          ? '请结合附图说明你的需求。'
          : '')
    this.setData({
      input: '',
      attachments: [],
      sending: true,
      hasChat: true,
      scrollTo: 'msg-thinking',
      showSendBtn: false,
      showPlusPanel: false,
      voiceMode: false,
    })
    const history = this.data.messages.filter((m) => m.role === 'user' || m.role === 'assistant')
    try {
      const r = await agent.processAgentTurn(
        { userLine: text, history, attachments: packed },
        this._execState,
      )
      this._execState = r.executionState || this._execState
      const next = [...this.data.messages, r.userMsg, ...(r.assistantMsgs || [])]
      this.setData({ sending: false })
      this.persist(next)
    } catch (e) {
      const err = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: (e && e.message) || '发送失败，请稍后重试',
      }
      this.setData({ sending: false })
      this.persist([
        ...this.data.messages,
        {
          id: `u-${Date.now()}`,
          role: 'user',
          content: text,
          imageUrls: packed.map((a) => a.preview).filter(Boolean),
        },
        err,
      ])
    }
  },

  findPreview(id) {
    return this.data.messages.find((m) => m.id === id)
  },

  onOpenModule(e) {
    const msg = this.findPreview(e.currentTarget.dataset.id)
    const type = msg && msg.preview && msg.preview.taskType
    erpNav.openTaskPage(type || 'general')
  },

  async onConfirmPreview(e) {
    const id = e.currentTarget.dataset.id
    const msg = this.findPreview(id)
    if (!confirmMp || !msg || this.data.sending) return
    this.setData({ sending: true })
    try {
      const r = await confirmMp.confirmPreviewMessage(msg, { userBrief: msg._userBrief })
      const marked = this.data.messages.map((m) =>
        m.id === id ? Object.assign({}, m, { previewStatus: 'done' }) : m,
      )
      const note = {
        id: `a-ok-${Date.now()}`,
        role: 'assistant',
        content: (r && r.message) || (r && r.summary) || (r && r.ok ? '已执行' : '未能完成'),
      }
      this.setData({ sending: false })
      this.persist([...marked, note])
      if (r && r.navUrl) {
        const url = r.navUrl
        if (url.includes('/pages/ai-agent/') || url.includes('/pages/functions/') || url.includes('/pages/dashboard/') || url.includes('/pages/mine/')) {
          wx.switchTab({ url })
        } else {
          wx.navigateTo({ url })
        }
      }
    } catch (err) {
      this.setData({ sending: false })
      wx.showToast({ title: (err && err.message) || '确认失败', icon: 'none' })
    }
  },
})
