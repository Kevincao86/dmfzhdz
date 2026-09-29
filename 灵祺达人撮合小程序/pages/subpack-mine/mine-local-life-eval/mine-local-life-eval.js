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

Page({
  data: {
    lqThemeClass: '',
    avatarUrl: '',
    avatarLetter: '达',
    nickname: '',
    douyinId: '',
    platforms: [
      { id: 'douyin', name: '抖音平台' },
      { id: 'xiaohongshu', name: '小红书' },
      { id: 'kuaishou', name: '快手' },
      { id: 'dianping', name: '大众点评' },
      { id: 'weixin_video', name: '微信视频号' },
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
    situations: [],
    tabs: [],
    adviceReady: false,
    adviceStatus: '',
    sections: [],
    err: '',
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
    this.setData({ platformId: id, err: '' })
  },

  onTab(e) {
    const path = e.currentTarget.dataset.path
    if (!path || String(e.currentTarget.dataset.navigate) === 'true') return
    wx.switchTab({ url: path })
  },

  onUnload() {
    this.stopTick()
  },

  loadIdentity() {
    const member = talentMember.readMember()
    const prof = (member && member.platformProfiles && member.platformProfiles.douyin) || {}
    const wx = wxAccount.readWxAccount() || {}
    const nickname = String(prof.platformNickname || '').trim()
    const douyinId = String(prof.platformAccount || '').trim()
    this.setData({
      avatarUrl: String(wx.wxAvatarUrl || '').trim(),
      avatarLetter: letterOf(nickname || douyinId),
      nickname,
      douyinId,
      canEval: !!(nickname || douyinId),
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

  async onEvaluate() {
    if (!this.data.canEval || this.data.evaluating || this.data.advising) return
    this.stopTick()
    this.setData({
      evaluating: true,
      err: '',
      scoreReady: false,
      scorePop: false,
      displayScore: 0,
      situations: [],
    })
    try {
      const score = await evalApi.evaluateTalent(this.data.nickname, this.data.douyinId)
      this._score = score
      this.setData({
        scoreReady: true,
        videoLevel: score.videoLevel,
        liveLevel: score.liveLevel,
        situations: score.situations || [],
      })
      this.playScore(score.score)
    } catch (e) {
      this.setData({
        evaluating: false,
        err: String(e && e.message ? e.message : e).slice(0, 120),
      })
    }
  },

  async onAdvise() {
    if (!this.data.scoreReady || this.data.evaluating || this.data.advising) return
    this.setData({ advising: true, err: '' })
    try {
      const advice = await evalApi.adviseTalent(this.data.nickname, this.data.douyinId, this._score)
      this.setData({
        advising: false,
        adviceReady: true,
        sections: advice.sections,
      })
    } catch (e) {
      this.setData({
        advising: false,
        err: String(e && e.message ? e.message : e).slice(0, 120),
      })
    }
  },
})
