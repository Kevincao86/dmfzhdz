/**
 * 「功能」Tab 宫格：店铺 / 商品 / 运营 / 投流 / 线索 / 财务（与 Web nav 模块对齐）
 */
const FUNCTION_SECTIONS = [
  {
    id: 'store',
    title: '店铺',
    desc: '门店档案、装修与平台绑定',
    tone: 'cyan',
    items: [
      {
        kind: 'link',
        url: '/pages/store-list/store-list?mode=info',
        title: '店铺信息',
        desc: '多平台门店档案',
        glyph: '信',
      },
      {
        kind: 'link',
        url: '/pages/store-list/store-list?mode=decoration',
        title: '店铺装修',
        desc: '门店素材与展示',
        glyph: '装',
      },
      {
        kind: 'link',
        url: '/pages/dashboard/dashboard',
        title: '经营概览',
        desc: '核心指标速览',
        glyph: '览',
      },
    ],
  },
  {
    id: 'product',
    title: '商品',
    desc: '录入、列表与上架',
    tone: 'orange',
    items: [
      {
        kind: 'link',
        url: '/pages/product-create/product-create',
        title: '新建商品',
        desc: '选平台 · 类目/类型 · 与电脑端同源',
        glyph: '建',
      },
      {
        kind: 'link',
        url: '/pages/product-list/product-list',
        title: '商品列表',
        desc: '多平台查看 · 支持与电脑端一致的同步',
        glyph: '列',
      },
    ],
  },
  {
    id: 'ops',
    title: '运营',
    desc: '',
    tone: 'violet',
    items: [
      {
        kind: 'link',
        url: '/pages/recruit-hub/recruit-hub',
        title: '达人招募',
        desc: '',
        glyph: '招',
      },
      {
        kind: 'link',
        url: '/pages/reviews-list/reviews-list',
        title: '评价管理',
        desc: '',
        glyph: '评',
      },
      {
        kind: 'link',
        url: '/pages/activity-center/activity-center',
        title: '活动中心',
        desc: '',
        glyph: '活',
      },
      {
        kind: 'link',
        url: '/pages/geo-assist/geo-assist',
        title: 'GEO 运营优化',
        desc: '',
        glyph: '址',
      },
      {
        kind: 'link',
        url: '/pages/ai-content/ai-content',
        title: 'AI 文章与话题',
        desc: '',
        glyph: '文',
      },
      {
        kind: 'link',
        url: '/pages/shortvideo-ai/shortvideo-ai',
        title: '短视频AI处理',
        desc: '',
        glyph: '剪',
      },
    ],
  },
  {
    id: 'ads',
    title: '投流',
    desc: '广告计划与素材',
    tone: 'rose',
    items: [
      {
        kind: 'link',
        url: '/pages/ads-manage/ads-manage',
        title: '投流管理',
        desc: '计划与投放状态',
        glyph: '投',
      },
    ],
  },
  {
    id: 'leads',
    title: '线索',
    desc: '获客与跟进',
    tone: 'blue',
    items: [
      {
        kind: 'link',
        url: '/pages/leads-center/leads-center',
        title: '线索中心',
        desc: '分配与转化',
        glyph: '索',
      },
    ],
  },
  {
    id: 'finance',
    title: '财务',
    desc: '对账与税务',
    tone: 'emerald',
    items: [
      {
        kind: 'link',
        url: '/pages/finance-reconcile/finance-reconcile',
        title: '财务对账',
        desc: '账单与核销',
        glyph: '账',
      },
      {
        kind: 'link',
        url: '/pages/finance-tax/finance-tax',
        title: '报税管理',
        desc: '税务辅助',
        glyph: '税',
      },
    ],
  },
]

function itemUrl(it) {
  if (it.kind === 'link') return it.url
  if (it.kind === 'mod') return `/pages/module-detail/module-detail?k=${it.key}`
  return it.url
}

function flattenItems() {
  const cells = []
  for (const sec of FUNCTION_SECTIONS) {
    for (const it of sec.items) {
      cells.push({
        sectionId: sec.id,
        sectionTitle: sec.title,
        title: it.title,
        desc: it.desc,
        url: itemUrl(it),
        glyph: it.glyph,
        tone: sec.tone,
        badge: it.badge || '',
      })
    }
  }
  return cells
}

module.exports = { FUNCTION_SECTIONS, itemUrl, flattenItems }
