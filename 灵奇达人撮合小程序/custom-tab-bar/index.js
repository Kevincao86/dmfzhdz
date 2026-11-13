const userProfile = require('../utils/userProfile.js')
const identityTheme = require('../utils/identityTheme.js')
const { getTabList } = require('../utils/tabBarConfig.js')
const chatBadgeWatcher = require('../utils/chatBadgeWatcher.js')

const GUIDE_STORAGE = 'mp_menu_guide_v3'
const GUIDE_COPY = {
  talent: [
    { text: '首页', title: '首页', body: '点商单卡片即可报名商单。常用入口可进达人账号分析、我的报名、商单日历和 AI视频审核。' },
    { text: '推荐大厅', title: '推荐大厅', body: '左右滑动看顶部轮播，再点「智能匹配」，按你的资料找出适合的商单。' },
    { text: '达人账号分析', title: '达人账号分析', body: '填写账号数据后查看评分。按页面里的提升建议改资料，再回来复评。' },
    { text: '消息', title: '消息', body: '「私信」用来一对一沟通，「群聊」用来跟进合作群。点进会话即可回复。' },
    { text: '我的', title: '我的', body: '先完成账号绑定。这里还有 AI 视频审核、我的推广和 AI 创作工坊。' },
  ],
  pr: [
    { text: '首页', title: '首页', body: '点商单查看报名情况。常用入口可进达人查验、看我的发单、商单日历和 AI视频审核。' },
    { text: '推荐大厅', title: '推荐大厅', body: '左右滑动看轮播达人，并用智能匹配按招募单找到合适的达人。' },
    { text: '发招募', title: '发招募', body: '按步骤填写商单要求并发布。发布后到达人报名列表跟进。' },
    { text: '消息', title: '消息', body: '「私信」联系达人，「群聊」管理合作群。点进会话即可回复。' },
    { text: '我的', title: '我的', body: '先完成账号绑定。这里还有 AI 视频审核、我的推广和 AI 创作工坊。' },
  ],
  shoot: [
    { text: '首页', title: '首页', body: '点商单卡片即可报名商单。常用入口可进我的报名、商单日历和 AI视频审核。' },
    { text: '推荐大厅', title: '推荐大厅', body: '左右滑动看顶部轮播，再用智能匹配找出适合拍摄团队的任务。' },
    { text: '消息', title: '消息', body: '「私信」用来一对一沟通，「群聊」用来跟进合作群。点进会话即可回复。' },
    { text: '我的', title: '我的', body: '先完成账号绑定。这里还有 AI 视频审核、我的推广和 AI 创作工坊。' },
  ],
  edit: [
    { text: '首页', title: '首页', body: '点商单卡片即可报名商单。常用入口可进我的报名、商单日历和 AI视频审核。' },
    { text: '推荐大厅', title: '推荐大厅', body: '左右滑动看顶部轮播，再用智能匹配找出适合剪辑团队的任务。' },
    { text: '消息', title: '消息', body: '「私信」用来一对一沟通，「群聊」用来跟进合作群。点进会话即可回复。' },
    { text: '我的', title: '我的', body: '先完成账号绑定。这里还有 AI 视频审核、我的推广和 AI 创作工坊。' },
  ],
}

let guideSession = null
let guideTimer = null

function readGuideDone() {
  try {
    const raw = wx.getStorageSync(GUIDE_STORAGE)
    return raw && typeof raw === 'object' ? raw : {}
  } catch (_) {
    return {}
  }
}

function writeGuideDone(identity) {
  const done = readGuideDone()
  done[identity] = 1
  try {
    wx.setStorageSync(GUIDE_STORAGE, done)
  } catch (_) {}
}

function stepsFor(identity) {
  return GUIDE_COPY[identity] || GUIDE_COPY.talent
}

