export type OpsPageHeroKey =
  | 'customers'
  | 'mp-membership-finance'
  | 'talent-library'
  | 'shoot-team-library'
  | 'edit-team-library'
  | 'pr-library'
  | 'recruitment-orders'
  | 'mp-recruitment-orders'
  | 'announcements'
  | 'mp-announcements'

export type OpsPageHeroMeta = {
  image: string
  title: string
  description: string
  accent: string
}

export const OPS_PAGE_HERO: Record<OpsPageHeroKey, OpsPageHeroMeta> = {
  customers: {
    image: '/ops-hero/customers.png',
    title: '客户管理',
    description:
      '管理商家租户注册、套餐试用与订阅、账号状态；支持 Supabase 云端租户与注册表合并展示，手动开通与 Tokenmix 用量绑定。',
    accent: '#4f46e5',
  },
  'mp-membership-finance': {
    image: '/ops-hero/mp-membership-finance.png',
    title: '星选会员财务',
    description:
      '汇总达人 / PR / 拍摄 / 剪辑各档会员的微信支付开通记录，按角色与套餐统计已确认收入，支持 CSV / Excel 导出。',
    accent: '#0ea5e9',
  },
  'talent-library': {
    image: '/ops-hero/talent-library.png',
    title: '灵祺达人库',
    description:
      '达人填写平台资料或报名后按平台账号去重入库；按平台、粉丝档位、带货等级筛选，可批量调整星选达人版会员权限。',
    accent: '#8b5cf6',
  },
  'shoot-team-library': {
    image: '/ops-hero/shoot-team-library.png',
    title: '拍摄团队库',
    description:
      '小程序与履约 Web 注册为拍摄团队后自动入库（LQ-PS 编号）；支持扫描会员池补全，管理拍摄团队版会员权限。',
    accent: '#f59e0b',
  },
  'edit-team-library': {
    image: '/ops-hero/edit-team-library.png',
    title: '剪辑团队库',
    description:
      '小程序与履约 Web 注册为剪辑团队后自动入库（LQ-J 编号）；支持扫描会员池补全，管理剪辑团队版会员权限。',
    accent: '#10b981',
  },
  'pr-library': {
    image: '/ops-hero/pr-library.png',
    title: 'PR 用户库',
    description:
      '小程序 PR 填写资料后自动入库；按省市筛选，批量开通推荐大厅等增值服务，查看星选 PR 版会员权限详情。',
    accent: '#ec4899',
  },
  'recruitment-orders': {
    image: '/ops-hero/recruitment-orders.png',
    title: '商家 ERP 招募',
    description:
      '商家 ERP / 小程序提交的达人招募需求；运营接单、手动回传达人表或流转至达人招募小程序，全流程状态跟踪。',
    accent: '#6366f1',
  },
  'mp-recruitment-orders': {
    image: '/ops-hero/mp-recruitment-orders.png',
    title: '小程序招募',
    description:
      '开环：报名→运营反选→寄样探店→审核发布；闭环：云剪成片直派→确认接收→发布回链→待结算。',
    accent: '#14b8a6',
  },
  announcements: {
    image: '/ops-hero/announcements.png',
    title: '商家 ERP 公告',
    description:
      '向灵祺 ERP 注册用户推送站内公告，商户在 ERP 右上角铃铛查看；支持套餐到期预警与平台改动通知。',
    accent: '#3b82f6',
  },
  'mp-announcements': {
    image: '/ops-hero/mp-announcements.png',
    title: '达人小程序公告',
    description:
      '按省/市、平台、带货等级、粉丝档位精准筛选达人；推送后命中用户在小程序首页弹窗并在消息通知中保留。',
    accent: '#a855f7',
  },
}
