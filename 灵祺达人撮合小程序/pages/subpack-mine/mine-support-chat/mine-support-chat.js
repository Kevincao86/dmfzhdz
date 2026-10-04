const relay = require('../../../utils/supportRelayMp.js')
const supportAi = require('../../../utils/talentSupportAiMp.js')
const { syncPageIdentity } = require('../../../utils/pageIdentityChrome.js')

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
    humanOpen: false,
    queueHint: '',
    ready: false,
    statusSub: '正在连接客服…',
  },

  onLoad(options) {
    this._sessionId = relay.getOrCreateSessionId()
    this._pollTimer = null
    this._pollFailCount = 0
    this._lastCloudTs = 0
    this._syncing = false
    this._pollGen = 0
    this._autoHuman = options && (options.human === '1' || options.human === 'true')
    this._supportCfg = supportAi.defaultConfig()
    this.setData({ humanOpen: supportAi.humanWindowOpen(this._supportCfg) })
    const welcome = Object.assign({}, relay.DEFAULT_BOT, {
      at: nowTime(),
      text: '你好，我是小灵同学。我会先回答你的问题；如需人工，请在 9:00–22:00 点击「进入人工客服」。',
    })
    this.setData({ messages: [welcome] })
    if (!relay.canSupport()) {
      this.setData({
        ready: false,
        statusSub: '客服暂时连不上，请稍后再试',
      })
      return
    }
    void this.bootstrap()
    void this.refreshSupportConfig()
  },

  async refreshSupportConfig() {
    const cfg = await supportAi.loadConfig()
    this._supportCfg = cfg
    const open = supportAi.humanWindowOpen(cfg)
    this.setData({
      humanOpen: open,
      queueHint: open ? '' : '人工客服服务时间为 9:00–22:00',
    })
  },

  onShow() {
    syncPageIdentity(this)
    if (!relay.canSupport()) return
    this.startPoll()
  },

  onHide() {
    // 人工会话保持轮询：切去运营台回消息时若 stop，会表现为「回来看不到、需重进」
    if (this.data.humanMode) return
    this.stopPoll()
  },

  onUnload() {
    this.stopPoll()
  },

  startPoll() {
    this.stopPoll()
    const gen = (this._pollGen || 0) + 1
    this._pollGen = gen
    const tick = () => {
      if (this._pollGen !== gen) return
      void this.syncFromCloud().finally(() => {
        if (this._pollGen !== gen) return
        const ms = this.data.humanMode ? relay.POLL_MS_HUMAN : relay.POLL_MS
        this._pollTimer = setTimeout(tick, ms)
      })
    }
    void this.syncFromCloud().finally(() => {
      if (this._pollGen !== gen) return
      const ms = this.data.humanMode ? relay.POLL_MS_HUMAN : relay.POLL_MS
      this._pollTimer = setTimeout(tick, ms)
    })
  },

  stopPoll() {
    this._pollGen = (this._pollGen || 0) + 1
    if (this._pollTimer) {
      clearTimeout(this._pollTimer)
      this._pollTimer = null
    }
  },

  async bootstrap() {
    try {
      const cloud = await relay.fetchSessionMessages(this._sessionId)
      if (cloud.length > 0) {
        this.setMessages(cloud)
        for (const m of cloud) {
          if (m && m.ts) this._lastCloudTs = Math.max(this._lastCloudTs || 0, Number(m.ts) || 0)
        }
      }
      this.setData({
        ready: true,
        statusSub: '客服已接通',
      })
      this.startPoll()
    } catch (e) {
      this.setData({
        ready: false,
        statusSub: relay.formatSupportError(e),
      })
    }
  },

  async syncFromCloud() {
    if (!this._sessionId || !relay.canSupport()) return
    if (this._syncing) return
    this._syncing = true
    try {
      const cloud = await relay.fetchSessionMessages(this._sessionId)
      this._pollFailCount = 0
      if (!cloud || cloud.length === 0) return
      const prevIds = new Set((this.data.messages || []).map((m) => m.id))
      const merged = relay.mergeMessages(this.data.messages, cloud)
      let maxTs = this._lastCloudTs || 0
      for (const m of cloud) {
        if (m && m.ts) maxTs = Math.max(maxTs, Number(m.ts) || 0)
      }
      const newOps = merged.filter((m) => m.role === 'ops' && m.id && !prevIds.has(m.id))
      const grew = merged.length !== (this.data.messages || []).length || newOps.length > 0
      if (grew || maxTs > (this._lastCloudTs || 0)) {
        this._lastCloudTs = maxTs
        this.setMessages(merged)
      }
      if (newOps.length > 0) {
        try {
          wx.vibrateShort({ type: 'light' })
        } catch (_) {}
        this.setData({ statusSub: '客服已回复' })
      } else if (!this.data.ready) {
        this.setData({
          ready: true,
          statusSub: '客服已接通',
        })
      }
    } catch (e) {
      this._pollFailCount = (this._pollFailCount || 0) + 1
      if (this._pollFailCount >= 3) {
        this.setData({
          statusSub: relay.formatSupportError(e),
        })
      }
    } finally {
      this._syncing = false
    }
  },

  setMessages(list) {
    const next = Array.isArray(list) ? list.slice() : []
    const last = next[next.length - 1]
    this.setData({
      messages: next,
      scrollTo: last && last.id ? `msg-${last.id}` : '',
    })
  },

  pushLocal(role, text, id) {
    const mid = id || relay.newMsgId()
    const msg = { id: mid, role, text, at: nowTime(), ts: Date.now() }
    const next = [...(this.data.messages || []), msg]
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
          this.setData(
            {
              humanMode: true,
              connecting: false,
              showHumanBtn: false,
              input: '',
              queueHint: ahead ? `排队中 · 前方 ${q.ahead} 人` : '已接入排队',
            },
            () => {
              this.startPoll()
              void this.syncFromCloud()
            },
          )
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
    this.setData({ input: '', showHumanBtn: inputWantsHumanService(t) })
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
