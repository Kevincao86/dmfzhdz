import type { BindGuideConfig } from './bindGuideTypes'

/** 小红书商家 · 开放平台 ARK */
export const XHS_MERCHANT_BIND_GUIDE: BindGuideConfig = {
  introTitle: '绑定前请准备',
  introBullets: [
    '小红书商家主账号或已获授权的运营账号。',
    '已在小红书开放平台完成企业/个体入驻。',
    '约 20～30 分钟完成应用创建与店铺授权。',
  ],
  phases: [
    { id: 'open', label: '一、小红书开放平台' },
    { id: 'shop', label: '二、店铺与能力' },
    { id: 'erp', label: '三、灵祺 ERP 绑定' },
  ],
  steps: [
    {
      id: 'console',
      phase: 'open',
      title: '登录开放平台',
      bullets: [
        '打开小红书开放平台（https://school.xiaohongshu.com 或贵司使用的开放平台入口）。',
        '使用商家主体登录，进入「应用管理」或「开发者中心」。',
        '确认账号已完成主体认证，否则无法创建正式应用。',
      ],
    },
    {
      id: 'app',
      phase: 'open',
      title: '创建应用并获取凭证',
      bullets: [
        '新建「商家自研」或平台要求的应用类型，填写应用名称（如：灵祺ERP对接）。',
        '在应用详情中复制「App ID」「App Secret」，对应 ERP 绑定弹窗中的应用编号与密钥。',
        '配置回调地址、IP 白名单等平台要求的安全项（按实施文档填写 ERP 服务端地址）。',
      ],
    },
    {
      id: 'ark',
      phase: 'shop',
      title: '开通商品/订单/门店相关能力',
      bullets: [
        '在应用权限中开通与经营相关的能力：商品管理、订单、门店、评价等（以平台当前类目为准）。',
        '将应用与目标小红书店铺完成授权绑定。',
        '在商家后台确认店铺 ID、经营类目与 ERP 内计划使用的模块一致。',
      ],
      note: '具体能力名称以小红书开放平台当前文档为准，开通后方可同步对应数据。',
    },
  ],
  erpPhaseLabel: '三、灵祺 ERP 绑定',
  erpStep: {
    title: '在灵祺 ERP 完成绑定',
    bullets: [
      '路径：系统设置 → 商家版后台 → 小红书商家版。',
      '点击「绑定说明书」查看本流程；点击「绑定小红书」填写应用编号、应用密钥。',
      '绑定成功后，可手动或定时同步门店、商品、评价与财务等模块。',
      '若提示未授权，请回到开放平台检查应用权限与店铺授权状态。',
    ],
  },
}
