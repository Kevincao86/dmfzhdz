const relay = require('../../utils/supportRelayMp.js')

function nowTime() {
  try {
    return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch (_) {
    return ''
  }
}

/** 输入框含「人工服务」等关键词时展示人工接入按钮（与 ERP 联系客服流程一致） */
function inputWantsHumanService(text) {
  const t = String(text || '')
    .replace(/\s/g, '')
    .trim()
  return /人工服务|人工客服|转人工/.test(t)
}

Page({
  data: {
    messages: [],
    input: '',
    scrollTo: '',
    humanMode: false,
    connecting: false,
    ready: false,
    statusSub: '正在连接运营在线客服…',
  },

  onLoad(options) {
    this._sessionId = relay.getOrCreateSessionId()
    this._pollTimer = null
    this._autoHuman = options && (options.human === '1' || options.human === 'true')
    const welcome = Object.assign({}, relay.DEFAULT_BOT, { at: nowTime() })
    this.setData({ messages: [welcome] })
    if (!relay.canSupport()) {
      this.setData({
        ready: false,
        statusSub: '请在 config.release.js 配置 MERCHANT_API_BASE_URL（ECS）',
      })
      return
    }
    void this.bootstrap()
  },

  onShow() {
    if (!relay.canSupport()) return
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
    const ms = this.data.humanMode ? relay.POLL_MS_HUMAN : relay.POLL_MS
    this._pollTimer = setInterval(() => {
      void this.syncFromCloud()
    }, ms)
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
        statusSub: '已连接商家管理后台 · 小程序在线客服',
      })
    } catch (e) {
      this.setData({
        ready: false,
        statusSub: relay.formatSupportError(e),
      })
    }
  },

  async syncFromCloud() {
    if (!this._sessionId || !relay.canSupport()) return
    try {
      const cloud = await relay.fetchSessionMessages(this._sessionId)
      if (cloud.length === 0) return
      this.setMessages(relay.mergeMessages(this.data.messages, cloud))
      if (!this.data.ready) {
        this.setData({
          ready: true,
          statusSub: '已连接商家管理后台 · 小程序在线客服',
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
    const input = e.detail.value || ''
    this.setData({
      input,
      showHumanBtn: inputWantsHumanService(input),
    })
  },

  onRequestHuman() {
    if (this.data.humanMode || this.data.connecting) return
    if (!relay.canSupport()) {
      wx.showToast({ title: '未配置客服通道', icon: 'none' })
      return
    }
    this.setData({ connecting: true })
    const sysText =
      '已为您接入灵祺人工客服（达人/PR）。请直接描述问题，运营同事将在商家管理后台「小程序在线客服」中回复。'
    const bid = this.pushLocal('system', sysText)
    relay
      .sendChatLine('system', sysText, bid, this._sessionId)
      .then(() => {
        this.setData({ humanMode: true, connecting: false, showHumanBtn: false, input: '' })
        this.startPoll()
        void this.syncFromCloud()
      })
      .catch((e) => {
        this.setData({ connecting: false })
        this.pushLocal('system', (e && e.message) || '未能写入客服通道，请稍后重试')
      })
  },

  onSend() {
    const t = (this.data.input || '').trim()
    if (!t || !this.data.ready) return
    this.setData({ input: '', showHumanBtn: inputWantsHumanService(t) })
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
              '已收到您的问题。若需运营人工处理，请在输入框输入「人工服务」后点击出现的按钮接入。'
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
