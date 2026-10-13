const userProfile = require('../../utils/userProfile.js')

const STORAGE = 'mp_feature_guide_v2'
const PAGE_URL = {
  index: '/pages/index/index',
  recommend: '/pages/recommend/recommend',
  messages: '/pages/messages/messages',
  mine: '/pages/mine/mine',
}

let session = null
let armTimer = null

function readDone() {
  try {
    const raw = wx.getStorageSync(STORAGE)
    return raw && typeof raw === 'object' ? raw : {}
  } catch (_) {
    return {}
  }
}

function writeDone(identity) {
  const done = readDone()
  done[identity] = 1
  try {
    wx.setStorageSync(STORAGE, done)
  } catch (_) {}
}

function stepsFor(identity) {
  const isPr = identity === 'pr'
  const steps = []
  if (identity === 'talent') {
    steps.push({
      page: 'index',
      anchor: 'guide-entry-eval',
      title: '达人评估提升',
      body: '点这张卡片做达人账号分析，看曝光和带货还能提升多少。',
    })
  }
  steps.push(
    {
      page: 'index',
      anchor: 'guide-entry-aiReview',
      title: 'AI合规审片',
      body: '点这张卡片，用 AI 检查成片和文稿是否合规。',
    },
    {
      page: 'index',
      anchor: 'guide-entry-calendar',
      title: '商单日历',
      body: '点这张卡片，按日期查看探店、交片和待办。',
    },
    {
      page: 'index',
      anchor: 'guide-home-orders',
      title: '报名商单',
      body: '点下方商单卡片进入详情，按页面提示提交报名。',
    },
  )
  return steps.concat([
    {
      page: 'recommend',
      anchor: isPr ? 'guide-rec-talents' : 'guide-rec-strip',
      title: isPr ? '轮播达人' : '轮播推荐',
      body: isPr ? '左右滑动查看推荐达人，点头像可以继续沟通。' : '左右滑动查看顶部轮播推荐。',
    },
    {
      page: 'recommend',
      anchor: isPr ? 'guide-pr-match' : 'guide-seg-match',
      title: '智能匹配',
      body: isPr ? '按招募单智能匹配达人，点这里切换要匹配的商单。' : '点「智能匹配」，系统按你的资料排出适合的商单。',
    },
    {
      page: 'messages',
      anchor: 'guide-msg-chat',
      title: '私聊',
      body: '「私信」是一对一私聊。点开一条会话即可回复。',
    },
    {
      page: 'messages',
      anchor: 'guide-msg-group',
      title: '群聊',
      body: '「群聊」用来跟进合作群，查看群消息并回复。',
    },
    {
      page: 'mine',
      anchor: 'guide-accountBind',
      title: '账号绑定',
      body: '在这里绑定微信、抖音、手机号和邮箱。',
    },
    {
      page: 'mine',
      anchor: 'guide-affiliatePortal',
      title: '我的推广',
      body: '在这里查看推广码、佣金和商户明细。',
    },
    {
      page: 'mine',
      anchor: 'guide-addonsHub',
      title: '增值服务',
      body: '这是 AI 创作工坊，里面有短视频、数字人、视觉工坊和云剪。',
    },
  ])
}

Component({
  properties: {
    page: { type: String, value: '' },
  },
  data: {
    on: false,
    stepNo: 1,
    total: 1,
    title: '',
    body: '',
    last: false,
    holeTop: 0,
    holeLeft: 0,
    holeW: 0,
    holeH: 0,
    cardTop: 120,
  },
  lifetimes: {
    attached() {
      this._alive = true
      this.sync()
    },
    detached() {
      this._alive = false
    },
  },
  pageLifetimes: {
    show() {
      this._alive = true
      this.sync()
    },
  },
  methods: {
    preventMove() {},

    sync() {
      const identity = userProfile.readIdentity() || 'talent'
      if (readDone()[identity]) {
        if (this.data.on) this.setData({ on: false })
        return
      }
      if (session && session.identity === identity) {
        this.reveal()
        return
      }
      if (this.properties.page !== 'index' || armTimer || session) return
      armTimer = setTimeout(() => {
        armTimer = null
        const current = userProfile.readIdentity() || identity
        if (readDone()[current]) return
        session = { identity: current, step: 0, steps: stepsFor(current) }
        if (this._alive && this.properties.page === 'index') this.reveal()
      }, 4500)
    },

    currentStep() {
      if (!session) return null
      return session.steps[session.step] || null
    },

    reveal() {
      const step = this.currentStep()
      if (!step || step.page !== this.properties.page) {
        if (this.data.on) this.setData({ on: false })
        return
      }
      const page = getCurrentPages().slice(-1)[0]
      if (page && page.setData) page.setData({ featureGuideAnchor: step.anchor })
      this._tries = 0
      setTimeout(() => this.measure(step), 280)
    },

    measure(step) {
      if (!this._alive || !session) return
      const page = getCurrentPages().slice(-1)[0]
      const query = page ? wx.createSelectorQuery().in(page) : wx.createSelectorQuery()
      query.select('#' + step.anchor).boundingClientRect()
      query.exec((res) => {
        const rect = res && res[0]
        if (!rect || rect.width < 4 || rect.height < 4) {
          this._tries = (this._tries || 0) + 1
          if (this._tries < 4) {
            setTimeout(() => this.measure(step), 350)
            return
          }
          this.advance(true)
          return
        }
        const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        const winH = Number(win.windowHeight) || 700
        const cardH = 168
        const below = rect.bottom + 12
        const cardTop = below + cardH < winH - 72 ? below : Math.max(16, rect.top - cardH - 12)
        this.setData({
          on: true,
          stepNo: session.step + 1,
          total: session.steps.length,
          title: step.title,
          body: step.body,
          last: session.step >= session.steps.length - 1,
          holeTop: rect.top - 4,
          holeLeft: rect.left - 4,
          holeW: rect.width + 8,
          holeH: rect.height + 8,
          cardTop,
        })
      })
    },

    finish() {
      const identity = (session && session.identity) || userProfile.readIdentity() || 'talent'
      writeDone(identity)
      session = null
      this.setData({ on: false })
    },

    onSkip() {
      this.finish()
    },

    onNext() {
      this.advance(false)
    },

    advance(auto) {
      if (!session) {
        this.finish()
        return
      }
      if (!auto && session.step >= session.steps.length - 1) {
        this.finish()
        return
      }
      session.step += 1
      if (session.step >= session.steps.length) {
        this.finish()
        return
      }
      const step = session.steps[session.step]
      this.setData({ on: false })
      if (step.page !== this.properties.page) {
        wx.switchTab({ url: PAGE_URL[step.page] })
        return
      }
      this.reveal()
    },
  },
})
