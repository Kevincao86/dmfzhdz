const api = require('../../utils/api.js')
const aiAgent = require('../../utils/aiAgentMp.js')
const execMp = require('../../utils/aiAgentExecutionMp.js')
const previewMp = require('../../utils/aiAgentPreviewMp.js')
const confirmMp = require('../../utils/aiAgentConfirmMp.js')
const erpNav = require('../../utils/erpNavMp.js')
const registry = require('../../utils/aiModelRegistryMp.js')
const composerMp = require('../../utils/agentComposerMp.js')
const habitsMp = require('../../utils/agentUserHabitsMp.js')
const supabaseRest = require('../../utils/supabaseRest.js')
const mpEdition = require('../../utils/mpAppEdition.js')

const FILTER_TABS = [
  { id: 'all', short: '全部' },
  { id: 'chat', short: '对话' },
  { id: 'image', short: '生图' },
]

const AGENT_WELCOME =
  '你好！我是灵祺小助理，我可以帮你快速创建各类产品文案和招聘需求文案（Brief）。请告诉我你的需求吧~'

function hasUserChat(messages) {
  return (messages || []).some((m) => m.role === 'user')
}

function patchPreviewConfirmed(messages, id) {
  return (messages || []).map((m) =>
    m.id === id ? Object.assign({}, m, { previewStatus: 'confirmed' }) : m,
  )
}

function appendTaskResult(messages, content, extra) {
  const msg = Object.assign(
    {
      id: `tr-${Date.now()}`,
      role: 'task_result',
      content: String(content || '').trim() || '任务已完成。',
    },
    extra || {},
  )
  return (messages || []).concat([msg])
}

