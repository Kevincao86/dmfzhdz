/**
 * 「功能」Tab — 服务商版，与 fws Web filterNavItemsForPartnerEdition 对齐
 */
const fwsWeb = require('./fwsWebBridgeMp.js')

function buildPartnerFunctionSections(opts) {
  const isParent = opts && opts.isParent !== false
  const sections = [
    {
      id: 'home',
      title: '首页',
      layout: 'row',
      tone: 'cyan',
      rowDesc: isParent ? '全部客户汇总与经营看板' : '我的客户汇总',
      sectionIcon: 'chart',
      items: [
        {
          kind: 'link',
          url: fwsWeb.fwsWebPageUrl('/home'),
          title: isParent ? '全部客户汇总' : '我的客户汇总',
          desc: '',
          iconKey: 'chart',
        },
      ],
    },
    {
      id: 'store',
      title: '客户门店',
      layout: 'grid3',
      tone: 'cyan',
      rowDesc: '',
      sectionIcon: 'shop',
      items: [
        {
          kind: 'link',
          url: '/pages/store-list/store-list?mode=info',
          title: '门店信息',
          desc: '管理客户门店资料',
          iconKey: 'shop',
        },
        {
          kind: 'link',
          url: '/pages/store-menu/store-menu',
          title: '菜单价目表',
          desc: '客户价目同步与编辑',
          iconKey: 'list',
        },
        {
          kind: 'link',
          url: '/pages/store-list/store-list?mode=decoration',
          title: '门店装修',
          desc: '客户门店页面装修',
          iconKey: 'paint',
        },
        {
          kind: 'link',
          url: '/pages/dashboard/dashboard',
          title: '经营概览',
          desc: '客户数据看板',
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
          desc: '为客户发布团购',
          iconKey: 'plus',
        },
        {
          kind: 'link',
          url: '/pages/product-list/product-list',
          title: '商品列表',
          desc: '管理客户商品',
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
          url: '/pages/partner-xingxuan-hub/partner-xingxuan-hub',
          title: '星选达人招募',
          desc: '招募大厅 · 发单 · 增值服务',
          iconKey: 'star',
        },
        {
          kind: 'link',
          url: '/pages/reviews-list/reviews-list',
          title: '评价管理',
          desc: '客户门店评价回复',
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
          title: '客户增长',
          desc: 'GEO 优化提升曝光',
          iconKey: 'pin',
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
          url: fwsWeb.fwsWebPageUrl('/ai-create/record-workshop'),
          title: '录播工坊',
          desc: '口播脚本 · 成片合成',
          iconKey: 'play',
        },
      ],
    },
    {
      id: 'ads',
      title: '投流',
      layout: 'row',
      tone: 'blue',
      rowDesc: '客户本地推投放与效果',
      sectionIcon: 'trend',
      items: [{ kind: 'link', url: '/pages/ads-manage/ads-manage', title: '投流管理', desc: '', iconKey: 'trend' }],
    },
    {
      id: 'leads',
      title: '线索',
      layout: 'row',
      tone: 'teal',
      rowDesc: '客户线索跟进转化',
      sectionIcon: 'user',
      items: [{ kind: 'link', url: '/pages/leads-center/leads-center', title: '线索中心', desc: '', iconKey: 'user' }],
    },
    {
      id: 'finance',
      title: '财务',
      layout: isParent ? 'grid3' : 'grid2',
      tone: 'amber',
      rowDesc: '客户账单与代理结算',
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
        ...(isParent
          ? [
              {
                kind: 'link',
                url: fwsWeb.fwsWebPageUrl('/finance/agent-settlement'),
                title: '代理结算',
                desc: '子代理分润结算',
                iconKey: 'wallet',
              },
            ]
          : []),
      ],
    },
    {
      id: 'system',
      title: '系统',
      layout: 'grid3',
      tone: 'cyan',
      rowDesc: '',
      sectionIcon: 'list',
      items: [
        {
          kind: 'link',
          url: fwsWeb.fwsWebPageUrl('/settings', { tab: 'platforms' }),
          title: '平台连接',
          desc: '抖音林客 · 快手团购',
          iconKey: 'bind',
        },
        ...(isParent
          ? [
              {
                kind: 'link',
                url: fwsWeb.fwsWebPageUrl('/settings', { tab: 'merchant' }),
                title: '服务商平台',
                desc: 'SP 平台绑定',
                iconKey: 'shop',
              },
              {
                kind: 'link',
                url: fwsWeb.fwsWebPageUrl('/settings', { tab: 'partner_clients' }),
                title: '客户商家',
                desc: '代操客户档案',
                iconKey: 'user',
              },
              {
                kind: 'link',
                url: fwsWeb.fwsWebPageUrl('/settings', { tab: 'partner_agents' }),
                title: '代理管理',
                desc: '子代理账号',
                iconKey: 'switchUser',
              },
            ]
          : []),
        {
          kind: 'link',
          url: fwsWeb.fwsWebPageUrl('/settings', { tab: 'partner_entitlements' }),
          title: isParent ? '权益分配' : '我的权益',
          desc: '代理权益配置',
          iconKey: 'crown',
        },
        {
          kind: 'link',
          url: fwsWeb.fwsWebPageUrl('/settings', { tab: 'accounts' }),
          title: '账号管理',
          desc: '子账号与权限',
          iconKey: 'switchUser',
        },
        {
          kind: 'link',
          url: fwsWeb.fwsWebPageUrl('/settings', { tab: 'subscription' }),
          title: '订阅',
          desc: '与电脑端同步',
          iconKey: 'crown',
        },
      ],
    },
  ]
  return sections
}

module.exports = { buildPartnerFunctionSections }
