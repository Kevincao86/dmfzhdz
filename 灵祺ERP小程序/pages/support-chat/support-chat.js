const api = require('../../utils/api.js')
const relay = require('../../utils/supportRelayMp.js')
const supportAi = require('../../utils/supportAiMp.js')

function nowTime() {
  try {
    return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch (_) {
    return ''
  }
}

Page({
  data: {
    messages: [],
    input: '',
    scrollTo: '',
    humanMode: false,
    connecting: false,
    humanOpen: false,
    queueHint: '',
    ready: false,
    statusSub: '正在连接云端会话…',
    logoSrc: require('../../utils/mpStaticAssets.js').assetUrl('logo.png'),
  },

  onLoad() {
    this._sessionId = relay.getOrCreateSessionId()
    this._pollTimer = null
    const welcome = Object.assign({}, relay.DEFAULT_BOT, { at: nowTime() })
    this.setData({ messages: [welcome] })
    void this.bootstrap()
    void this.refreshSupportConfig()
  },

  onShow() {
    if (!api.isAuthed()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    this.startPoll()
    void this.syncFromCloud()
  },

  onHide() {
    this.stopPoll()
  },

  onUnload() {
    this.stopPoll()
  },

  startPoll() {
    this.stopPoll()
    this._pollTimer = setInterval(() => {
      void this.syncFromCloud()
    }, relay.POLL_MS)
  },

  stopPoll() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  },

  async refreshSupportConfig() {
    const cfg = await supportAi.loadConfig()
    this._supportCfg = cfg
    this.setData({
      humanOpen: supportAi.humanWindowOpen(cfg),
      queueHint: supportAi.humanWindowOpen(cfg) ? '' : '人工客服服务时间为 9:00–22:00',
    })
  },

  async bootstrap() {
    try {
      const cloud = await relay.fetchSessionMessages(this._sessionId)
      if (cloud.length > 0) {
        this.setMessages(cloud)
      }
      this.setData({
        ready: true,
        statusSub: '与商家管理后台在线客服同源会话 · 云端已同步',
      })
    } catch (e) {
      const msg = e && e.message ? e.message : '连接失败'
      const hint = /relation|does not exist|42P01/i.test(msg)
        ? '请确认已执行 Supabase 迁移 support_relay_messages'
        : msg
      this.setData({
        ready: false,
        statusSub: hint,
      })
    }
  },

  async syncFromCloud() {
    if (!this._sessionId) return
    try {
      const cloud = await relay.fetchSessionMessages(this._sessionId)
      if (cloud.length === 0) return
      this.setMessages(relay.mergeMessages(this.data.messages, cloud))
      if (!this.data.ready) {
        this.setData({
          ready: true,
          statusSub: '与商家管理后台在线客服同源会话 · 云端已同步',
        })
      }
    } catch (_) {
      /* 轮询失败不打断输入 */
    }
  },

  setMessages(list) {
    const last = list[list.length - 1]
    this.setData({
      messages: list,
      scrollTo: last && last.id ? `msg-${last.id}` : '',
    })
  },

  pushLocal(role, text, id) {
    const mid = id || relay.newMsgId()
    const msg = { id: mid, role, text, at: nowTime(), ts: Date.now() }
    const next = [...this.data.messages, msg]
    this.setMessages(next)
    return mid
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  onRequestHuman() {
    if (this.data.humanMode || this.data.connecting) return
    if (!this.data.humanOpen) {
      wx.showToast({ title: '人工客服 9:00–22:00', icon: 'none' })
      return
    }
    this.setData({ connecting: true })
    supportAi
      .enqueue(this._sessionId)
      .then((q) => {
        const ahead = q && q.ahead > 0 ? `当前前方 ${q.ahead} 人，` : ''
        const sysText = `已进入人工客服排队。${ahead}客服将按顺序在本会话回复。`
        const bid = this.pushLocal('system', sysText)
        return relay.sendChatLine('system', sysText, bid, this._sessionId).then(() => {
          this.setData({ humanMode: true, connecting: false, queueHint: ahead ? `排队中 · 前方 ${q.ahead} 人` : '已接入排队' })
        })
      })
      .catch((e) => {
        this.setData({ connecting: false })
        this.pushLocal('system', (e && e.message) || '未能进入人工排队，请稍后重试')
      })
  },

  onSend() {
    const t = (this.data.input || '').trim()
    if (!t || !this.data.ready) return
    this.setData({ input: '' })
    const uid = this.pushLocal('user', t)
    relay
      .sendChatLine('user', t, uid, this._sessionId)
      .then((r) => {
        if (!r.ok) {
          this.pushLocal('system', '消息尚未送达客服通道，请稍后重试')
          return
        }
        if (!this.data.humanMode && this._supportCfg && this._supportCfg.aiEnabled !== false) {
          const history = this.data.messages
          supportAi
            .askAi(t, history, this._supportCfg)
            .then((botText) => {
              const bid = this.pushLocal('bot', botText || '已收到，请补充更具体的问题。')
              void relay.sendChatLine('bot', botText, bid, this._sessionId)
            })
            .catch((e) => {
              const detail = String((e && e.message) || '').slice(0, 80)
              const botText = detail
                ? `暂时没能回答（${detail}）。可在 9:00–22:00 点击「进入人工客服」。`
                : '已收到您的问题。人工客服时段为 9:00–22:00，可点击「进入人工客服」。'
              const bid = this.pushLocal('bot', botText)
              void relay.sendChatLine('bot', botText, bid, this._sessionId)
            })
        } else if (!this.data.humanMode) {
          const botText = '已收到您的问题。如需人工，请在 9:00–22:00 点击「进入人工客服」。'
          const bid = this.pushLocal('bot', botText)
          void relay.sendChatLine('bot', botText, bid, this._sessionId)
        }
        void this.syncFromCloud()
      })
      .catch((e) => {
        this.pushLocal('system', (e && e.message) || '发送失败')
      })
  },
})
