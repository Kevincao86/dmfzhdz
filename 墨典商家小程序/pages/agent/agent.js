const api = require('../../utils/api.js')
const aiAgent = require('../../utils/aiAgentMp.js')
const execMp = require('../../utils/aiAgentExecutionMp.js')
const registry = require('../../utils/aiModelRegistryMp.js')

const FILTER_TABS = [
  { id: 'all', short: '全部' },
  { id: 'chat', short: '对话' },
  { id: 'image', short: '生图' },
]

Page({
  data: {
    statusBarH: 44,
    headerH: 80,
    scrollBottomPad: 200,
    messages: [],
    input: '',
    busy: false,
    scrollTo: '',
    attachments: [],
    attachmentFull: false,
    recording: false,
    inputMode: 'text',
    modelMenuOpen: false,
    modelFilter: 'all',
    filterTabs: FILTER_TABS,
    modelPickerKey: registry.loadPickerKey(),
    modelShort: '模型',
    filteredModelOptions: [],
  },

  onLoad() {
    this._executionState = execMp.createAgentExecutionState()
    this.recalcLayout()
    const allModelOptions = registry.listAiModelPickerOptions()
    this._allModelOptions = allModelOptions
    this._recorder = wx.getRecorderManager()
    this._recorder.onStop((res) => {
      this.setData({ recording: false })
      void this.onVoiceStop(res.tempFilePath)
    })
    this._recorder.onError(() => {
      this.setData({ recording: false })
      wx.showToast({ title: '录音失败', icon: 'none' })
    })

    const thread = aiAgent.loadThread()
    const messages =
      thread.length > 0
        ? thread
        : [
            {
              id: 'welcome',
              role: 'assistant',
              content: '你好，我是墨典 AI 智能体。输入文字或按住说话，右侧可切换模型。',
            },
          ]

    this.setData({ messages, modelPickerKey: registry.loadPickerKey() })
    this.syncModelPickers()
  },

  recalcLayout() {
    try {
      const sys = wx.getSystemInfoSync()
      const statusBarH = sys.statusBarHeight || 44
      const headerH = statusBarH + 48
      const tabBarPx = Math.round((84 * sys.windowWidth) / 750) + (sys.safeAreaInsets?.bottom || 0)
      const dockPx = Math.round((120 * sys.windowWidth) / 750)
      const attachPx = this.data.attachments.length
        ? Math.round((88 * sys.windowWidth) / 750)
        : 0
      this.setData({
        statusBarH,
        headerH,
        scrollBottomPad: headerH + dockPx + attachPx + tabBarPx + 16,
      })
    } catch (_) {}
  },

  onShow() {
    if (!api.isAuthed()) {
      api.goLogin()
      return
    }
    void (async () => {
      try {
        const app = getApp()
        if (app && typeof app.syncMerchantSession === 'function') {
          await app.syncMerchantSession({ force: true })
        }
      } catch (_) {}
    })()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.recalcLayout()
  },

  syncModelPickers() {
    const filtered = registry.filterOptions(this._allModelOptions, this.data.modelFilter)
    let pick = filtered.find((o) => o.key === this.data.modelPickerKey)
    if (!pick) pick = filtered[0]
    const key = pick ? pick.key : registry.defaultPickerKey()
    if (pick) registry.savePickerKey(key)
    const modelShort = pick ? registry.shortLabel(pick.label) : '模型'
    this.setData({
      filteredModelOptions: filtered,
      modelPickerKey: key,
      modelShort,
      attachmentFull: this.data.attachments.length >= aiAgent.MAX_ATTACH,
    })
    this.recalcLayout()
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  onToggleInputMode() {
    const next = this.data.inputMode === 'text' ? 'voice' : 'text'
    this.setData({ inputMode: next, recording: false })
  },

  onToggleModelMenu() {
    this.setData({ modelMenuOpen: !this.data.modelMenuOpen })
  },

  onCloseModelMenu() {
    this.setData({ modelMenuOpen: false })
  },

  onSheetCatch() {},

  onFilterTab(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ modelFilter: id || 'all' })
    this.syncModelPickers()
  },

  onPickModel(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    registry.savePickerKey(key)
    const pick = this._allModelOptions.find((o) => o.key === key)
    this.setData({
      modelPickerKey: key,
      modelShort: pick ? registry.shortLabel(pick.label) : '模型',
      modelMenuOpen: false,
    })
  },

  onNewChat() {
    aiAgent.clearThread()
    this._executionState = execMp.createAgentExecutionState()
    this.setData({
      messages: [
        {
          id: 'welcome',
          role: 'assistant',
          content: '已开始新对话。',
        },
      ],
      input: '',
      attachments: [],
      attachmentFull: false,
      modelMenuOpen: false,
    })
    this.recalcLayout()
  },

  onSend() {
    const text = (this.data.input || '').trim()
    if (!text && !this.data.attachments.length) return
    this.setData({ input: '' })
    void this.sendTurn(text)
  },

  onAttach() {
    if (this.data.busy || this.data.attachmentFull) return
    const remain = aiAgent.MAX_ATTACH - this.data.attachments.length
    wx.showActionSheet({
      itemList: ['拍照', '从相册选图片', '从相册选视频'],
      success: (res) => {
        const tap = res.tapIndex
        if (tap === 0) this.pickMedia(['image'], ['camera'], remain)
        else if (tap === 1) this.pickMedia(['image'], ['album'], remain)
        else if (tap === 2) this.pickMedia(['video'], ['album'], remain)
      },
    })
  },

  pickMedia(mediaType, sourceType, count) {
    wx.chooseMedia({
      count,
      mediaType,
      sourceType,
      maxDuration: 60,
      success: async (res) => {
        const files = res.tempFiles || []
        const next = [...this.data.attachments]
        for (const f of files) {
          if (next.length >= aiAgent.MAX_ATTACH) break
          const isVideo = f.fileType === 'video' || /\.(mp4|mov|m4v)/i.test(f.tempFilePath || '')
          try {
            const previewPath = f.thumbTempFilePath || f.tempFilePath
            let dataUrl = ''
            if (isVideo) {
              if (!f.thumbTempFilePath) {
                wx.showToast({ title: '视频需首帧，请重选', icon: 'none' })
                continue
              }
              dataUrl = await aiAgent.readFileDataUrl(f.thumbTempFilePath, 'image/jpeg')
            } else {
              dataUrl = await aiAgent.readFileDataUrl(f.tempFilePath, 'image/jpeg')
            }
            next.push({
              id: `a-${Date.now()}-${next.length}`,
              kind: isVideo ? 'video' : 'image',
              preview: previewPath,
              dataUrl,
            })
          } catch (_) {
            wx.showToast({ title: '读取失败', icon: 'none' })
          }
        }
        this.setData({
          attachments: next,
          attachmentFull: next.length >= aiAgent.MAX_ATTACH,
        })
        this.recalcLayout()
      },
    })
  },

  onRemoveAttach(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const attachments = this.data.attachments.filter((_, i) => i !== idx)
    this.setData({
      attachments,
      attachmentFull: attachments.length >= aiAgent.MAX_ATTACH,
    })
    this.recalcLayout()
  },

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    const urls = []
    for (const m of this.data.messages) {
      if (m.imageUrls) urls.push(...m.imageUrls)
    }
    wx.previewImage({ current: url, urls: urls.length ? urls : [url] })
  },

  onVoiceStart() {
    if (this.data.busy || this.data.inputMode !== 'voice') return
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ recording: true })
        this._recorder.start({ format: 'mp3', sampleRate: 16000 })
      },
      fail: () => {
        wx.showModal({
          title: '需要麦克风权限',
          content: '请在设置中允许录音。',
          showCancel: false,
        })
      },
    })
  },

  onVoiceEnd() {
    if (!this.data.recording) return
    try {
      this._recorder.stop()
    } catch (_) {
      this.setData({ recording: false })
    }
  },

  async onVoiceStop(tempFilePath) {
    if (!tempFilePath) return
    wx.showLoading({ title: '识别中…' })
    const r = await aiAgent.transcribeVoiceTempPath(tempFilePath)
    wx.hideLoading()
    if (!r.ok) {
      wx.showToast({ title: r.message || '识别失败', icon: 'none' })
      return
    }
    if (this.data.inputMode === 'voice') {
      void this.sendTurn(r.text)
      return
    }
    const prev = (this.data.input || '').trim()
    this.setData({ input: prev ? `${prev} ${r.text}` : r.text })
  },

  async sendTurn(text) {
    if (this.data.busy) return
    const attachments = [...this.data.attachments]
    const line =
      String(text || '').trim() ||
      (attachments.length ? '请结合附图说明你的需求。' : '')
    if (!line && !attachments.length) return
    const pendingUser = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: line,
      imageUrls: attachments.map((a) => a.preview).filter(Boolean),
    }
    const baseMessages = this.data.messages.concat([pendingUser])
    this.setData({
      busy: true,
      attachments: [],
      attachmentFull: false,
      messages: baseMessages,
      scrollTo: `msg-${pendingUser.id}`,
      modelMenuOpen: false,
    })
    this.recalcLayout()
    try {
      const turn = await aiAgent.processAgentTurn(
        {
          userLine: text,
          history: this.data.messages,
          attachments,
          pickerKey: this.data.modelPickerKey,
          modelOptions: this._allModelOptions,
        },
        this._executionState,
      )
      this._executionState = turn.executionState || execMp.createAgentExecutionState()
      const messages = baseMessages.concat(turn.assistantMsgs || [])
      aiAgent.saveThread(messages)
      const last = messages[messages.length - 1]
      this.setData({
        messages,
        scrollTo: last ? `msg-${last.id}` : '',
      })
    } catch (e) {
      const errMsg = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: `暂时无法回复：${e.message || e}`,
      }
      this.setData({
        messages: baseMessages.concat([errMsg]),
        scrollTo: `msg-${errMsg.id}`,
      })
    } finally {
      this.setData({ busy: false })
    }
  },

  onConfirmPreview(e) {
    const id = e.currentTarget.dataset.id
    const taskType = e.currentTarget.dataset.task
    const messages = (this.data.messages || []).map((m) =>
      m.id === id ? Object.assign({}, m, { previewStatus: 'confirmed' }) : m,
    )
    this.setData({ messages })
    aiAgent.saveThread(messages)
    if (taskType === 'create_product') {
      wx.showToast({ title: '请在「功能→商品」完善并提交', icon: 'none' })
      return
    }
    if (taskType === 'recruit_influencer') {
      wx.navigateTo({ url: '/pages/recruit-hub/recruit-hub' })
    }
  },
})
