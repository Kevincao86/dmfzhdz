/**
 * 与 web版/merchant-erp/src/config/nav.ts 模块对齐。
 * featuredOnly：仅在首页「特色功能」展示，不出现在下方宫格。
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
        kind: 'voice',
        url: '/pages/product-voice/product-voice',
        title: '语音录入商品',
        desc: '口述品类、套餐、价格 → AI 草稿 → 编辑页补全',
        badge: '语音',
        featuredOnly: true,
        featuredRank: 1,
        featuredTitle: '语音录入商品',
        featuredGlyph: '品',
        featuredTheme: 'cyan',
        featuredShortDesc: '口述品类价格 · AI 生成草稿',
      },
      {
        kind: 'link',
        url: '/pages/product-list/product-list',
        title: '商品列表',
        desc: '与电脑端「商品 → 列表」同一套数据',
      },
      {
        kind: 'link',
        url: '/pages/product-voice/product-voice',
        title: '新建商品流程',
        desc: '语音录入 → 编辑补全（与电脑端新建商品一致）',
      },
    ],
  },
  {
    title: '运营',
    items: [
      {
        kind: 'voice',
        url: '/pages/recruit-voice/recruit-voice',
        title: '达人招募 · 语音',
        desc: '口述岗位与交付 → AI 归纳 → 编辑确认发布',
        badge: '语音',
        featuredOnly: true,
        featuredRank: 2,
        featuredTitle: '语音达人招募',
        featuredGlyph: '募',
        featuredTheme: 'violet',
        featuredShortDesc: '口述岗位交付 · 快速建招募单',
      },
      {
        kind: 'link',
        url: '/pages/recruitment/recruitment',
        title: '达人招募',
        desc: '列表与提交与电脑端同一套数据（需连接电脑端后台）',
      },
      { kind: 'mod', key: 'activity', title: '活动中心', desc: '活动创建、排期与效果（完整功能在电脑端）' },
      {
        kind: 'link',
        url: '/pages/reviews-list/reviews-list',
        title: '评论管理',
        desc: '评价列表与回复（与电脑端一致）',
      },
      {
        kind: 'mod',
        key: 'geo',
        title: 'GEO 运营优化',
        desc: '地域与曝光优化（完整功能在电脑端）',
        featuredOnly: true,
        featuredRank: 4,
        featuredTitle: 'GEO 运营优化',
        featuredGlyph: '址',
        featuredTheme: 'green',
        featuredShortDesc: '地域曝光 · 关键词与线索',
      },
      { kind: 'mod', key: 'ai_content', title: 'AI 文章与话题', desc: '内容生产（完整功能在电脑端）' },
      {
        kind: 'voice',
        url: '/pages/shortvideo-voice/shortvideo-voice',
        title: '短视频优化 · 语音',
        desc: '口述脚本 / 卖点 → AI 拆结构 → 编辑页微调',
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
