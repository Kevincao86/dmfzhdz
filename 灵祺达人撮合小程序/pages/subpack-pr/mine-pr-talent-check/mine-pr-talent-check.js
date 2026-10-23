const api = require('../../../utils/talentAccountCheckMp.js')

const MEMBERSHIP = '/pages/subpack-mine/mine-xingxuan-membership/mine-xingxuan-membership'
const RECHARGE = '/pages/subpack-mine/mine-xingxuan-points-recharge/mine-xingxuan-points-recharge'

function messageOf(err, fallback) {
  const body = err && (err.data || err.body || err)
  return (body && (body.message || body.error)) || (err && err.message) || fallback
}

Page({
  data: {
    tab: 'single',
    platform: 'douyin',
    query: '',
    busy: false,
    member: false,
    freeRemaining: 1,
    pointsBalance: 0,
    platforms: [
      { id: 'douyin', label: '抖音', logo: '/images/platforms/douyin.png', open: true },
      { id: 'xhs', label: '小红书', logo: '/images/platforms/xiaohongshu.png', open: true },
      { id: 'kuaishou', label: '快手', logo: '/images/platforms/kuaishou-local.png', open: false },
      { id: 'dianping', label: '大众点评', logo: '/images/platforms/dianping.png', open: false },
      { id: 'channels', label: '视频号', logo: '/images/platforms/wechat.png', open: false },
    ],
    pointsPerCheck: 5,
    hint: '正在读取查验额度…',
    singleLabel: '开始查验',
    view: null,
    rows: [],
    records: [],
  },

  onShow() {
    this.loadStatus()
    this.loadHistory()
  },

  async loadHistory() {
    try {
      const data = await api.history()
      if (data && data.ok) this.setData({ records: data.records || [] })
    } catch (err) {
      /* 记录读不到时不挡查验 */
    }
  },

  openRecord(e) {
    const index = Number(e.currentTarget.dataset.index)
    const record = (this.data.records || [])[index]
    if (!record) return
    const view = Object.assign({}, record, { cached: false })
    view.recentText = (view.recent || []).join('  ')
    this.setData({ tab: 'single', platform: record.platform === 'xhs' ? 'xhs' : 'douyin', query: record.account || '', view })
  },

  async loadStatus() {
    try {
      const data = await api.status()
      if (!data || data.ok === false) {
        this.handleGate(data)
        return
      }
      this.applyStatus(data)
    } catch (err) {
      this.setData({ hint: messageOf(err, '额度读取失败，请稍后再试') })
    }
  },

  applyStatus(data) {
    const member = !!data.member
    const freeRemaining = Number(data.freeRemaining) || 0
    const points = Number(data.pointsPerCheck) || 5
    let singleLabel = '开始查验'
    if (!member) singleLabel = freeRemaining > 0 ? '免费查验' : '去升级'
    this.setData({
      member,
      freeRemaining,
      pointsBalance: Number(data.pointsBalance) || 0,
      pointsPerCheck: points,
      hint: data.hint || '',
      singleLabel,
    })
  },

  onPlatform(e) {
    const id = e.currentTarget.dataset.id
    const item = (this.data.platforms || []).find((row) => row.id === id)
    if (!item) return
    if (!item.open) {
      wx.showToast({ title: `${item.label}尚未开放`, icon: 'none' })
      return
    }
    this.setData({ platform: id, view: null, tab: id === 'xhs' ? 'single' : this.data.tab })
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === 'batch' && this.data.platform === 'xhs') {
      wx.showToast({ title: '小红书目前只支持单个查验', icon: 'none' })
      return
    }
    if (tab === 'batch' && !this.data.member) {
      this.promptUpgrade('免费版每月只能查 1 个号。批量查验需要升级会员。')
      return
    }
    this.setData({ tab })
  },

  onQuery(e) {
    this.setData({ query: e.detail.value })
  },

  async onCheck() {
    const query = String(this.data.query || '').trim()
    if (!query || this.data.busy) return
    if (!this.data.member && this.data.freeRemaining <= 0) {
      this.promptUpgrade()
      return
    }
    this.setData({ busy: true })
    try {
      const data = await api.check(query, this.data.platform)
      if (!data || data.ok === false) {
        this.handleGate(data)
        return
      }
      const view = data.view || null
      if (view) view.recentText = (view.recent || []).join('  ')
      this.setData({ view })
      this.loadHistory()
      if (data.view && !data.view.cached) {
        wx.showToast({ title: data.view.charged ? `已扣 ${data.view.charged} 积分` : '已使用本月免费次数', icon: 'none' })
      }
      this.applyStatus(data)
    } catch (err) {
      wx.showToast({ title: messageOf(err, '查验失败'), icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  },

  onCopyHeader() {
    wx.setClipboardData({ data: '抖音号,昵称' })
  },

  onPickSheet() {
    if (!this.data.member) {
      this.promptUpgrade('批量查验需要升级会员。')
      return
    }
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx', 'csv'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return
        const name = String(file.name || '').toLowerCase()
        const encoding = name.endsWith('.csv') ? 'utf8' : 'base64'
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding,
          success: async (read) => {
            const payload = encoding === 'utf8' ? { csvText: String(read.data || '') } : { fileBase64: String(read.data || '') }
            this.setData({ busy: true })
            try {
              const data = await api.parseSheet(payload)
              if (!data || data.ok === false) {
                this.handleGate(data)
                return
              }
              const rows = (data.rows || []).map((row) => ({
                douyinId: row.douyinId,
                nickname: row.nickname || '',
                state: '',
                note: '待查验',
              }))
              this.setData({ rows })
              if (data.truncated) wx.showToast({ title: '已截取前 30 个号', icon: 'none' })
            } catch (err) {
              wx.showToast({ title: messageOf(err, '表格读取失败'), icon: 'none' })
            } finally {
              this.setData({ busy: false })
            }
          },
          fail: () => wx.showToast({ title: '表格读取失败', icon: 'none' }),
        })
      },
    })
  },

  async onBatch() {
    if (this.data.busy || !this.data.rows.length) return
    if (!this.data.member) {
      this.promptUpgrade('批量查验需要升级会员。')
      return
    }
    this.setData({ busy: true })
    try {
      const quote = await api.quote(this.data.rows.map((row) => row.douyinId))
      if (!quote || quote.ok === false) {
        this.handleGate(quote)
        return
      }
      const go = await this.confirmSpend(quote)
      if (!go) return
      const rows = this.data.rows.slice()
      for (let i = 0; i < rows.length; i += 1) {
        rows[i] = Object.assign({}, rows[i], { note: '查验中', state: '' })
        this.setData({ rows })
        try {
          const data = await api.check(rows[i].douyinId)
          if (!data || data.ok === false) {
            rows[i] = Object.assign({}, rows[i], { note: (data && data.message) || '未查到', state: 'fail' })
          } else {
            const view = data.view || {}
            rows[i] = Object.assign({}, rows[i], {
              note: view.cached ? '24小时内已查过' : view.nickname || '已查验',
              state: 'ok',
            })
            this.applyStatus(data)
          }
        } catch (err) {
          rows[i] = Object.assign({}, rows[i], { note: messageOf(err, '查验失败'), state: 'fail' })
        }
        this.setData({ rows })
      }
      this.loadHistory()
    } catch (err) {
      wx.showToast({ title: messageOf(err, '批量查验失败'), icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  },

  confirmSpend(quote) {
    const required = Number(quote.pointsRequired) || 0
    const cached = Number(quote.cached) || 0
    const content = required
      ? `本次 ${quote.chargeCount} 个号需要 ${required} 积分${cached ? `，${cached} 个号 24 小时内已查过，不重复扣` : ''}。确认后开始查验。`
      : '这些号 24 小时内都查过，不再扣积分。'
    return new Promise((resolve) => {
      wx.showModal({
        title: '确认查验',
        content,
        confirmText: '开始查验',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      })
    })
  },

  handleGate(data) {
    const error = data && data.error
    const message = (data && data.message) || '暂时查不了'
    if (error === 'upgrade_membership' || error === 'pr_only') {
      this.promptUpgrade(message)
      return
    }
    if (error === 'insufficient_points') {
      wx.showModal({
        title: '积分不足',
        content: message,
        confirmText: '去充值',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: RECHARGE })
        },
      })
      return
    }
    wx.showToast({ title: message, icon: 'none' })
  },

  promptUpgrade(message) {
    wx.showModal({
      title: '请升级会员',
      content: message || '本月免费查验已用完，下月恢复。升级会员后按积分查验，不限次数。',
      confirmText: '去升级',
      success: (res) => {
        if (res.confirm) wx.navigateTo({ url: MEMBERSHIP })
      },
    })
  },
})
