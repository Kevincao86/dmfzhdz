const api = require('../../utils/api.js')
const erpNav = require('../../utils/erpNavMp.js')
const { decodeJwtSub } = require('../../utils/jwtDecode.js')
const { assetUrl } = require('../../utils/mpStaticAssets.js')
const composer = require('../../utils/agentComposerMp.js')
const sessionSync = require('../../utils/merchantSessionSyncMp.js')

let agent = null
let exec = null
let confirmMp = null
let membershipMp = null
let previewMp = null
try {
  agent = require('../../utils/aiAgentMp.js')
  exec = require('../../utils/aiAgentExecutionMp.js')
  confirmMp = require('../../utils/aiAgentConfirmMp.js')
  membershipMp = require('../../utils/membershipMp.js')
  previewMp = require('../../utils/aiAgentPreviewMp.js')
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
    thinkingText: '正在生成…',
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
    this._runId = 0
    this._requestTask = null
    this._stopped = false
    this.setData({ shortcuts: agent.AI_AGENT_SHORTCUTS || [] })
    this._recorder = composer.createRecorderManager(this)
  },

  onUnload() {
    this.abortPendingRequest()
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
    const messages = (agent.loadThread() || []).map((m) =>
      previewMp && previewMp.ensureRecruitWizard ? previewMp.ensureRecruitWizard(m) : m,
    )
    this.setData({
      messages,
      hasChat: messages.some((m) => m.role === 'user'),
      scrollTo: lastScrollId(messages, false),
    })
    void this.refreshShortcuts()
    void sessionSync.syncFromCloud({ force: true }).catch(() => {})
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

  abortPendingRequest() {
    this._stopped = true
    this._runId = (this._runId || 0) + 1
    const task = this._requestTask
    this._requestTask = null
    if (task && typeof task.abort === 'function') {
      try {
        task.abort()
      } catch (_) {}
    }
  },

  onStop() {
    if (!this.data.sending) return
    this.abortPendingRequest()
    const list = this.data.messages || []
    const last = list[list.length - 1]
    const next =
      last && last.role === 'assistant' && last.content === '已停止生成。'
        ? list
        : [...list, { id: `a-stop-${Date.now()}`, role: 'assistant', content: '已停止生成。' }]
    this.persist(next, { sending: false, thinkingText: '正在生成…' })
  },

  persist(messages, extra) {
    agent.saveThread(messages)
    const sending = extra && extra.sending != null ? extra.sending : this.data.sending
    this.setData(
      Object.assign(
        {
          messages,
          hasChat: messages.some((m) => m.role === 'user'),
          scrollTo: lastScrollId(messages, sending),
        },
        extra || {},
      ),
    )
  },

  onInput(e) {
    this.setData({ input: e.detail.value }, () => composer.syncShowSendBtn(this))
  },

  onInputFocus() {
    if (this.data.showPlusPanel) this.setData({ showPlusPanel: false })
  },

  onNewChat() {
    this.abortPendingRequest()
    agent.clearThread()
    this._execState = exec.createAgentExecutionState()
    this.setData({
      messages: [],
      hasChat: false,
      input: '',
      sending: false,
      thinkingText: '正在生成…',
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
        } catch (_) {}
        preview = row.filePath
      } else if (row.kind === 'video' && row.thumbPath) {
        try {
          dataUrl = await agent.readFileDataUrl(row.thumbPath, 'image/jpeg')
        } catch (_) {}
        preview = row.thumbPath
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
    const next = !this.data.showPlusPanel
    if (next) {
      try {
        wx.hideKeyboard({ complete: () => {} })
      } catch (_) {}
    }
    this.setData({ showPlusPanel: next, voiceMode: false })
  },

  onToggleVoiceMode() {
    if (this.data.sending) return
    if (this.data.recordingVoice) composer.stopVoiceRecord(this, this._recorder, true)
    const next = !this.data.voiceMode
    this.setData({
      voiceMode: next,
      showPlusPanel: false,
      recordingVoice: false,
    })
    if (!next) return
    this._recordReady = false
    void composer.authorizeRecord().then((ok) => {
      this._recordReady = !!ok
      if (!ok && this.data.voiceMode) this.setData({ voiceMode: false })
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

  onVoiceTouchStart() {
    if (this.data.sending || this.data.recordingVoice) return
    if (!this._recordReady) {
      wx.showToast({ title: '请先允许麦克风，再按住说话', icon: 'none' })
      void composer.authorizeRecord().then((ok) => {
        this._recordReady = !!ok
      })
      return
    }
    this._voiceHolding = true
    this._voiceStartedAt = Date.now()
    if (!this._recorder) this._recorder = composer.createRecorderManager(this)
    composer.startVoiceRecord(this, this._recorder)
  },

  onVoiceTouchEnd() {
    const holding = this._voiceHolding
    this._voiceHolding = false
    if (!holding && !this.data.recordingVoice) return
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
      if (this.data.sending) {
        this.setData({ input: next, showPlusPanel: false }, () => composer.syncShowSendBtn(this))
        wx.showToast({ title: '上一条还在生成，已写入输入框', icon: 'none' })
        return
      }
      await this.sendLine(next, this.data.attachments || [])
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
    const history = this.data.messages.filter((m) => m.role === 'user' || m.role === 'assistant')
    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      imageUrls: packed.map((a) => a.preview).filter(Boolean),
    }
    const wantImage = agent.shouldRouteToNativeImage
      ? agent.shouldRouteToNativeImage('', text, packed.some((a) => a.kind === 'image'))
      : /美化|修图|生成|生图|海报|图片|照片|门头|菜品|美食/.test(text)
    this._stopped = false
    const runId = (this._runId || 0) + 1
    this._runId = runId
    this.persist([...this.data.messages, userMsg], {
      input: '',
      attachments: [],
      sending: true,
      thinkingText:
        wantImage || packed.some((a) => a.kind === 'image') ? '正在用 AI 模型出图…' : '正在生成…',
      showSendBtn: false,
      showPlusPanel: false,
      voiceMode: false,
    })
    try {
      await sessionSync.syncFromCloud({ force: true })
    } catch (_) {}
    try {
      const r = await agent.processAgentTurn(
        {
          userLine: text,
          history,
          attachments: packed,
          requestOpts: {
            onRequestTask: (task) => {
              this._requestTask = task
            },
          },
        },
        this._execState,
      )
      if (this._runId !== runId || this._stopped) return
      this._execState = r.executionState || this._execState
      this._requestTask = null
      this.persist([...(this.data.messages || []), ...(r.assistantMsgs || [])], { sending: false })
    } catch (e) {
      if (this._runId !== runId || this._stopped || (agent.isAbortError && agent.isAbortError(e))) {
        this.setData({ sending: false })
        return
      }
      const err = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: (e && e.message) || '发送失败，请稍后重试',
      }
      this.persist([...(this.data.messages || []), err], { sending: false })
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

  patchUploadSheet(id, slot, patch) {
    const messages = (this.data.messages || []).map((m) => {
      if (m.id !== id || !Array.isArray(m.uploadSheets)) return m
      return Object.assign({}, m, {
        uploadSheets: m.uploadSheets.map((s) =>
          s.slotKey === slot ? Object.assign({}, s, { form: Object.assign({}, s.form, patch) }) : s,
        ),
      })
    })
    this.setData({ messages })
  },

  onUploadField(e) {
    const id = e.currentTarget.dataset.id
    const slot = e.currentTarget.dataset.slot
    const field = e.currentTarget.dataset.field
    if (!id || !slot || !field) return
    this.patchUploadSheet(id, slot, { [field]: e.detail.value })
  },

  onUploadDate(e) {
    const id = e.currentTarget.dataset.id
    const slot = e.currentTarget.dataset.slot
    const field = e.currentTarget.dataset.field
    if (!id || !slot || !field) return
    this.patchUploadSheet(id, slot, { [field]: e.detail.value, saleUnlimited: false })
  },

  onPickProductHead(e) {
    const id = e.currentTarget.dataset.id
    const slot = e.currentTarget.dataset.slot
    if (!id || !slot) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (path) this.patchUploadSheet(id, slot, { headLocal: path, headUrl: '' })
      },
    })
  },

  async onGenProductHead(e) {
    const id = e.currentTarget.dataset.id
    const slot = e.currentTarget.dataset.slot
    const name = e.currentTarget.dataset.name || '团购商品'
    if (!id || !slot || !agent || !agent.postAiAgentNativeImage) return
    wx.showLoading({ title: '生成主图…', mask: true })
    try {
      const r = await agent.postAiAgentNativeImage(
        `${name} 商品主图，真实摄影，干净背景，不要文字和水印`,
        '',
      )
      this.patchUploadSheet(id, slot, { headLocal: (r && r.imageUrl) || '', headUrl: '' })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '生图失败', icon: 'none' })
    } finally {
      try {
        wx.hideLoading()
      } catch (_) {}
    }
  },

  onToggleUseAllDay(e) {
    const id = e.currentTarget.dataset.id
    const slot = e.currentTarget.dataset.slot
    if (!id || !slot) return
    const msg = (this.data.messages || []).find((m) => m.id === id)
    const sheet = msg && (msg.uploadSheets || []).find((s) => s.slotKey === slot)
    const on = !(sheet && sheet.form && sheet.form.useAllDay)
    this.patchUploadSheet(id, slot, { useAllDay: on })
  },

  onToggleProductPlatform(e) {
    const id = e.currentTarget.dataset.id
    const plat = e.currentTarget.dataset.plat
    if (!id || !plat) return
    const messages = (this.data.messages || []).map((m) => {
      if (m.id !== id || !Array.isArray(m.previewPlatforms)) return m
      return Object.assign({}, m, {
        previewPlatforms: m.previewPlatforms.map((p) =>
          p.id === plat ? Object.assign({}, p, { checked: !p.checked }) : p,
        ),
      })
    })
    this.persist(messages)
  },

  replacePreview(id, nextMsg) {
    const messages = (this.data.messages || []).map((m) => (m.id === id ? nextMsg : m))
    this.setData({ messages })
  },

  onRecruitField(e) {
    const id = e.currentTarget.dataset.id
    const field = e.currentTarget.dataset.field
    const bucket = e.currentTarget.dataset.bucket || 'scope'
    const msg = this.findPreview(id)
    const brief = msg && msg.preview && msg.preview.recruitmentBrief
    if (!brief || !field) return
    const value = e.detail.value
    let nextBrief
    if (bucket === 'budget') {
      nextBrief = Object.assign({}, brief, {
        wizardBudget: Object.assign({}, brief.wizardBudget, { [field]: value }),
      })
    } else {
      const scope = Object.assign({}, brief.wizardScope, { [field]: value })
      nextBrief = Object.assign({}, brief, {
        wizardScope: scope,
        mainProductName: field === 'mainProductName' ? value : brief.mainProductName,
      })
    }
    this.replacePreview(
      id,
      Object.assign({}, msg, { preview: Object.assign({}, msg.preview, { recruitmentBrief: nextBrief }) }),
    )
  },

  onRecruitPlatform(e) {
    const id = e.currentTarget.dataset.id
    const plat = e.currentTarget.dataset.plat
    const msg = this.findPreview(id)
    const brief = msg && msg.preview && msg.preview.recruitmentBrief
    if (!brief || !plat) return
    const scope = Object.assign({}, brief.wizardScope)
    if (plat === 'douyin') scope.platformDouyin = !scope.platformDouyin
    if (plat === 'xhs') scope.platformXhs = !scope.platformXhs
    if (!scope.platformDouyin && !scope.platformXhs) {
      wx.showToast({ title: '至少选一个平台', icon: 'none' })
      return
    }
    const platforms = []
    if (scope.platformDouyin) platforms.push('抖音')
    if (scope.platformXhs) platforms.push('小红书')
    scope.platforms = platforms
    scope.platform = platforms[0] || '抖音'
    const nextBrief = Object.assign({}, brief, { wizardScope: scope })
    this.replacePreview(
      id,
      Object.assign({}, msg, { preview: Object.assign({}, msg.preview, { recruitmentBrief: nextBrief }) }),
    )
  },

  onRecruitForm(e) {
    const id = e.currentTarget.dataset.id
    const form = e.currentTarget.dataset.form
    const msg = this.findPreview(id)
    const brief = msg && msg.preview && msg.preview.recruitmentBrief
    if (!brief || !form) return
    const nextBrief = Object.assign({}, brief, {
      wizardScope: Object.assign({}, brief.wizardScope, { contentForm: form }),
    })
    this.replacePreview(
      id,
      Object.assign({}, msg, { preview: Object.assign({}, msg.preview, { recruitmentBrief: nextBrief }) }),
    )
  },

  async onRecruitNext(e) {
    const id = e.currentTarget.dataset.id
    const msg = this.findPreview(id)
    if (!previewMp || !msg || this.data.sending) return
    const step = (msg.preview.recruitmentBrief && msg.preview.recruitmentBrief.wizardStep) || 1
    if (step === 2) wx.showLoading({ title: '整理拍摄要点…', mask: true })
    try {
      const r = await previewMp.advanceRecruitWizard(msg)
      if (!r || !r.ok) {
        wx.showToast({ title: (r && r.message) || '请先补全', icon: 'none' })
        return
      }
      this.persist((this.data.messages || []).map((m) => (m.id === id ? r.msg : m)))
    } finally {
      try {
        wx.hideLoading()
      } catch (_) {}
    }
  },

  onRecruitBack(e) {
    const id = e.currentTarget.dataset.id
    const msg = this.findPreview(id)
    if (!previewMp || !msg) return
    const next = previewMp.backRecruitWizard(msg)
    this.persist((this.data.messages || []).map((m) => (m.id === id ? next : m)))
  },

  async onConfirmPreview(e) {
    const id = e.currentTarget.dataset.id
    const mode = e.currentTarget.dataset.mode || ''
    const msg = this.findPreview(id)
    if (!confirmMp || !msg || this.data.sending) return
    const recruitStep = msg.preview && msg.preview.recruitmentBrief && msg.preview.recruitmentBrief.wizardStep
    if (msg.preview && msg.preview.taskType === 'recruit_influencer' && recruitStep && recruitStep < 4) {
      wx.showToast({ title: '请先完成四步确认', icon: 'none' })
      return
    }
    const hasChips = Array.isArray(msg.previewPlatforms)
    const platforms = hasChips ? msg.previewPlatforms.filter((p) => p.checked).map((p) => p.id) : undefined
    this.setData({ sending: true })
    try {
      const r = await confirmMp.confirmPreviewMessage(msg, {
        userBrief: msg._userBrief,
        mode: mode === 'submit' ? 'submit' : mode === 'draft' ? 'draft' : undefined,
        platforms,
      })
      const isProduct = msg.preview && msg.preview.taskType === 'create_product'
      const marked = this.data.messages.map((m) =>
        m.id === id && r && r.ok ? Object.assign({}, m, { previewStatus: 'done' }) : m,
      )
      const note = {
        id: `a-ok-${Date.now()}`,
        role: 'assistant',
        content: (r && r.message) || (r && r.summary) || (r && r.ok ? '已执行' : '未能完成'),
      }
      this.setData({ sending: false })
      this.persist([...marked, note])
      if (isProduct) return
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
