const talentMember = require('../../../utils/talentMember.js')
const wxAccount = require('../../../utils/wxAccount.js')
const evalApi = require('../../../utils/talentLocalLifeEval.js')
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
    canEval: false,
    evaluating: false,
    advising: false,
    displayScore: 0,
    scoreReady: false,
    videoLevel: '',
    liveLevel: '',
    basis: '',
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
    this.setData({ displayScore: 0, evaluating: false })
    let cur = 0
    this._timer = setInterval(() => {
      cur += Math.max(1, Math.round((goal - cur) / 8))
      if (cur >= goal) {
        cur = goal
        this.stopTick()
      }
      this.setData({ displayScore: cur })
    }, 40)
  },

  async onEvaluate() {
    if (!this.data.canEval || this.data.evaluating || this.data.advising) return
    this.stopTick()
    this.setData({
      evaluating: true,
      err: '',
      scoreReady: false,
      displayScore: 0,
      adviceReady: false,
      sections: [],
    })
    try {
      const score = await evalApi.evaluateTalent(this.data.nickname, this.data.douyinId)
      this._score = score
      this.setData({
        scoreReady: true,
        videoLevel: score.videoLevel,
        liveLevel: score.liveLevel,
        basis: score.basis,
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
    if (!this.data.canEval || this.data.evaluating || this.data.advising) return
    this.setData({ advising: true, err: '' })
    try {
      const advice = await evalApi.adviseTalent(this.data.nickname, this.data.douyinId, this._score)
      this.setData({
        advising: false,
        adviceReady: true,
        adviceStatus: advice.status,
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
