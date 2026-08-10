/**
 * 与 web版/merchant-erp/src/config/nav.ts 模块对齐。
 * featuredOnly：仅在首页「特色功能」展示，不出现在下方宫格。
 * mpHide：配合 utils/mpUiFlags.js 临时隐藏入口。
 */
const SECTIONS = [
  {
    title: '常用',
    items: [
      {
        kind: 'link',
        url: '/pages/dashboard/dashboard',
        title: '经营概览',
        desc: '核心指标速览（详情图表请在电脑端首页查看）',
      },
      {
        kind: 'link',
        url: '/pages/wallet/wallet',
        title: '我的钱包',
        desc: '余额、账单与充值 / 退款申报',
        mpHide: 'wallet',
      },
    ],
  },
  {
    title: '店铺',
    items: [
      { kind: 'mod', key: 'store_info', title: '店铺信息', desc: '门店档案、营业信息与平台绑定' },
      { kind: 'mod', key: 'store_decoration', title: '店铺装修', desc: '装修模板与门店素材' },
    ],
  },
  {
    title: '商品',
    items: [
      {
        kind: 'link',
        url: '/pages/product-create/product-create',
        title: '新建商品',
        desc: '先选上架平台 → 类目与类型 → 填写商品信息与提交',
      },
      {
        kind: 'link',
        url: '/pages/product-list/product-list',
        title: '商品列表',
        desc: '与电脑端「商品 → 列表」同一套数据',
      },
    ],
  },
  {
    title: '运营',
    items: [
      {
        kind: 'link',
        url: '/pages/recruit-hub/recruit-hub',
        title: '达人招募',
        desc: '五步流程 · Brief · 订单（与 Web 同源）',
      },
      { kind: 'mod', key: 'activity', title: '活动中心', desc: '活动创建、排期与效果（完整功能在电脑端）' },
      {
        kind: 'link',
        url: '/pages/reviews-list/reviews-list',
        title: '评价管理',
        desc: '门店/商品评价、同步与回复（对齐电脑端评价管理）',
      },
      {
        kind: 'link',
        url: '/pages/geo-assist/geo-assist',
        title: 'GEO 运营优化',
        desc: '概览与健康分 · 咨询测试 · 多端同源',
        featuredOnly: true,
        featuredRank: 2,
        featuredTitle: 'GEO 运营优化',
        featuredGlyph: '址',
        featuredTheme: 'green',
        featuredShortDesc: '概览评分 · 搜索优化',
      },
      {
        kind: 'link',
        url: '/pages/ai-content/ai-content',
        title: '文章与话题',
        desc: '文章与话题草稿 · 来客上下文',
      },
      {
        kind: 'link',
        url: '/pages/ai-visual-studio/ai-visual-studio',
        title: '视觉工坊',
        desc: '多端海报 · 文案 · 一键出图（对齐电脑端）',
      },
      {
        kind: 'link',
        url: '/pages/shortvideo-ai/shortvideo-ai',
        title: '短视频出片',
        desc: '可灵成片 · ICE 云剪 · 对齐电脑端',
      },
      {
        kind: 'voice',
        url: '/pages/shortvideo-voice/shortvideo-voice',
        title: '短视频优化 · 语音',
        desc: '口述脚本 / 卖点 → 自动拆结构 → 编辑页微调',
        badge: '语音',
        featuredOnly: true,
        featuredRank: 3,
        featuredTitle: '语音短视频优化',
        featuredGlyph: '映',
        featuredTheme: 'amber',
        featuredShortDesc: '口述脚本卖点 · 结构一键拆解',
      },
      { kind: 'mod', key: 'shortvideo', title: '短视频优化 · 看板', desc: '脚本诊断与任务（完整看板在电脑端）' },
      { kind: 'mod', key: 'live_check', title: '直播间分析', desc: '流量与转化（完整功能在电脑端）' },
      { kind: 'mod', key: 'platform_target', title: '平台签框', desc: '签约目标与进度（完整功能在电脑端）' },
    ],
  },
  {
    title: '增长',
    items: [
      { kind: 'mod', key: 'advertising', title: '投流', desc: '广告投放计划（请在电脑端操作）' },
      { kind: 'mod', key: 'leads', title: '线索', desc: '线索分配与转化（请在电脑端操作）' },
    ],
  },
  {
    title: '财务',
    items: [
      { kind: 'mod', key: 'finance', title: '财务对账', desc: '账单核对（请在电脑端操作）' },
      { kind: 'mod', key: 'finance_tax', title: '报税管理', desc: '税务辅助（请在电脑端操作）' },
    ],
  },
  {
    title: '系统',
    items: [{ kind: 'mod', key: 'settings', title: '系统设置', desc: '店铺授权与密钥请在电脑端商家后台操作' }],
  },
]

module.exports = { SECTIONS }