function buildAgentUserLine(text, attachments) {
  const parts = []
  const base = String(text || '').trim()
  if (base) parts.push(base)
  for (const a of attachments || []) {
    if (a.kind === 'location') {
      const name = a.locationName || '位置'
      const addr = a.text ? `\n${a.text}` : ''
      parts.push(`📍 ${name}${addr}`)
    } else if (a.kind === 'file') {
      parts.push(`[文件] ${a.fileName || '附件'}`)
    }
  }
  const hasMedia = (attachments || []).some((a) => a.kind === 'image' || a.kind === 'video')
  if (!parts.length && hasMedia) return '请结合附图说明你的需求。'
  if (!parts.length && (attachments || []).length) return '请结合附件说明你的需求。'
  return parts.join('\n\n')
}

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
    inputFocused: false,
    showPlusPanel: false,
    plusActions: composerMp.PLUS_ACTIONS,
    shortcuts: aiAgent.AI_AGENT_SHORTCUTS,
    shortcutsOpen: false,
    hasChat: false,
    confirmingPreviewId: '',
    agentTitle: '灵祺小助理',
  },

  onLoad() {
    this._executionState = execMp.createAgentExecutionState()
    this.recalcLayout()
    this.setData({ agentTitle: mpEdition.agentTopTitle(mpEdition.getEdition()) })
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
              content: AGENT_WELCOME,
              isWelcome: true,
            },
          ]

    this.setData({ messages, modelPickerKey: registry.loadPickerKey(), hasChat: hasUserChat(messages) })
    this.syncModelPickers()
    void this.bootstrapAgentUserState()
  },

  async bootstrapAgentUserState() {
    if (!api.isRealAuthed()) return
    try {
      const uid = await supabaseRest.fetchAuthUserId()
      if (!uid) return
      aiAgent.setCurrentUserId(uid)
      await aiAgent.syncAgentStateFromCloud()
      const habits = habitsMp.loadAgentUserHabits(uid)
      if (habits.preferredModelPickerKey) {
        const opts = this._allModelOptions || registry.listAiModelPickerOptions()
        if (opts.some((o) => o.key === habits.preferredModelPickerKey)) {
          registry.savePickerKey(habits.preferredModelPickerKey)
          this.setData({ modelPickerKey: habits.preferredModelPickerKey })
        }
      }
      const thread = aiAgent.loadThread()
      if (thread.length) {
        this.setData({
          messages: thread,
          hasChat: hasUserChat(thread),
        })
      }
      this.syncModelPickers()
    } catch (_) {}
  },

  recalcLayout() {
    try {
      const sys = wx.getSystemInfoSync()
      const statusBarH = sys.statusBarHeight || 44
      const headerH = statusBarH + 44
      const tabBarPx = Math.round((84 * sys.windowWidth) / 750) + (sys.safeAreaInsets?.bottom || 0)
      const dockPx = Math.round((108 * sys.windowWidth) / 750)
      const plusPx = this.data.showPlusPanel ? Math.round((200 * sys.windowWidth) / 750) : 0
      const shortcutPx = !this.data.hasChat
        ? this.data.shortcutsOpen
          ? Math.round((180 * sys.windowWidth) / 750)
          : Math.round((72 * sys.windowWidth) / 750)
        : 0
      const attachPx = this.data.attachments.length
        ? Math.round((88 * sys.windowWidth) / 750)
        : 0
      this.setData({
        statusBarH,
        headerH,
        scrollBottomPad: headerH + dockPx + attachPx + plusPx + shortcutPx + tabBarPx + 16,
      })
    } catch (_) {}
  },

  onShow() {
    if (!api.canAccessTabBar()) {
      api.goLogin()
      return
    }
    void (async () => {
      try {
        const app = getApp()
        if (app && typeof app.syncMerchantSession === 'function') {
          await app.syncMerchantSession({ force: true })
        }
        await this.bootstrapAgentUserState()
      } catch (_) {}
    })()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.setData({ agentTitle: mpEdition.agentTopTitle(mpEdition.getEdition()) })
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

  onInputFocus() {
    this.setData({ inputFocused: true, showPlusPanel: false })
  },

  onInputBlur() {
    this.setData({ inputFocused: false })
  },

  onTogglePlus() {
    if (this.data.busy) return
    const next = !this.data.showPlusPanel
    this.setData({ showPlusPanel: next, modelMenuOpen: false })
    this.recalcLayout()
  },

  onPlusAction(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.busy || this.data.attachmentFull) return
    this.setData({ showPlusPanel: false })
    this.recalcLayout()
    if (id === 'image') void this.pickPlusMedia(composerMp.chooseAlbumMedia)
    else if (id === 'camera') void this.pickPlusMedia(composerMp.takePhoto)
    else if (id === 'location') void this.pickPlusLocation()
    else if (id === 'file') void this.pickPlusFile()
  },

  async pickPlusMedia(fn) {
    try {
      const picked = await fn()
      await this.addMediaAttachment(picked)
    } catch (e) {
      if (String(e.message || e) !== 'cancel') {
        wx.showToast({ title: String(e.message || '操作失败').slice(0, 20), icon: 'none' })
      }
    }
  },

  async pickPlusLocation() {
    try {
      const loc = await composerMp.chooseLocation()
      const next = [...this.data.attachments]
      if (next.length >= aiAgent.MAX_ATTACH) {
        wx.showToast({ title: '附件已达上限', icon: 'none' })
        return
      }
      next.push({
        id: `loc-${Date.now()}`,
        kind: 'location',
        preview: '',
        locationName: loc.locationName,
        text: loc.text,
        latitude: loc.latitude,
        longitude: loc.longitude,
      })
      this.setData({
        attachments: next,
        attachmentFull: next.length >= aiAgent.MAX_ATTACH,
      })
      this.recalcLayout()
    } catch (e) {
      if (String(e.message || e) !== 'cancel') {
        wx.showToast({ title: String(e.message || '位置失败').slice(0, 20), icon: 'none' })
      }
    }
  },

  async pickPlusFile() {
    try {
      const file = await composerMp.chooseFile()
      const next = [...this.data.attachments]
      if (next.length >= aiAgent.MAX_ATTACH) {
        wx.showToast({ title: '附件已达上限', icon: 'none' })
        return
      }
      next.push({
        id: `file-${Date.now()}`,
        kind: 'file',
        preview: '',
        fileName: file.fileName,
        filePath: file.filePath,
        contentType: file.contentType,
      })
      this.setData({
        attachments: next,
        attachmentFull: next.length >= aiAgent.MAX_ATTACH,
      })
      this.recalcLayout()
    } catch (e) {
      if (String(e.message || e) !== 'cancel') {
        wx.showToast({ title: String(e.message || '文件失败').slice(0, 20), icon: 'none' })
      }
    }
  },

  async addMediaAttachment(picked) {
    const next = [...this.data.attachments]
    if (next.length >= aiAgent.MAX_ATTACH) {
      wx.showToast({ title: '附件已达上限', icon: 'none' })
      return
    }
    const isVideo = picked.kind === 'video'
    try {
      const previewPath = picked.thumbPath || picked.filePath
      let dataUrl = ''
      if (isVideo) {
        if (!picked.thumbPath) {
          wx.showToast({ title: '视频需首帧，请重选', icon: 'none' })
          return
        }
        dataUrl = await aiAgent.readFileDataUrl(picked.thumbPath, 'image/jpeg')
      } else {
        dataUrl = await aiAgent.readFileDataUrl(picked.filePath, picked.contentType || 'image/jpeg')
      }
      next.push({
        id: `a-${Date.now()}-${next.length}`,
        kind: isVideo ? 'video' : 'image',
        preview: previewPath,
        dataUrl,
      })
      this.setData({
        attachments: next,
        attachmentFull: next.length >= aiAgent.MAX_ATTACH,
      })
      this.recalcLayout()
    } catch (_) {
      wx.showToast({ title: '读取失败', icon: 'none' })
    }
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
    const uid = aiAgent.getCurrentUserId()
    if (uid) {
      habitsMp.recordAgentUserInteraction(uid, { modelPickerKey: key })
    }
    this.setData({
      modelPickerKey: key,
      modelShort: pick ? registry.shortLabel(pick.label) : '模型',
      modelMenuOpen: false,
    })
  },

  onOpenComposerModelMenu() {
    if (this.data.busy) return
    this.setData({ modelMenuOpen: true, showPlusPanel: false })
  },

  onOpenHeaderMenu() {
    wx.showActionSheet({
      itemList: ['新对话', '切换模型'],
      success: (res) => {
        if (res.tapIndex === 0) this.onNewChat()
        else if (res.tapIndex === 1) this.onOpenComposerModelMenu()
      },
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
          content: AGENT_WELCOME,
          isWelcome: true,
        },
      ],
      input: '',
      attachments: [],
      attachmentFull: false,
      modelMenuOpen: false,
      showPlusPanel: false,
      hasChat: false,
      shortcutsOpen: false,
      confirmingPreviewId: '',
    })
    this.recalcLayout()
  },

  onToggleShortcuts() {
    if (this.data.busy) return
    this.setData({ shortcutsOpen: !this.data.shortcutsOpen, showPlusPanel: false, modelMenuOpen: false })
    this.recalcLayout()
  },

  onApplyShortcut(e) {
    const type = e.currentTarget.dataset.type
    const label = e.currentTarget.dataset.label
    if (!type || !label || this.data.busy) return
    this.setData({ shortcutsOpen: false })
    void this.sendTurn(`使用快捷任务：${label}`)
  },

  onOpenTaskResultNav(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    if (url.includes('/pages/functions/') || url.includes('/pages/agent/') || url.includes('/pages/mine/')) {
      wx.switchTab({ url })
      return
    }
    wx.navigateTo({ url })
  },

  onSend() {
    const text = (this.data.input || '').trim()
    if (!text && !this.data.attachments.length) return
    this.setData({ input: '', showPlusPanel: false })
    void this.sendTurn(text)
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
    if (!api.isRealAuthed()) {
      wx.showModal({
        title: '请先登录',
        content: '灵祺小助理需登录后使用。请完成登录后再发送消息（免登录游览不支持 AI 对话）。',
        confirmText: '去登录',
        cancelText: '取消',
        success: (r) => {
          if (r.confirm) api.goLogin()
        },
      })
      return
    }
    const attachments = [...this.data.attachments]
    const line = buildAgentUserLine(text, attachments)
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
      showPlusPanel: false,
    })
    this.recalcLayout()
    try {
      const turn = await aiAgent.processAgentTurn(
        {
          userLine: line,
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
      const uid = aiAgent.getCurrentUserId()
      if (uid) {
        habitsMp.recordAgentUserInteraction(uid, {
          userText: line,
          modelPickerKey: this.data.modelPickerKey,
          taskType: aiAgent.inferTaskTypeFromText(line),
        })
      }
      const last = messages[messages.length - 1]
      this.setData({
        messages,
        scrollTo: last ? `msg-${last.id}` : '',
        hasChat: hasUserChat(messages),
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
    const previewMsg = (this.data.messages || []).find((m) => m.id === id)
    if (!previewMsg || previewMsg.previewStatus === 'confirmed' || this.data.confirmingPreviewId) return

    const title =
      (previewMsg.preview && (previewMsg.preview.title || previewMsg.preview.productPlans?.[0]?.slotLabel)) ||
      '任务'
    const lastUser = [...(this.data.messages || [])].reverse().find((m) => m.role === 'user')
    const userBrief = String((lastUser && lastUser.content) || '')
      .replace(/\[引用[\s\S]*?\n\n/, '')
      .trim()

    if (taskType === 'create_product') {
      let messages = patchPreviewConfirmed(this.data.messages, id)
      this._executionState = execMp.syncStageAfterPreviewChange(
        this._executionState || execMp.createAgentExecutionState(),
        messages,
      )
      this.setData({ messages, confirmingPreviewId: id })
      aiAgent.saveThread(messages)
      wx.showLoading({ title: '保存草稿…', mask: true })
      void confirmMp
        .confirmPreviewMessage(previewMsg, { userBrief })
        .then((result) => {
          wx.hideLoading()
          const ok = Boolean(result.ok)
          const partial = ok && Number(result.failCount) > 0
          const body = ok
            ? `「${title}」已确认。${result.summary || result.message || '已保存至商品列表草稿箱。'}`
            : `「${title}」${result.message || '保存草稿失败。'}`
          messages = appendTaskResult(messages, body, {
            resultSummary: ok ? (partial ? 'partial' : 'confirmed') : 'partial',
            navUrl: result.navUrl,
          })
          const resultLast = messages[messages.length - 1]
          this.setData({
            messages,
            confirmingPreviewId: '',
            scrollTo: resultLast ? `msg-${resultLast.id}` : '',
          })
          aiAgent.saveThread(messages)

          const plan = this._executionState && this._executionState.plan
          if (
            ok &&
            plan &&
            plan.taskTypes &&
            plan.taskTypes.includes('recruit_influencer') &&
            !execMp.hasPendingPreviewForTask(messages, 'recruit_influencer') &&
            !execMp.hasConfirmedPreviewForTask(messages, 'recruit_influencer')
          ) {
            wx.showLoading({ title: '生成招募预览…', mask: true })
            void previewMp
              .spawnRecruitPreviewAfterProductConfirm(plan)
              .then((recruitMsgs) => {
                wx.hideLoading()
                if (!recruitMsgs.length) return
                const intro = {
                  id: `a-${Date.now()}-recruit-intro`,
                  role: 'assistant',
                  content:
                    '商品方案已确认。接下来是达人招募 Brief 预览，请核对三版文案后在本卡片确认。',
                }
                messages = messages.concat([intro]).concat(recruitMsgs)
                this._executionState = execMp.syncStageAfterPreviewChange(this._executionState, messages)
                this.setData({
                  messages,
                  scrollTo: `msg-${recruitMsgs[recruitMsgs.length - 1].id}`,
                })
                aiAgent.saveThread(messages)
              })
              .catch(() => {
                wx.hideLoading()
                wx.showToast({ title: '招募预览生成失败', icon: 'none' })
              })
          }
        })
        .catch((err) => {
          wx.hideLoading()
          messages = appendTaskResult(
            this.data.messages,
            `「${title}」保存失败：${String((err && err.message) || err || '未知错误').slice(0, 120)}`,
            { resultSummary: 'partial' },
          )
          this.setData({ messages, confirmingPreviewId: '' })
          aiAgent.saveThread(messages)
        })
      return
    }

    this.setData({ confirmingPreviewId: id })
    wx.showLoading({ title: '执行中…', mask: true })
    void confirmMp
      .confirmPreviewMessage(previewMsg, { userBrief })
      .then((result) => {
        wx.hideLoading()
        let messages = this.data.messages
        if (result.ok) {
          messages = patchPreviewConfirmed(messages, id)
          this._executionState = execMp.syncStageAfterPreviewChange(
            this._executionState || execMp.createAgentExecutionState(),
            messages,
          )
        }
        const ok = Boolean(result.ok)
        const body =
          taskType === 'recruit_influencer' && ok
            ? `「${title}」已确认。${result.message || '招募订单已推送运营台（待接单）。'}`
            : ok
              ? `「${title}」已确认。${result.message || '可在对应功能模块查看结果。'}`
              : `「${title}」${result.message || '执行失败。'}`
        messages = appendTaskResult(messages, body, {
          resultSummary: ok ? 'confirmed' : 'partial',
          navUrl: result.navUrl,
          orderId: result.orderId,
        })
        const last = messages[messages.length - 1]
        this.setData({
          messages,
          confirmingPreviewId: '',
          scrollTo: last ? `msg-${last.id}` : '',
        })
        aiAgent.saveThread(messages)
      })
      .catch((err) => {
        wx.hideLoading()
        const messages = appendTaskResult(
          this.data.messages,
          `执行失败：${String((err && err.message) || err || '未知错误').slice(0, 120)}`,
          { resultSummary: 'partial', navUrl: erpNav.navForTaskType(taskType) },
        )
        const last = messages[messages.length - 1]
        this.setData({ messages, confirmingPreviewId: '', scrollTo: last ? `msg-${last.id}` : '' })
        aiAgent.saveThread(messages)
      })
  },
})
