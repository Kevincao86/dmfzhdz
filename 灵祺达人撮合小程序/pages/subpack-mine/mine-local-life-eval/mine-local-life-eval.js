const prFeatureAccess = require('../../../utils/prFeatureAccess.js')
const talentMember = require('../../../utils/talentMember.js')
const wxAccount = require('../../../utils/wxAccount.js')
const evalApi = require('../../../utils/talentLocalLifeEval.js')
const userProfile = require('../../../utils/userProfile.js')
const { getTabList, promptMembershipUpgrade } = require('../../../utils/tabBarConfig.js')
const { syncPageIdentity } = require('../../../utils/pageIdentityChrome.js')

function letterOf(name) {
  const s = String(name || '').trim()
  return s ? s.slice(0, 1) : '达'
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
    err: '',
    evalPoints: evalApi.TALENT_EVAL_POINTS,
    advicePoints: evalApi.TALENT_ADVICE_POINTS,
    evalCostText: '达人信息评估 · ' + evalApi.TALENT_EVAL_POINTS + '积分',
    reevalCostText: '重新评估 · ' + evalApi.TALENT_EVAL_POINTS + '积分',
    adviceCostText: '分析整改 · ' + evalApi.TALENT_ADVICE_POINTS + '积分',
  },

  onLoad() {
    syncPageIdentity(this)
    this._score = null
    this._timer = null
    this.loadIdentity()
  },

  onShow() {
    syncPageIdentity(this)
    this.loadIdentity()
    this.setData({ tabs: getTabList(userProfile.readIdentity()) })
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
      this.setData({
        scoreReady: false,
        adviceReady: false,
        situations: [],
        sections: [],
        displayScore: 0,
        scorePop: false,
        videoLevel: '',
        liveLevel: '',
        showGrade: false,
        gradeKey: '',
        gradeLabel: '',
        gradeNote: '',
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
      showGrade: !!grade,
      gradeKey: grade ? grade.key : '',
      gradeLabel: grade ? grade.label : '',
      gradeNote: grade ? grade.note : '',
    })
  },

  stopTick() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
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
    if (!prFeatureAccess.canUseAddonPerm(null, 'talentEval')) {
      promptMembershipUpgrade('达人账号分析')
      return
    }
    if (!this.data.canEval || this.data.evaluating || this.data.advising) return
    this.stopTick()
    this.setData({ evaluating: true, err: '' })
    wx.showLoading({ title: '评估中', mask: true })
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
      })
      this.playScore(score.score)
    } catch (e) {
      failed = e
    }
    wx.hideLoading()
    if (failed) this.failEval(failed, 'evaluating')
  },

  async onAdvise() {
    if (!prFeatureAccess.canUseAddonPerm(null, 'talentAdvice')) {
      promptMembershipUpgrade('达人账号分析')
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
      })
    } catch (e) {
      failed = e
    }
    wx.hideLoading()
    if (failed) this.failEval(failed, 'advising')
  },
})
