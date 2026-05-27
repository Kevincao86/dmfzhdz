import type { BindGuideConfig } from './bindGuideTypes'

export const KUAISHOU_BIND_GUIDE: BindGuideConfig = {
  introTitle: '快手团购绑定前请准备',
  introBullets: [
    '快手生活服务开放平台企业账号、商家 account_id（商户 ID）。',
    '已创建应用并开通 goodlife 相关能力（门店查询、商品、订单等）。',
    '服务器出口 IP 已加入开放平台白名单（生产环境建议固定 EIP + 反代）。',
    '约 15～30 分钟完成应用配置与 ERP 绑定。',
  ],
  phases: [
    { id: 'open', label: '一、开放平台' },
    { id: 'capability', label: '二、能力与白名单' },
    { id: 'erp', label: '三、灵祺 ERP' },
  ],
  steps: [
    {
      id: 'ks-open-register',
      phase: 'open',
      title: '登录快手生活服务开放平台',
      bullets: [
        '访问 https://open.kwailocallife.com/ 使用企业账号登录。',
        '在「应用管理」中创建或选择自研/服务商应用，记录 App ID 与 App Secret。',
      ],
      imageSrc: '',
      imageAlt: '快手生活服务开放平台',
    },
    {
      id: 'ks-capability',
      phase: 'capability',
      title: '开通能力与 IP 白名单',
      bullets: [
        '在应用详情中申请：门店查询 goodlife.v1.shop.poi.query、经营类目 goodlife.shop.query.category、商品与订单等能力。',
        '参考文档：https://open.kwailocallife.com/docs/api?apiName=goodlife.shop.query.category',
        '将 Vercel/服务器出口 IP 填入白名单；若使用反代，请配置 KUAISHOU_OPENAPI_BASE_URL 指向固定 EIP 反代根地址。',
      ],
      imageSrc: '',
      imageAlt: '能力与白名单',
    },
    {
      id: 'ks-merchant-id',
      phase: 'capability',
      title: '获取商户 account_id',
      bullets: [
        '在快手商家后台或开放平台「商户信息」中查看 account_id（与抖音来客 merchantId 类似）。',
        '确认该 account_id 下已认领门店，否则门店列表为空。',
      ],
      imageSrc: '',
      imageAlt: '商户 ID',
    },
  ],
  erpPhaseLabel: '三、灵祺 ERP 绑定',
  erpStep: {
    title: '在灵祺 ERP 填写并绑定',
    bullets: [
      '路径：系统设置 → 商家版后台 → 团购平台 → 快手团购。',
      '填写 App ID、App Secret、商户 account_id，点击「确认绑定」。',
      '绑定成功后可在本页查看门店列表；商品、首页看板、财务对账与抖音来客能力一致。',
      '生产环境请在 Vercel 配置 MERCHANT_KUAISHOU_SESSION_SECRET（32 字节以上随机串）用于加密会话。',
    ],
  },
}
