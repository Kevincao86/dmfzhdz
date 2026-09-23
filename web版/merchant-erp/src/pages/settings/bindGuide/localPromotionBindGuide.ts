import type { BindGuideConfig } from './bindGuideTypes'

/** 巨量本地推 · 商业化投流/线索 */
export const LOCAL_PROMOTION_BIND_GUIDE: BindGuideConfig = {
  introTitle: '绑定前请准备',
  introBullets: [
    '巨量引擎商业开放平台已创建应用（巨量营销 / 本地推场景），状态为已上线。',
    '应用详情中的 App ID、Secret，以及回调地址须与 ERP 一致。',
    '本地推广告主账号（或代理商开通的投放账户）；与「抖音来客」经营账号相互独立。',
  ],
  phases: [
    { id: 'ocean', label: '一、巨量引擎商业开放平台' },
    { id: 'oauth', label: '二、OAuth 授权换票' },
    { id: 'erp', label: '三、灵祺 ERP 绑定' },
  ],
  steps: [
    {
      id: 'portal',
      phase: 'ocean',
      title: '进入商业开放平台',
      bullets: [
        '打开巨量引擎商业开放平台（https://open.oceanengine.com）。',
        '使用企业账号登录，进入「应用管理」→「巨量营销」。',
        '在应用详情复制 APP_ID 与 Secret；回调地址配置为 https://cs.mofangdianai.com/settings。',
      ],
    },
    {
      id: 'app',
      phase: 'ocean',
      title: '确认应用权限与回调',
      bullets: [
        '应用类型建议为「自研投放系统」或包含本地推能力的营销场景。',
        '勾选本地推管理（投放/报表/线索），以及「工作台账户管理 / 巨量引擎工作台组织管理」。只勾本地推、不勾工作台管理时，授权页只能拿到工作台 ID，投流接口读不到数据。',
        '回调地址必须与 ERP 绑定页显示的地址完全一致（含 https、路径 /settings）。',
      ],
      note: 'App Secret 仅用于服务端换票，不能填入「Access Token」栏位；误填会导致 access_token 无效。',
    },
    {
      id: 'oauth-flow',
      phase: 'oauth',
      title: 'OAuth 授权获取 Access Token',
      bullets: [
        '在 ERP 填写 App ID 与 App Secret，点击「前往巨量授权」。',
        '使用有投放权限的账号登录，勾选要接入的广告主账户并确认授权。',
        '授权成功后浏览器跳回系统设置页，系统自动用 auth_code 换取 access_token。官方规定该票约 24 小时过期，这是巨量规则，无法改成永久。',
        '同时会保存 refresh_token（约 30 天）。打开投流/线索时 ERP 会在到期前自动换新票并写回；只要大约 30 天内有使用，授权会持续续期。',
        '仅粘贴 Access Token、没有 refresh_token 的绑定无法自动续期，到期须重新点「前往巨量授权」。超过约 30 天完全未使用也需重新授权。',
      ],
    },
    {
      id: 'advertiser',
      phase: 'oauth',
      title: '选择广告主编号',
      bullets: [
        'OAuth 成功后会列出投放账户。若只看到「升级版工作台账户」，不要直接保存，应选其下的本地推投放账户。',
        '也可在本地推后台「账户信息」中查看数字广告主 ID 手动填写。',
        '广告主编号须与 OAuth 授权时勾选的账户一致。',
      ],
    },
  ],
  erpPhaseLabel: '三、灵祺 ERP 绑定',
  erpStep: {
    title: '在灵祺 ERP 完成绑定',
    bullets: [
      '路径：系统设置 → 商业化后台 → 巨量本地推。',
      '填写：应用编号 App ID、应用密钥 App Secret（必填）。',
      '点击「前往巨量授权」完成 OAuth；返回后选择广告主编号，点击「保存并校验」。',
      '之后打开投流页会自动刷新 token，不必每天重新授权（须走 OAuth，不能只贴 Access Token）。',
      '校验通过即可在「投流」「线索」菜单查看真实数据。若提示工作台账户，请改选其下的本地推投放账户后再保存。',
    ],
  },
}
