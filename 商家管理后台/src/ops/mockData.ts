/**
 * 运营管控台演示数据（本地静态）；生产请对接管理端 API。
 */

export type CustomerAccountStatus = 'normal' | 'disabled' | 'frozen'
export type PayStatus = 'paid' | 'unpaid' | 'overdue'

export type OpsCustomer = {
  id: string
  companyName: string
  contactName: string
  phone: string
  industry: string
  registeredAt: string
  accountStatus: CustomerAccountStatus
  planName: string
  planExpireAt: string
  payStatus: PayStatus
  firstLoginAt: string
  lastLoginAt: string
  activeDays: number
  dau: number
  wau: number
  mau: number
  storeCount: number
  storeStatusSummary: string
  talentRecruitCount: number
  talentOrderCount: number
  licenseNo?: string
  /** 可用余额（元），Supabase 租户有效 */
  walletBalanceYuan?: number
}

export type OpsGlobalAccount = {
  id: string
  customerId: string
  customerName: string
  loginName: string
  accountKind: '主账号' | '子账号'
  status: CustomerAccountStatus
  lastLoginAt: string
}

export type OpsAiModel = {
  id: string
  name: string
  scenario: string
  bindScope: string
  enabled: boolean
  callsTotal: number
  quotaLeft: number
}

export type OpsSupportSession = {
  id: string
  customerName: string
  storeName: string
  channel: string
  lastMessage: string
  updatedAt: string
  status: 'open' | 'closed'
  agent?: string
}

export const MOCK_CUSTOMERS: OpsCustomer[] = [
  {
    id: 'c1',
    companyName: '蜀味火锅（春熙店）',
    contactName: '杨总',
    phone: '138****1028',
    industry: '餐饮',
    registeredAt: '2025-11-02 10:12',
    accountStatus: 'normal',
    planName: '专业版',
    planExpireAt: '2026-08-01',
    payStatus: 'paid',
    firstLoginAt: '2025-11-02 14:20',
    lastLoginAt: '2026-05-05 09:40',
    activeDays: 118,
    dau: 4,
    wau: 18,
    mau: 62,
    storeCount: 3,
    storeStatusSummary: '2 正常 / 1 停用',
    talentRecruitCount: 12,
    talentOrderCount: 28,
    licenseNo: '91510100MA6CXXXX',
  },
  {
    id: 'c2',
    companyName: '轻医美·颜究所',
    contactName: '李店长',
    phone: '139****5560',
    industry: '丽人医美',
    registeredAt: '2026-01-18 16:05',
    accountStatus: 'frozen',
    planName: '基础版',
    planExpireAt: '2026-04-10',
    payStatus: 'overdue',
    firstLoginAt: '2026-01-18 17:00',
    lastLoginAt: '2026-04-02 11:15',
    activeDays: 45,
    dau: 0,
    wau: 2,
    mau: 8,
    storeCount: 1,
    storeStatusSummary: '1 正常',
    talentRecruitCount: 2,
    talentOrderCount: 3,
  },
  {
    id: 'c3',
    companyName: '乐动健身连锁',
    contactName: '王运营',
    phone: '137****8891',
    industry: '运动健身',
    registeredAt: '2025-08-20 09:30',
    accountStatus: 'disabled',
    planName: '专业版',
    planExpireAt: '2025-12-31',
    payStatus: 'unpaid',
    firstLoginAt: '2025-08-20 10:00',
    lastLoginAt: '2026-02-01 08:00',
    activeDays: 201,
    dau: 0,
    wau: 0,
    mau: 1,
    storeCount: 5,
    storeStatusSummary: '5 停用',
    talentRecruitCount: 0,
    talentOrderCount: 0,
  },
]

export const MOCK_GLOBAL_ACCOUNTS: OpsGlobalAccount[] = [
  {
    id: 'a1',
    customerId: 'c1',
    customerName: '蜀味火锅（春熙店）',
    loginName: 'shuxi_admin',
    accountKind: '主账号',
    status: 'normal',
    lastLoginAt: '2026-05-05 09:40',
  },
  {
    id: 'a2',
    customerId: 'c1',
    customerName: '蜀味火锅（春熙店）',
    loginName: 'shuxi_ops01',
    accountKind: '子账号',
    status: 'normal',
    lastLoginAt: '2026-05-04 18:22',
  },
  {
    id: 'a3',
    customerId: 'c2',
    customerName: '轻医美·颜究所',
    loginName: 'yanjiu_admin',
    accountKind: '主账号',
    status: 'frozen',
    lastLoginAt: '2026-04-02 11:15',
  },
]

export const MOCK_AI_MODELS: OpsAiModel[] = [
  {
    id: 'm1',
    name: 'GEO 地域优化模型',
    scenario: '门店地域词与榜单',
    bindScope: '全量客户',
    enabled: true,
    callsTotal: 128_900,
    quotaLeft: 1_000_000,
  },
  {
    id: 'm2',
    name: '内容生成（团购文案）',
    scenario: '商品标题与卖点',
    bindScope: '指定客户：蜀味火锅',
    enabled: true,
    callsTotal: 45_200,
    quotaLeft: 200_000,
  },
  {
    id: 'm3',
    name: '智能问答（客服辅助）',
    scenario: '评论与私信话术',
    bindScope: '全量客户',
    enabled: false,
    callsTotal: 12_300,
    quotaLeft: 0,
  },
]

export const MOCK_SUPPORT_SESSIONS: OpsSupportSession[] = [
  {
    id: 's1',
    customerName: '蜀味火锅（春熙店）',
    storeName: '春熙路旗舰店',
    channel: '网页客服',
    lastMessage: '达人排期能否提前到本周五？',
    updatedAt: '2026-05-06 10:22',
    status: 'open',
    agent: '客服-小张',
  },
  {
    id: 's2',
    customerName: '轻医美·颜究所',
    storeName: '总店',
    channel: '小程序',
    lastMessage: '发票抬头需要修改',
    updatedAt: '2026-05-05 16:40',
    status: 'open',
  },
  {
    id: 's3',
    customerName: '乐动健身连锁',
    storeName: '城南店',
    channel: '网页客服',
    lastMessage: '已解决，感谢。',
    updatedAt: '2026-04-20 09:10',
    status: 'closed',
    agent: '客服-小李',
  },
]

export function getCustomerById(id: string): OpsCustomer | undefined {
  return MOCK_CUSTOMERS.find((c) => c.id === id)
}
