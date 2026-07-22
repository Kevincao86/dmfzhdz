/** 「功能」Tab — 与 Web merchant-erp/src/config/nav.ts 模块对齐 */
const FUNCTION_SECTIONS = [
  {
    id: 'store',
    title: '店铺',
    layout: 'grid3',
    tone: 'cyan',
    rowDesc: '',
    sectionIcon: 'shop',
    items: [
      {
        kind: 'link',
        url: '/pages/store-list/store-list?mode=info',
        title: '店铺信息',
        desc: '管理店铺基础信息',
        iconKey: 'shop',
      },
      {
        kind: 'link',
        url: '/pages/store-menu/store-menu',
        title: '菜单价目表',
        desc: '价目同步与本地编辑',
        iconKey: 'list',
      },
      {
        kind: 'link',
        url: '/pages/store-list/store-list?mode=decoration',
        title: '店铺装修',
        desc: '自定义店铺页面',
        iconKey: 'paint',
      },
      {
        kind: 'link',
        url: '/pages/dashboard/dashboard',
        title: '经营概览',
        desc: '数据看板与分析',
        iconKey: 'chart',
      },
    ],
  },
  {
    id: 'product',
    title: '商品',
    layout: 'grid3',
    tone: 'orange',
    rowDesc: '',
    sectionIcon: 'list',
    items: [
      {
        kind: 'link',
        url: '/pages/product-create/product-create',
        title: '新建商品',
        desc: '快速发布新商品',
        iconKey: 'plus',
      },
      {
        kind: 'link',
        url: '/pages/product-list/product-list',
        title: '商品列表',
        desc: '管理商品与库存',
        iconKey: 'list',
      },
      {
        kind: 'link',
        url: '/pages/product-voice/product-voice',
        title: '语音建品',
        desc: '语音描述快速建品',
        iconKey: 'mic',
      },
    ],
  },
  {
    id: 'ops',
    title: '运营',
    layout: 'grid3',
    tone: 'violet',
    rowDesc: '',
    sectionIcon: 'chart',
    items: [
      {
        kind: 'link',
        url: '/pages/recruit-hub/recruit-hub',
        title: '达人招募',
        desc: '招募达人合作推广',
        iconKey: 'star',
      },
      {
        kind: 'link',
        url: '/pages/reviews-list/reviews-list',
        title: '评价管理',
        desc: '查看与回复评价',
        iconKey: 'chat',
      },
      {
        kind: 'link',
        url: '/pages/activity-center/activity-center',
        title: '活动中心',
        desc: '创建与管理活动',
        iconKey: 'gift',
      },
      {
        kind: 'link',
        url: '/pages/geo-assist/geo-assist',
        title: 'GEO运营优化',
        desc: '提升门店曝光排名',
        iconKey: 'pin',
      },
      {
        kind: 'link',
        url: '/pages/competitors/competitors',
        title: '竞争对手分析',
        desc: '竞品情报与对比',
        iconKey: 'chart',
      },
      {
        kind: 'link',
        url: '/pages/recruit-brief-records/recruit-brief-records',
        title: 'Brief记录',
        desc: '达人 Brief 历史',
        iconKey: 'list',
      },
    ],
  },
  {
    id: 'ai-create',
    title: 'AI 创作',
    layout: 'grid3',
    tone: 'violet',
    rowDesc: '',
    sectionIcon: 'ai',
    items: [
      {
        kind: 'link',
        url: '/pages/ai-ops-plan/ai-ops-plan',
        title: 'AI 运营方案',
        desc: '多平台结构化方案',
        iconKey: 'chart',
      },
      {
        kind: 'link',
        url: '/pages/ai-visual-studio/ai-visual-studio',
        title: 'AI视觉工坊',
        desc: '多端海报 · AI文案出图',
        iconKey: 'paint',
      },
      {
        kind: 'link',
        url: '/pages/ai-content/ai-content',
        title: '爆款 Brief 生成',
        desc: '智能生成内容',
        iconKey: 'ai',
      },
      {
        kind: 'link',
        url: '/pages/shortvideo-ai/shortvideo-ai',
        title: '短视频AI处理',
        desc: '智能剪辑与创作',
        iconKey: 'play',
      },
      {
        kind: 'link',
        url: '/pages/digital-human/digital-human',
        title: '数字人口播',
        desc: '口播 TTS 试听',
        iconKey: 'mic',
      },
    ],
  },
  {
    id: 'ads',
    title: '投流',
    layout: 'row',
    tone: 'blue',
    rowDesc: '投放推广与效果分析',
    sectionIcon: 'trend',
    items: [{ kind: 'link', url: '/pages/ads-manage/ads-manage', title: '投流管理', desc: '', iconKey: 'trend' }],
  },
  {
    id: 'leads',
    title: '线索',
    layout: 'row',
    tone: 'teal',
    rowDesc: '线索管理与跟进转化',
    sectionIcon: 'user',
    items: [{ kind: 'link', url: '/pages/leads-center/leads-center', title: '线索中心', desc: '', iconKey: 'user' }],
  },
  {
    id: 'finance',
    title: '财务',
    layout: 'grid2',
    tone: 'amber',
    rowDesc: '订单结算与财务管理',
    sectionIcon: 'wallet',
    items: [
      {
        kind: 'link',
        url: '/pages/finance-reconcile/finance-reconcile',
        title: '财务对账',
        desc: '账单核对与核销',
        iconKey: 'wallet',
      },
      {
        kind: 'link',
        url: '/pages/finance-tax/finance-tax',
        title: '报税管理',
        desc: '税务申报辅助',
        iconKey: 'chart',
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
        iconKey: it.iconKey,
        tone: sec.tone,
      })
    }
  }
  return cells
}

module.exports = { FUNCTION_SECTIONS, itemUrl, flattenItems }
