const feat = require('../../utils/merchantFeatureApisMp.js')
const economics = require('../../utils/mpPointsEconomicsMp.js')

const PLATFORMS = [
  { id: '抖音', label: '抖音' },
  { id: '小红书', label: '小红书' },
  { id: '大众点评', label: '大众点评' },
  { id: '快手', label: '快手' },
  { id: '微信视频号', label: '微信视频号' },
]

const GOAL_TEMPLATES = [
  { id: 'xin', label: '拉新到店', note: '提升新客到店与核销，主推引流款与周末场，控制获客成本占比。', budget: '30000' },
  { id: 'zhoumo', label: '冲周末堂食', note: '聚焦周五至周日堂食高峰，短视频+本地推组合拉满翻台。', budget: '25000' },
  { id: 'cost', label: '控达人成本', note: '腰尾部达人与 KOC 为主，压缩头部占比，保证 ROI 中位以上。', budget: '20000' },
  { id: 'live', label: '直播冲刺', note: '安排 2～4 场本地直播，配合直播投流与货盘秒杀。', budget: '40000' },
  { id: 'fukou', label: '复购锁客', note: '老客召回与储值/次卡，私域+短视频种草，提高 30 日复购率。', budget: '18000' },
  { id: 'kaidian', label: '新店冷启', note: '开业 30 天冷启动：探店达人+点评好评+引流套餐，快速堆评价与核销。', budget: '35000' },
  { id: 'jieri', label: '节日大促', note: '围绕节点做主题套餐与限时秒杀，集中投放短视频。', budget: '45000' },
  { id: 'pinpai', label: '品牌种草', note: '小红书/视频号内容种草为主，弱转化强心智，配合少量到店转化链路。', budget: '28000' },
  { id: 'benditui', label: '本地推放量', note: '信息流/本地推为主、达人为辅，按平台中位转化控 CPA，日更素材测款。', budget: '32000' },
  { id: 'pingjia', label: '评价口碑', note: '冲好评与差评治理，内容侧曝光招牌菜，转化侧引导晒图核销。', budget: '15000' },
  { id: 'tuangou', label: '团购冲量', note: '主推高性价比团购套餐，美团/抖音双端货盘对齐，冲核销单量。', budget: '22000' },
  { id: 'shequn', label: '社群私域', note: '视频号+社群裂变，老带新券与到店核销，降低公域获客依赖。', budget: '16000' },
]

function monthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { periodStart: fmt(start), periodEnd: fmt(end) }
}

function mapPlatforms(selected) {
  const set = new Set(selected || [])
  return PLATFORMS.map((p) => ({ ...p, on: set.has(p.id) }))
}

function mapGoals(id) {
  return GOAL_TEMPLATES.map((t) => ({ ...t, on: t.id === id }))
}

function flattenSimple(simple) {
  if (!simple || typeof simple !== 'object') return null
  const hero = simple.hero || {}
  return {
    heroTitle: String(hero.title || hero.headline || '').trim(),
    heroSub: String(hero.subtitle || hero.desc || hero.summary || '').trim(),
    steps: Array.isArray(simple.steps)
      ? simple.steps.map((s, i) => ({
          n: i + 1,
          title: String((s && (s.title || s.name)) || `步骤 ${i + 1}`).trim(),
          desc: String((s && (s.desc || s.detail || s.content)) || '').trim(),
        }))
      : [],
    platforms: Array.isArray(simple.platforms)
      ? simple.platforms.map((p) => ({
          name: String((p && (p.name || p.platform || p.title)) || '').trim(),
          how: String((p && (p.how || p.desc || p.play)) || '').trim(),
        }))
      : [],
    combos: Array.isArray(simple.combos)
      ? simple.combos.map((c) => ({
          name: String((c && c.name) || '').trim(),
          price: String((c && (c.price || c.priceYuan)) || '').trim(),
          selling: String((c && (c.sellingPoint || c.desc)) || '').trim(),
        }))
      : [],
    checklist: Array.isArray(simple.checklist)
      ? simple.checklist.map((x) =>
          typeof x === 'string' ? x : String((x && (x.text || x.title || x.item)) || '').trim(),
        )
      : [],
  }
}

