const userProfile = require('../utils/userProfile.js')
const identityTheme = require('../utils/identityTheme.js')
const { getTabList } = require('../utils/tabBarConfig.js')
const chatBadgeWatcher = require('../utils/chatBadgeWatcher.js')

const GUIDE_STORAGE = 'mp_menu_guide_v2'
const GUIDE_COPY = {
  talent: [
    { text: '首页', title: '首页', body: '先看今日商单和常用入口。点商单进详情报名；商单日历看当天要做的事，AI视频审核用来检查成片和文稿。' },
    { text: '推荐大厅', title: '推荐大厅', body: '按城市、价格和状态筛选。带 AI 标记的是更匹配的商单，点进去即可报名。' },
    { text: '达人账号分析', title: '达人账号分析', body: '填写账号数据后查看评分。按页面里的提升建议改资料，再回来复评。' },
    { text: '消息', title: '消息', body: '邀约、审核结果和排期都会出现在这里。点开一条即可回复或查看详情。' },
    { text: '我的', title: '我的', body: '先完善资料。AI 创作里可以生成脚本、审核视频，也可以查看订单和钱包。' },
  ],
  pr: [
    { text: '首页', title: '首页', body: '查看在招情况。常用入口可打开发招募、我的发单、商单日历和 AI视频审核。' },
    { text: '推荐大厅', title: '推荐大厅', body: '按条件找达人。选中达人后可以发起合作或邀约。' },
    { text: '发招募', title: '发招募', body: '按步骤填写商单要求并发布。发布后到达人报名列表跟进。' },
    { text: '消息', title: '消息', body: '处理达人咨询和系统通知，点进会话直接回复。' },
    { text: '我的', title: '我的', body: '管理机构资料、发单和钱包，也可以使用 AI 脚本和审核。' },
  ],
  shoot: [
    { text: '首页', title: '首页', body: '查看可接的拍摄商单。常用入口进入报名、商单日历和 AI视频审核。' },
    { text: '推荐大厅', title: '推荐大厅', body: '筛选适合拍摄团队的任务，点进去报名。' },
    { text: '消息', title: '消息', body: '查看档期和合作通知，及时回复对方。' },
    { text: '我的', title: '我的', body: '维护团队资料、报价和课程，并使用 AI 审核。' },
  ],
  edit: [
    { text: '首页', title: '首页', body: '查看可接的剪辑商单。常用入口进入报名、商单日历和 AI视频审核。' },
    { text: '推荐大厅', title: '推荐大厅', body: '筛选适合剪辑团队的任务，点进去报名。' },
    { text: '消息', title: '消息', body: '查看交片和合作通知，及时回复对方。' },
    { text: '我的', title: '我的', body: '维护团队资料、报价和课程，并使用 AI 审核。' },
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
      const cur = this.data.list || []
      const same =
        cur.length === list.length && cur.every((item, i) => item.pagePath === list[i].pagePath)
      const patch = {}
      if (this.data.lqThemeClass !== lqThemeClass) patch.lqThemeClass = lqThemeClass
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
