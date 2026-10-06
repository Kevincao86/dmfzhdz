const auth = require('../../../utils/auth.js')
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

const RADAR_AXES = [
  { name: '本地人群匹配', max: 20 },
  { name: '口碑合规风险', max: 10 },
  { name: '内容转化潜力', max: 15 },
  { name: '团购带货能力', max: 25 },
  { name: '内容质量人设', max: 15 },
  { name: '内容产能稳定', max: 15 },
]

function radarRows(situations) {
  const rows = Array.isArray(situations) ? situations : []
  return RADAR_AXES.map((axis) => {
    let hit = null
    for (let i = 0; i < rows.length; i += 1) {
      const name = String(rows[i].name || '')
      if (name === axis.name || name.indexOf(axis.name.slice(0, 4)) >= 0) hit = rows[i]
    }
    return {
      name: axis.name,
      points: Number(hit && hit.points) || 0,
      max: Number(hit && hit.max) || axis.max,
    }
  })
}

function paintRadar(ctx, w, h, rows, progress, sweep, showScore) {
  ctx.clearRect(0, 0, w, h)
  const cx = w / 2
  const cy = h * 0.5
  const radius = Math.min(w * 0.3, h * 0.28)
  const count = rows.length
  const point = (index, ratio) => {
    const ang = -Math.PI / 2 + (index * 2 * Math.PI) / count
    return { x: cx + Math.cos(ang) * radius * ratio, y: cy + Math.sin(ang) * radius * ratio, ang }
  }
  ctx.strokeStyle = '#d7e4f4'
  ctx.lineWidth = 1
  ;[0.25, 0.5, 0.75, 1].forEach((ring) => {
    ctx.beginPath()
    for (let i = 0; i < count; i += 1) {
      const p = point(i, ring)
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
    ctx.stroke()
  })
  for (let i = 0; i < count; i += 1) {
    const edge = point(i, 1)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(edge.x, edge.y)
    ctx.stroke()
  }
  if (sweep >= 0) {
    const start = -Math.PI / 2 + sweep * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, radius, start, start + Math.PI / 4.2)
    ctx.closePath()
    ctx.fillStyle = 'rgba(37,99,235,0.14)'
    ctx.fill()
  }
  ctx.beginPath()
  rows.forEach((row, index) => {
    const ratio = Math.max(0.03, Math.min(1, row.max ? row.points / row.max : 0)) * progress
    const p = point(index, ratio)
    if (index === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  })
  ctx.closePath()
  ctx.fillStyle = 'rgba(96,165,250,0.38)'
  ctx.fill()
  ctx.strokeStyle = '#2563eb'
  ctx.lineWidth = 2
  ctx.stroke()
  rows.forEach((row, index) => {
    const ratio = Math.max(0.03, Math.min(1, row.max ? row.points / row.max : 0)) * progress
    const p = point(index, ratio)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2)
    ctx.fillStyle = '#1d4ed8'
    ctx.fill()
  })
  ctx.textBaseline = 'middle'
  rows.forEach((row, index) => {
    const p = point(index, 1.38)
    const cos = Math.cos(p.ang)
    ctx.textAlign = cos > 0.34 ? 'left' : cos < -0.34 ? 'right' : 'center'
    ctx.fillStyle = '#1e293b'
    ctx.font = '600 12px sans-serif'
    ctx.fillText(row.name, p.x, p.y - 8)
    if (showScore) {
      ctx.fillStyle = '#1d4ed8'
      ctx.font = '700 12px sans-serif'
      ctx.fillText(Math.round(row.points * progress) + '/' + row.max, p.x, p.y + 10)
    }
  })
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
    this.stopRadar()
  },

  stopRadar() {
    if (this._radarSweep) {
      clearInterval(this._radarSweep)
      this._radarSweep = null
    }
    if (this._radarTimer) {
      clearInterval(this._radarTimer)
      this._radarTimer = null
    }
  },

  ensureRadar(done) {
    const query = wx.createSelectorQuery().in(this)
    query.select('#evalRadar').fields({ node: true, size: true }).exec((res) => {
      const box = res && res[0]
      if (!box || !box.node || !box.width) return
      const canvas = box.node
      const ctx = canvas.getContext('2d')
      let dpr = 2
      try {
        dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2
      } catch (e) {}
      canvas.width = box.width * dpr
      canvas.height = box.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      this._radarCtx = ctx
      this._radarBox = { w: box.width, h: box.height }
      done()
    })
  },

  paintRadarNow(progress, sweep) {
    if (!this._radarCtx || !this._radarBox) return
    paintRadar(
      this._radarCtx,
      this._radarBox.w,
      this._radarBox.h,
      radarRows(this.data.situations),
      progress,
      sweep,
      !!this.data.scoreReady,
    )
  },

  startRadarSweep() {
    this.stopRadar()
    const start = Date.now()
    const loop = () => {
      this.paintRadarNow(this.data.scoreReady ? 1 : 0.08, ((Date.now() - start) / 1100) % 1)
    }
    this.ensureRadar(loop)
    this._radarSweep = setInterval(loop, 32)
  },

  showRadar() {
    this.stopRadar()
    this.ensureRadar(() => this.paintRadarNow(1, -1))
  },

  playRadar() {
    this.stopRadar()
    const start = Date.now()
    const dur = 1400
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      this.paintRadarNow(eased, -1)
      if (t >= 1 && this._radarTimer) {
        clearInterval(this._radarTimer)
        this._radarTimer = null
      }
    }
    this.ensureRadar(tick)
    this._radarTimer = setInterval(tick, 32)
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
      this.stopRadar()
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
    wx.nextTick(() => this.showRadar())
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
    this.setData({ evaluating: true, err: '', scorePop: false, displayScore: 0 }, () => this.startRadarSweep())
    this.startEvalSweep()
    let failed = null
    try {
      const input = this._input || this.accountInput()
      const score = await evalApi.evaluateTalent(input, { force: true })
      this._score = score
      const grade = input.platformId === 'douyin' ? evalApi.douyinScoreGrade(score.score) : null
      this.setData({
        evaluating: false,
        scoreReady: true,
        videoLevel: score.videoLevel,
        liveLevel: score.liveLevel,
        situations: score.situations || [],
        showGrade: !!grade,
        gradeKey: grade ? grade.key : '',
        gradeLabel: grade ? grade.label : '',
        gradeNote: grade ? grade.note : '',
        showGains: true,
      }, () => {
        this.playScore(score.score)
        this.playRadar()
      })
      const gains = gainTargets(score, input)
      if (gains) this.playGains(gains.exposure, gains.sales)
      void this.refreshQuota()
    } catch (e) {
      failed = e
    }
    if (failed) {
      this.stopTick()
      this.stopRadar()
      const prev = this._score ? Number(this._score.score) || 0 : 0
      this.setData({ displayScore: prev })
      this.failEval(failed, 'evaluating')
      if (this._score) wx.nextTick(() => this.showRadar())
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
    if (!this.data.scoreReady || this.data.evaluating || this.data.advising) return
    this.setData({ advising: true, err: '', adviceReady: false, sections: [] })
    wx.showLoading({ title: '分析中', mask: true })
    wx.pageScrollTo({ selector: '#talent-advice-plan', duration: 240 })
    let failed = null
    try {
      const advice = await evalApi.adviseTalent(this._input || this.accountInput(), this._score, { force: true })
      this.setData({
        advising: false,
        adviceReady: true,
        sections: advice.sections,
        lift: Number(advice.lift) || 0,
      })
      wx.nextTick(() => wx.pageScrollTo({ selector: '#talent-advice-plan', duration: 240 }))
    } catch (e) {
      failed = e
    }
    wx.hideLoading()
    if (failed) {
      const msg = String(failed && failed.message ? failed.message : failed || '')
      if (/未开通|升级会员|开通会员/.test(msg)) this.setData({ upgradeOpen: true })
      this.failEval(failed, 'advising')
    }
  },
})
