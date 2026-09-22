const api = require('../../utils/api.js')
const erpNav = require('../../utils/erpNavMp.js')
const { decodeJwtSub } = require('../../utils/jwtDecode.js')
const { assetUrl } = require('../../utils/mpStaticAssets.js')

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
  },

  onLoad() {
    if (!agent || !exec) {
      wx.showToast({ title: '助手模块需重新编译', icon: 'none', duration: 2500 })
      return
    }
    this._execState = exec.createAgentExecutionState()
    this.setData({ shortcuts: agent.AI_AGENT_SHORTCUTS || [] })
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
    this.setData({ input: e.detail.value })
  },

  onNewChat() {
    agent.clearThread()
    this._execState = exec.createAgentExecutionState()
    this.setData({ messages: [], hasChat: false, input: '', sending: false, scrollTo: '' })
  },

  onToggleShortcuts() {
    this.setData({ shortcutsCollapsed: !this.data.shortcutsCollapsed })
  },

  onShortcut(e) {
    const prompt = String(e.currentTarget.dataset.prompt || '').trim()
    if (!prompt || this.data.sending) return
    this.setData({ input: prompt })
    void this.sendLine(prompt)
  },

  onSend() {
    const line = String(this.data.input || '').trim()
    if (!line || this.data.sending) return
    void this.sendLine(line)
  },

  async sendLine(line) {
    if (!agent || this.data.sending) return
    if (!api.requireRealAuth('/pages/ai-agent/ai-agent')) return
    this.setData({ input: '', sending: true, hasChat: true, scrollTo: 'msg-thinking' })
    const history = this.data.messages.filter((m) => m.role === 'user' || m.role === 'assistant')
    try {
      const r = await agent.processAgentTurn({ userLine: line, history }, this._execState)
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
        { id: `u-${Date.now()}`, role: 'user', content: line },
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