Page({
  data: {
    platforms: mapPlatforms(['抖音', '小红书']),
    selectedPlatforms: ['抖音', '小红书'],
    planEdition: 'simple',
    goalTemplates: mapGoals(null),
    goalTemplateId: '',
    budgetYuan: '30000',
    periodStart: '',
    periodEnd: '',
    storeName: '',
    goalsNote: '',
    busy: false,
    err: '',
    plan: null,
    simple: null,
    pointsHint: '',
    opsPoints: economics.MP_POINTS_OPS_PLAN_PER_USE,
    editionTip: '简易版：白话步骤 + 图文卡片，默认推荐中小商家。',
  },

  onLoad() {
    const range = monthRange()
    const menu = feat.readStoreMenu()
    let displayName = ''
    try {
      displayName = String(wx.getStorageSync('meoo_erp_merchant_display_name') || '').trim()
    } catch (_) {}
    this.setData({
      periodStart: range.periodStart,
      periodEnd: range.periodEnd,
      storeName: menu.storeName || displayName,
    })
  },

  onEdition(e) {
    const id = e.currentTarget.dataset.id === 'standard' ? 'standard' : 'simple'
    this.setData({
      planEdition: id,
      plan: null,
      simple: null,
      err: '',
      editionTip:
        id === 'simple'
          ? '简易版：白话步骤 + 图文卡片，默认推荐中小商家。'
          : '标准版：运营/执行/预算/日历/达人/货盘六表，适合有运营基础的商家。',
    })
  },

  onGoal(e) {
    const id = e.currentTarget.dataset.id
    const t = GOAL_TEMPLATES.find((x) => x.id === id)
    if (!t) return
    this.setData({
      goalTemplateId: t.id,
      goalTemplates: mapGoals(t.id),
      budgetYuan: t.budget,
      goalsNote: t.note,
    })
  },

  onTogglePlatform(e) {
    const id = e.currentTarget.dataset.id
    let selected = [...this.data.selectedPlatforms]
    if (selected.includes(id)) selected = selected.filter((x) => x !== id)
    else selected.push(id)
    this.setData({ selectedPlatforms: selected, platforms: mapPlatforms(selected) })
  },

  onBudget(e) {
    this.setData({ budgetYuan: e.detail.value })
  },
  onPeriodStart(e) {
    this.setData({ periodStart: e.detail.value })
  },
  onPeriodEnd(e) {
    this.setData({ periodEnd: e.detail.value })
  },
  onStoreName(e) {
    this.setData({ storeName: e.detail.value })
  },
  onGoalsNote(e) {
    this.setData({ goalsNote: e.detail.value })
  },

  onGenerate() {
    if (!this.data.selectedPlatforms.length) {
      wx.showToast({ title: '请至少选一个平台', icon: 'none' })
      return
    }
    const budgetYuan = Number(this.data.budgetYuan)
    if (!Number.isFinite(budgetYuan) || budgetYuan <= 0) {
      wx.showToast({ title: '请填写有效预算', icon: 'none' })
      return
    }
    this.setData({ busy: true, err: '', plan: null, simple: null, pointsHint: '' })
    void (async () => {
      const menu = feat.readStoreMenu()
      const r = await feat.generateAiOpsPlan({
        platforms: this.data.selectedPlatforms,
        budgetYuan,
        periodStart: this.data.periodStart,
        periodEnd: this.data.periodEnd,
        goalsNote: String(this.data.goalsNote || '').trim() || undefined,
        storeName: String(this.data.storeName || '').trim() || undefined,
        menuSummary: feat.menuSummaryLines(menu.items) || undefined,
        margins: feat.readMargins(),
        industryPath: feat.readIndustryPath() || undefined,
        planEdition: this.data.planEdition,
      })
      if (!r.ok) {
        this.setData({ busy: false, err: r.message || '生成失败' })
        return
      }
      let pointsHint = ''
      if (r.pointsCharged != null) {
        pointsHint =
          `已扣 ${r.pointsCharged} 积分` + (r.pointsBalance != null ? ` · 余额 ${r.pointsBalance}` : '')
      }
      this.setData({
        busy: false,
        plan: r.plan,
        simple: flattenSimple(r.plan && r.plan.simplePlan),
        pointsHint,
      })
    })()
  },
})
