const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryMp.js')
const rest = require('../../utils/supabaseRest.js')

function tenantScheduleRowId(tenantId, localId) {
  const tid = String(tenantId || '').trim()
  const lid = String(localId || '').trim()
  if (!tid) return lid
  if (lid.startsWith(`sch@${tid}@`)) return lid
  const bare = lid
    .replace(/^sch@/, '')
    .replace(new RegExp(`^${tid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@`), '')
  return `sch@${tid}@${bare}`
}

function readLastSubmit() {
  try {
    const raw = wx.getStorageSync('meoo_last_recruitment_submit')
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    return j && typeof j === 'object' ? j : {}
  } catch (_) {
    return {}
  }
}

Page({
  data: {
    busy: false,
    rows: [],
  },

  onShow() {
    if (!api.getBearerToken()) wx.redirectTo({ url: '/pages/login/login' })
    void this.loadRows()
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/recruit-flow/recruit-flow' }) })
  },

  async loadRows() {
    if (!merchant.hasMerchantApi()) {
      this.setData({ rows: [] })
      return
    }
    try {
      const reg = await ops.fetchRegistry()
      const raw = Array.isArray(reg.recruitmentScheduleRows) ? reg.recruitmentScheduleRows : []
      const norm = raw.map((r) => ({
        id: String(r.id || ''),
        time: String(r.time || '—'),
        talentName: String(r.talentName || '—'),
        storeName: String(r.storeName || '—'),
        tableNote: String(r.tableNote || ''),
      }))
      this.setData({ rows: norm })
    } catch (_) {
      this.setData({ rows: [] })
    }
  },

  async onReschedule() {
    if (!merchant.hasMerchantApi()) {
      wx.showModal({ title: '未连接后台', content: '请配置 MERCHANT_API_BASE_URL', showCancel: false })
      return
    }
    wx.showModal({
      title: '生成排期',
      content:
        '小程序端按达人池「已确认」名单与最近一次提交的探店档位做规则排期写入注册表（与电脑端网关同源）。不进行在线 AI 排期推理。',
      confirmText: '继续',
      success: async (res) => {
        if (!res.confirm) return
        await this.runRuleSchedule()
      },
    })
  },

  async runRuleSchedule() {
    this.setData({ busy: true })
    wx.showLoading({ title: '排期中…', mask: true })
    try {
      const meta = readLastSubmit()
      const slots = Array.isArray(meta.visitSlots) && meta.visitSlots.length ? meta.visitSlots : ['09:00-12:00', '14:00-17:00']
      const tableRaw = typeof meta.tablePerMeal === 'number' ? meta.tablePerMeal : Number(meta.tablePerMeal)
      const table = Number.isFinite(tableRaw) ? Math.max(1, Math.floor(tableRaw)) : 4
      const stores = Array.isArray(meta.stores) ? meta.stores : []
      const storeNameFallback = typeof stores[0]?.name === 'string' ? stores[0].name.trim() : ''
      let tenantId = ''
      try {
        tenantId = await rest.fetchPrimaryTenantId()
      } catch (_) {}

      const reg = await ops.fetchRegistry()
      const poolRaw = Array.isArray(reg.talentPoolCandidates) ? reg.talentPoolCandidates : []
      const pool = poolRaw.filter((t) => t && t.status === 'confirmed')

      if (!pool.length) {
        wx.hideLoading()
        this.setData({ busy: false })
        wx.showModal({
          title: '无法排期',
          content: '达人池中暂无「已确认」达人。请先在达人池确认名单，或在电脑端完成上游同步。',
          showCancel: false,
        })
        return
      }

      const base = new Date()
      base.setDate(base.getDate() + 1)
      const rows = pool.map((row, i) => {
        const d = new Date(base)
        d.setDate(d.getDate() + i)
        const slot = slots[i % slots.length] || slots[0]
        const localId = `sch-${Date.now()}-${i}`
        return {
          id: tenantScheduleRowId(tenantId || '', localId),
          time: `${d.getMonth() + 1}/${d.getDate()} ${slot}`,
          talentName: String(row.name || '达人'),
          storeName: storeNameFallback || '待补充门店',
          tableNote: `约 ${table} 人一桌（小程序规则排期 · 对齐 Web 回退路径）`,
        }
      })

      await ops.setRecruitmentScheduleRows(rows)
      wx.hideLoading()
      this.setData({ busy: false, rows })
      wx.showToast({ title: '已写入排期', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      this.setData({ busy: false })
      wx.showModal({
        title: '写入失败',
        content: e instanceof Error ? e.message : String(e),
        showCancel: false,
      })
    }
  },

  goVideoAudit() {
    wx.navigateTo({ url: '/pages/recruit-video-review/recruit-video-review' })
  },
})