Component({
  data: {
    selected: 0,
    hidden: false,
    hasCenterFab: false,
    chatBadge: 0,
    lqThemeClass: identityTheme.themeClass(userProfile.readIdentity()),
    lqAccentClass: '',
    lqPageStyle: '',
    list: getTabList(userProfile.readIdentity()),
    guideOn: false,
    guideStep: 0,
    guideTotal: 0,
    guideTitle: '',
    guideBody: '',
    guideArrow: 80,
    guideLast: false,
    guideSpot: -1,
  },
  lifetimes: {
    attached() {
      this.applyIdentityLayout()
      this.maybeStartMenuGuide()
      chatBadgeWatcher.syncBarFromGlobal()
      void chatBadgeWatcher.refreshNow({ minIntervalMs: 12000 })
    },
    detached() {
      this._alive = false
    },
  },
  pageLifetimes: {
    show() {
      this.applyIdentityLayout()
      this.maybeStartMenuGuide()
      chatBadgeWatcher.syncBarFromGlobal()
      void chatBadgeWatcher.refreshNow({ minIntervalMs: 20000 })
    },
  },
  methods: {
    maybeStartMenuGuide() {
      return
      this._alive = true
      const identity = userProfile.readIdentity() || 'talent'
      if (readGuideDone()[identity]) {
        if (this.data.guideOn) this.setData({ guideOn: false, guideSpot: -1 })
        return
      }
      if (guideSession && guideSession.identity === identity) {
        this.renderGuideStep()
        return
      }
      if (guideTimer || guideSession) return
      guideTimer = setTimeout(() => {
        guideTimer = null
        const current = userProfile.readIdentity() || identity
        if (readGuideDone()[current]) return
        const list = getTabList(current)
        const steps = stepsFor(current).filter((step) => list.some((item) => item.text === step.text))
        if (!steps.length) return
        guideSession = { identity: current, step: 0, steps }
        if (this._alive) this.renderGuideStep()
      }, 4200)
    },

    renderGuideStep() {
      if (!guideSession) return
      const steps = guideSession.steps || []
      const step = steps[guideSession.step]
      if (!step) {
        this.finishMenuGuide()
        return
      }
      const list = this.data.list || []
      const spot = list.findIndex((item) => item.text === step.text)
      const n = list.length || 1
      const tabCenter = ((Math.max(spot, 0) + 0.5) / n) * 750
      const arrow = Math.max(36, Math.min(650, tabCenter - 32))
      this.setData({
        guideOn: true,
        guideStep: guideSession.step,
        guideTotal: steps.length,
        guideTitle: step.title,
        guideBody: step.body,
        guideArrow: arrow,
        guideLast: guideSession.step >= steps.length - 1,
        guideSpot: spot,
      })
    },

    finishMenuGuide() {
      const identity = (guideSession && guideSession.identity) || userProfile.readIdentity() || 'talent'
      writeGuideDone(identity)
      guideSession = null
      this.setData({ guideOn: false, guideSpot: -1 })
    },

    preventGuideMove() {},

    onGuideSkip() {
      this.finishMenuGuide()
    },

    onGuideNext() {
      if (!guideSession) {
        this.finishMenuGuide()
        return
      }
      if (guideSession.step >= guideSession.steps.length - 1) {
        this.finishMenuGuide()
        return
      }
      guideSession.step += 1
      this.renderGuideStep()
    },

    applyIdentityLayout() {
      const identity = userProfile.readIdentity()
      const list = getTabList(identity)
      const hasCenterFab = list.some((item) => item && item.center)
      const lqThemeClass = identityTheme.themeClass(identity)
      const accent = require('../utils/accentTheme.js').viewModel()
      const cur = this.data.list || []
      const same =
        cur.length === list.length && cur.every((item, i) => item.pagePath === list[i].pagePath)
      const patch = {}
      if (this.data.lqThemeClass !== lqThemeClass) patch.lqThemeClass = lqThemeClass
      if (this.data.lqAccentClass !== accent.lqAccentClass) patch.lqAccentClass = accent.lqAccentClass
      if (this.data.lqPageStyle !== accent.lqPageStyle) patch.lqPageStyle = accent.lqPageStyle
      if (!same || this.data.hasCenterFab !== hasCenterFab) {
        patch.list = list
        patch.hasCenterFab = hasCenterFab
      }
      if (Object.keys(patch).length) this.setData(patch)
    },
    switchTab(e) {
      const idx = Number(e.currentTarget.dataset.index)
      const item = this.data.list[idx]
      if (!item) return
      if (item.navigate) {
        wx.navigateTo({ url: item.pagePath })
        return
      }
      wx.switchTab({ url: item.pagePath })
    },
  },
})
