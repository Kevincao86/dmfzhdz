const auth = require('../../../utils/auth.js')
const prFeatureAccess = require('../../../utils/prFeatureAccess.js')
const talentMember = require('../../../utils/talentMember.js')
const wxAccount = require('../../../utils/wxAccount.js')
const evalApi = require('../../../utils/talentLocalLifeEval.js')
const userProfile = require('../../../utils/userProfile.js')
const { getTabList } = require('../../../utils/tabBarConfig.js')
const { syncPageIdentity } = require('../../../utils/pageIdentityChrome.js')

function letterOf(name) {
  const s = String(name || '').trim()
  return s ? s.slice(0, 1) : '达'
}

function gainTargets(score, input) {
  if (!score) return null
  const preview = evalApi.previewTalentGains(score.score, input && input.followers, input && input.quotePrice)
  return {
    exposure: score.exposureLift > 0 ? score.exposureLift : preview.exposurePct,
    sales: score.salesLift > 0 ? score.salesLift : preview.salesYuan,
  }
}

Page({
  data: {
    lqThemeClass: '',
    avatarUrl: '',
    avatarLetter: '达',
    nickname: '',
    accountId: '',
    accountLabel: '抖音号',
    nickLabel: '抖音昵称',
    levelTitle: '预估下月带货等级',
    levelALabel: '视频带货力',
    levelBLabel: '直播带货力',
    basis: '',
    platforms: [
      { id: 'douyin', name: '抖音平台', icon: '/images/platforms/douyin.png' },
      { id: 'xiaohongshu', name: '小红书', icon: '/images/platforms/xiaohongshu.png' },
      { id: 'kuaishou', name: '快手', icon: '/images/platforms/kuaishou-local.png' },
      { id: 'dianping', name: '大众点评', icon: '/images/platforms/dianping.png' },
      { id: 'weixin_video', name: '微信视频号', icon: '/images/platforms/wechat.png' },
    ],
    platformId: 'douyin',
    canEval: false,
    evaluating: false,
    advising: false,
    upgradeOpen: false,
    displayScore: 0,
    scoreReady: false,
    scorePop: false,
    videoLevel: '',
    liveLevel: '',
    showGrade: false,
    gradeKey: '',
    gradeLabel: '',
    gradeNote: '',
    grades: evalApi.DOUYIN_SCORE_GRADES,
    situations: [],
    tabs: [],
    adviceReady: false,
    adviceStatus: '',
    sections: [],
    lift: 0,
    showGains: false,
    exposureText: '',
    salesText: '',
    err: '',
    evalPoints: 0,
    advicePoints: evalApi.TALENT_ADVICE_POINTS,
    quotaPaid: false,
    quotaRemaining: -1,
    evalCostText: '免费评估',
    reevalCostText: '重新评估',
    adviceCostText: '分析提升 · ' + evalApi.TALENT_ADVICE_POINTS + '积分',
    loggedIn: false,
  },

  onLoad() {
    syncPageIdentity(this)
    this._score = null
    this._timer = null
    this.loadIdentity()
  },

  onShow() {
    syncPageIdentity(this)
    this.setData({ loggedIn: auth.isLoggedIn() })
    this.loadIdentity()
    this.setData({ tabs: getTabList(userProfile.readIdentity()) })
    void this.refreshQuota()
  },

  async refreshQuota() {
    try {
      const row = await evalApi.readTalentEvalQuota()
      const remaining = Number(row.remaining)
      const paid = !!row.paid
      const left = Number.isFinite(remaining) && remaining >= 0 ? remaining : -1
      let evalCostText = '免费评估'
      let reevalCostText = '重新评估'
      if (left === 0) {
        evalCostText = paid ? '本月次数已用完' : '升级后每月 15 次'
        reevalCostText = evalCostText
      } else if (left > 0) {
        evalCostText = (paid ? '评估 · 剩' : '免费评估 · 剩') + left + '次'
        reevalCostText = '重新评估 · 剩' + left + '次'
      }
      this.setData({ quotaPaid: paid, quotaRemaining: left, evalCostText, reevalCostText })
    } catch (e) {}
  },

  onPlatform(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.platformId) return
    this.stopTick()
    this.setData({ platformId: id, err: '' })
    this.loadIdentity(id)
  },

  onTab(e) {
    const path = e.currentTarget.dataset.path
    if (!path || String(e.currentTarget.dataset.navigate) === 'true') return
    wx.switchTab({ url: path })
  },

  onUnload() {
    this.stopTick()
  },

  accountInput(platformId) {
    const id = platformId || this.data.platformId || 'douyin'
    const member = talentMember.readMember()
    const prof = (member && member.platformProfiles && member.platformProfiles[id]) || {}
    const tags = Array.isArray(prof.accountTags) ? prof.accountTags : []
    return {
      platformId: id,
      nickname: String(prof.platformNickname || '').trim(),
      accountId: String(prof.platformAccount || '').trim(),
      followers: String(prof.followers || '').trim(),
      profileLink: String(prof.profileLink || '').trim(),
      tags,
      salesLevel: String(prof.douyinSalesLevel || '').trim(),
      talentGrade: String(prof.talentGrade || '').trim(),
      quotePrice: String(prof.quotePrice || '').trim(),
    }
  },

  loadIdentity(platformId) {
    const input = this.accountInput(platformId)
    const meta = evalApi.platformEvalMeta(input.platformId)
    const wx = wxAccount.readWxAccount() || {}
    this._input = input
    this.setData({
      loggedIn: auth.isLoggedIn(),
      avatarUrl: String(wx.wxAvatarUrl || '').trim(),
      avatarLetter: letterOf(input.nickname || input.accountId),
      nickname: input.nickname,
      accountId: input.accountId,
      accountLabel: meta.accountLabel,
      nickLabel: meta.nickLabel,
      levelTitle: meta.levelTitle,
      levelALabel: meta.levelA,
      levelBLabel: meta.levelB,
      basis: evalApi.describeEvalBasis(input),
      canEval: !!(input.nickname || input.accountId),
    })
    if (!this.data.evaluating) this.restoreSaved(input)
  },

  restoreSaved(input) {
    const saved = evalApi.readSavedTalentEval(input)
    if (!saved) {
      this._score = null
      this.stopGains()
      this.setData({
        scoreReady: false,
        adviceReady: false,
        situations: [],
        sections: [],
        lift: 0,
        displayScore: 0,
        scorePop: false,
        videoLevel: '',
        liveLevel: '',
        showGrade: false,
        gradeKey: '',
        gradeLabel: '',
        gradeNote: '',
        showGains: false,
        exposureText: '',
        salesText: '',
      })
      return
    }
    const grade = input.platformId === 'douyin' ? evalApi.douyinScoreGrade(saved.score.score) : null
    this._score = saved.score
    this.setData({
      scoreReady: true,
      displayScore: saved.score.score,
      scorePop: false,
      videoLevel: saved.score.videoLevel,
      liveLevel: saved.score.liveLevel,
      situations: saved.score.situations || [],
      adviceReady: !!(saved.advice && saved.advice.sections && saved.advice.sections.length),
      sections: saved.advice ? saved.advice.sections : [],
      lift: saved.advice ? Number(saved.advice.lift) || 0 : 0,
      showGrade: !!grade,
      gradeKey: grade ? grade.key : '',
      gradeLabel: grade ? grade.label : '',
      gradeNote: grade ? grade.note : '',
      showGains: true,
    })
    const gains = gainTargets(saved.score, input)
    if (gains) this.playGains(gains.exposure, gains.sales)
  },

  stopTick() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  stopGains() {
    if (this._gainTimer) {
      clearInterval(this._gainTimer)
      this._gainTimer = null
    }
  },

  playGains(exposure, sales) {
    this.stopGains()
    const goalE = Math.max(0, Number(exposure) || 0)
    const goalS = Math.max(0, Number(sales) || 0)
    const start = Date.now()
    const dur = 1600
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      this.setData({
        showGains: true,
        exposureText: '+' + Math.round(goalE * eased) + '%',
        salesText: '+' + evalApi.formatSalesYuan(Math.round(goalS * eased)),
      })
      if (t >= 1) this.stopGains()
    }
    tick()
    this._gainTimer = setInterval(tick, 32)
  },

  startEvalSweep() {
    this.stopTick()
    const start = Date.now()
    this._timer = setInterval(() => {
      const wave = (Math.sin(((Date.now() - start) / 700) * Math.PI) + 1) / 2
      this.setData({ displayScore: Math.round(8 + wave * 78) })
    }, 32)
  },

  playScore(target) {
    this.stopTick()
    const goal = Math.max(0, Math.min(100, Number(target) || 0))
    const start = Date.now()
    const dur = 1400
    this.setData({ displayScore: 0, evaluating: false, scorePop: false })
    this._timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      const cur = Math.round(goal * eased)
      if (t >= 1) {
        this.stopTick()
        this.setData({ displayScore: goal, scorePop: true })
        return
      }
      this.setData({ displayScore: cur })
    }, 32)
  },

  failEval(e, evaluatingKey) {
    const msg = String(e && e.message ? e.message : e || '评估失败').slice(0, 120)
    const patch = { err: msg }
    patch[evaluatingKey] = false
    this.setData(patch)
    wx.showToast({ title: msg, icon: 'none', duration: 2800 })
  },

  async onEvaluate() {
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    if (this.data.quotaRemaining === 0) {
      if (this.data.quotaPaid) {
        const msg = '本月 15 次评估已用完，下月恢复'
        this.setData({ err: msg })
        wx.showToast({ title: msg, icon: 'none' })
        return
      }
      wx.showModal({
        title: '本月免费次数已用完',
        content: '免费版每月可评估 1 次。升级会员后每月可评估 15 次。',
        confirmText: '去升级',
        cancelText: '取消',
        success(res) {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/subpack-mine/mine-xingxuan-membership/mine-xingxuan-membership' }).catch(() => {})
          }
        },
      })
      return
    }
    if (!this.data.canEval || this.data.evaluating || this.data.advising) return
    this.stopTick()
    this.setData({ evaluating: true, err: '', scorePop: false, displayScore: 0 })
    this.startEvalSweep()
    let failed = null
    try {
      const input = this._input || this.accountInput()
      const score = await evalApi.evaluateTalent(input, { force: true })
      this._score = score
      const grade = input.platformId === 'douyin' ? evalApi.douyinScoreGrade(score.score) : null
      this.setData({
        scoreReady: true,
        videoLevel: score.videoLevel,
        liveLevel: score.liveLevel,
        situations: score.situations || [],
        showGrade: !!grade,
        gradeKey: grade ? grade.key : '',
        gradeLabel: grade ? grade.label : '',
        gradeNote: grade ? grade.note : '',
        showGains: true,
      })
      this.playScore(score.score)
      const gains = gainTargets(score, input)
      if (gains) this.playGains(gains.exposure, gains.sales)
      void this.refreshQuota()
    } catch (e) {
      failed = e
    }
    if (failed) {
      this.stopTick()
      const prev = this._score ? Number(this._score.score) || 0 : 0
      this.setData({ displayScore: prev })
      this.failEval(failed, 'evaluating')
    }
  },

  preventMove() {},

  closeUpgrade() {
    this.setData({ upgradeOpen: false })
  },

  goUpgrade() {
    this.setData({ upgradeOpen: false })
    wx.navigateTo({
      url: '/pages/subpack-mine/mine-xingxuan-membership/mine-xingxuan-membership',
    }).catch(() => {})
  },

  async onAdvise() {
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    if (!prFeatureAccess.canUseAddonPerm(null, 'talentAdvice')) {
      this.setData({ upgradeOpen: true })
      return
    }
    if (!this.data.scoreReady || this.data.evaluating || this.data.advising) return
    this.setData({ advising: true, err: '' })
    wx.showLoading({ title: '分析中', mask: true })
    let failed = null
    try {
      const advice = await evalApi.adviseTalent(this._input || this.accountInput(), this._score, { force: true })
      this.setData({
        advising: false,
        adviceReady: true,
        sections: advice.sections,
        lift: Number(advice.lift) || 0,
      })
    } catch (e) {
      failed = e
    }
    wx.hideLoading()
    if (failed) this.failEval(failed, 'advising')
  },
})
