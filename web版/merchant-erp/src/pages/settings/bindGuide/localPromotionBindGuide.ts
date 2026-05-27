import type { BindGuideConfig } from './bindGuideTypes'

/** 巨量本地推 · 商业化投流/线索 */
export const LOCAL_PROMOTION_BIND_GUIDE: BindGuideConfig = {
  introTitle: '绑定前请准备',
  introBullets: [
    '巨量引擎/巨量本地推广告主账号，或代理商为您开通的投放账户。',
    '已在巨量引擎商业开放平台完成应用创建与授权。',
    '与「抖音来客」经营账号相互独立，可使用不同主体登录。',
  ],
  phases: [
    { id: 'ocean', label: '一、巨量引擎商业开放平台' },
    { id: 'account', label: '二、本地推广告主' },
    { id: 'erp', label: '三、灵祺 ERP 绑定' },
  ],
  steps: [
    {
      id: 'portal',
      phase: 'ocean',
      title: '进入商业开放平台',
      bullets: [
        '打开巨量引擎商业开放平台（https://open.oceanengine.com）。',
        '使用企业账号登录，进入「开发者中心」→「应用管理」。',
        '若尚未注册开发者，请先完成企业认证与入驻。',
      ],
    },
    {
      id: 'app',
      phase: 'ocean',
      title: '创建应用并申请「本地推」权限',
      bullets: [
        '新建应用，业务场景选择「本地推」或包含本地推能力的营销场景。',
        '在应用权限中勾选本地推相关的投放、报表、线索等能力，提交审核。',
        '审核通过后，按平台指引完成 OAuth 授权，获取可在 ERP 中填写的「授权密钥」。',
      ],
      note: '授权密钥具有有效期，到期后需在平台重新授权并更新 ERP 中的绑定信息。',
    },
    {
      id: 'advertiser',
      phase: 'account',
      title: '获取本地推广告主编号',
      bullets: [
        '登录巨量本地推投放后台（或代理商提供的后台入口）。',
        '在账户设置/账户信息中查看「广告主 ID」或「本地推账户 ID」（一串数字）。',
        '该编号对应 ERP 绑定表单中的「广告主编号」，须与授权密钥所属主体一致。',
      ],
    },
    {
      id: 'optional-app',
      phase: 'account',
      title: '应用编号（选填）',
      bullets: [
        '若实施要求备案应用编号，可在开放平台应用详情中复制，填入 ERP「应用编号（选填）」。',
        '仅备注用途，不影响多数校验流程；以灵祺实施说明为准。',
      ],
    },
  ],
  erpPhaseLabel: '三、灵祺 ERP 绑定',
  erpStep: {
    title: '在灵祺 ERP 完成绑定',
    bullets: [
      '路径：系统设置 → 商业化后台 → 巨量本地推。',
      '点击「绑定说明书」查看本流程；点击「添加账号」或「去绑定」。',
      '填写：授权密钥（必填）、广告主编号（必填）、账户备注名（建议填写门店/品牌名）、应用编号（选填）。',
      '保存后系统将校验授权；成功即可在「投流」「线索」菜单查看本地推数据。',
    ],
  },
}
