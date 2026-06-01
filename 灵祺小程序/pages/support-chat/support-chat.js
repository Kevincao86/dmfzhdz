const api = require('../../utils/api.js')
const relay = require('../../utils/supportRelayMp.js')

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
    ready: false,
    statusSub: '正在连接云端会话…',
  },

  onLoad() {
    this._sessionId = relay.getOrCreateSessionId()
    this._pollTimer = null
    const welcome = Object.assign({}, relay.DEFAULT_BOT, { at: nowTime() })
    this.setData({ messages: [welcome] })
    void this.bootstrap()
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
    this.setData({ connecting: true })
    const sysText = '已为您接入灵祺人工客服，请在下方直接描述问题，客服同事将在此会话中回复'
    const bid = this.pushLocal('system', sysText)
    relay
      .sendChatLine('system', sysText, bid, this._sessionId)
      .then(() => {
        this.setData({ humanMode: true, connecting: false })
      })
      .catch((e) => {
        this.setData({ connecting: false })
        this.pushLocal('system', (e && e.message) || '未能写入客服通道，请稍后重试')
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
        if (!this.data.humanMode) {
          setTimeout(() => {
            const botText =
              '已收到您的问题。若需人工深度处理（如账号异常、合同与开票），请点击「转人工服务」。'
            const bid = this.pushLocal('bot', botText)
            void relay.sendChatLine('bot', botText, bid, this._sessionId)
          }, 500)
        }
        void this.syncFromCloud()
      })
      .catch((e) => {
        this.pushLocal('system', (e && e.message) || '发送失败')
      })
  },
})
