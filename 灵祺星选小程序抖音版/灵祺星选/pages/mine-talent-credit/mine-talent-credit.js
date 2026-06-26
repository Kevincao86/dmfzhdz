const { prepareMineSubPage } = require('../../utils/pageIdentityChrome.js')
const xingxuan = require('../../utils/xingxuanEnhanceApi.js')

Page({
  data: {
    credit: { score: 0, levelLabel: '—', tips: [] },
    stats: [],
  },
  async onShow() {
    const ready = await prepareMineSubPage(this)
    if (!ready) return
    await this.load()
  },
  async load() {
    try {
      const res = await xingxuan.getTalentCredit()
      const c = res.credit || {}
      const score = c.score ?? 0
      const levelLabel =
        score >= 90 ? '优秀达人' : score >= 75 ? '可靠达人' : score >= 60 ? '成长中' : '待提升'
      const tips = []
      if ((c.passRate ?? 100) < 80) tips.push('提高成片一次通过率可显著加分')
      if ((c.onTimeRate ?? 100) < 85) tips.push('按时提交探店与成片，避免逾期')
      if ((c.badges || []).length) tips.push(`已获得：${c.badges.join('、')}`)
      this.setData({
        credit: { score, levelLabel, tips },
        stats: [
          { label: '完成商单', value: String(c.completedCount ?? 0) },
          { label: '准时交片', value: `${c.onTimeRate ?? 0}%` },
          { label: '成片通过率', value: `${c.passRate ?? 0}%` },
          { label: '驳回次数', value: String(c.rejectCount ?? 0) },
          { label: '档期冲突', value: String(c.scheduleDeclinedCount ?? 0) },
          { label: '爽约记录', value: String(c.noShowCount ?? 0) },
        ],
      })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },
})
