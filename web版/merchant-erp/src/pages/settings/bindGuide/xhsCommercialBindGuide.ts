import type { BindGuideConfig } from './bindGuideTypes'

/** 小红书聚光 · 种小草 · 商业化 */
export const XHS_COMMERCIAL_BIND_GUIDE: BindGuideConfig = {
  introTitle: '绑定前请准备',
  introBullets: [
    '小红书聚光或种小草广告主账号（同一授权可服务投流与线索模块）。',
    '已在小红书商业开放平台/聚光平台完成企业认证。',
    '与「小红书商家版」店铺经营授权相互独立。',
  ],
  phases: [
    { id: 'market', label: '一、小红书商业平台' },
    { id: 'advertiser', label: '二、广告主与授权' },
    { id: 'erp', label: '三、灵祺 ERP 绑定' },
  ],
  steps: [
    {
      id: 'portal',
      phase: 'market',
      title: '登录聚光/商业平台',
      bullets: [
        '打开小红书聚光或商业开放平台（https://ad.xiaohongshu.com 或贵司使用的入口）。',
        '使用广告主主体登录；代理商代投时需向代理商索取授权信息。',
        '若需服务商对接，请确认已具备开放平台应用创建权限（部分能力需服务商资质）。',
      ],
    },
    {
      id: 'app',
      phase: 'market',
      title: '创建应用并完成授权',
      bullets: [
        '在开放平台创建应用，申请聚光投放、线索回传等相关能力（以平台当前类目为准）。',
        '完成 OAuth 或授权码流程，获取可在 ERP 填写的「授权密钥」。',
        '种小草与聚光可共用同一套商业化授权，无需重复绑定两次。',
      ],
    },
    {
      id: 'adv-id',
      phase: 'advertiser',
      title: '获取广告主编号',
      bullets: [
        '在聚光/种小草后台「账户信息」中查看广告主 ID（数字编号）。',
        '填入 ERP「广告主编号」；须与授权密钥对应同一广告主主体。',
        '建议填写「账户备注名」便于多品牌/多门店切换「当前使用」账号。',
      ],
    },
  ],
  erpPhaseLabel: '三、灵祺 ERP 绑定',
  erpStep: {
    title: '在灵祺 ERP 完成绑定',
    bullets: [
      '路径：系统设置 → 商业化后台 → 小红书聚光 · 种小草。',
      '点击「绑定说明书」查看本流程；填写授权密钥与广告主编号后保存。',
      '绑定成功后，「投流」页签选择聚光、「线索」页签选择种小草即可使用对应数据。',
      '未配置有效授权时，系统可展示演示数据，便于先熟悉页面功能。',
    ],
  },
}
