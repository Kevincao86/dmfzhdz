/** 抖音来客绑定说明书步骤（配图位于 /public/douyin-bind-guide/） */

import { merchantStaticUrl } from '../../lib/webStaticOssAssets'

function guideImg(path: string): string {
  return merchantStaticUrl(path)
}

export type DouyinBindGuideStep = {
  id: string
  phase: string
  title: string
  bullets: string[]
  imageSrc: string
  imageAlt: string
  note?: string
}

export const DOUYIN_BIND_GUIDE_PHASES = [
  { id: 'laike', label: '一、抖音来客' },
  { id: 'open', label: '二、抖音开放平台' },
  { id: 'erp', label: '三、灵祺 ERP 绑定' },
] as const

export const DOUYIN_BIND_GUIDE_STEPS: DouyinBindGuideStep[] = [
  {
    id: 'account-id',
    phase: 'laike',
    title: '复制来客「账户 ID」',
    bullets: [
      '使用超级管理员账号登录抖音来客（https://life.douyin.com 或贵司使用的来客地址）。',
      '点击页面右上角头像/账户名称，展开下拉菜单。',
      '找到「账户 ID」，点击右侧「复制」按钮，妥善保存——该 ID 即本系统绑定弹窗中的「商户 ID」。',
    ],
    imageSrc: guideImg('/douyin-bind-guide/step-01-laike-account-id.png'),
    imageAlt: '抖音来客右上角账户菜单中复制账户 ID',
  },
  {
    id: 'service-auth',
    phase: 'laike',
    title: '进入「服务应用授权」',
    bullets: [
      '左侧菜单：店铺管理 → 业务中心 → 服务应用授权。',
      '切换到「商家自研服务」标签页。',
      '若尚未入驻开放平台，可点击「入驻开放平台」；已入驻则进入下一步在开放平台创建/管理应用。',
    ],
    imageSrc: guideImg('/douyin-bind-guide/step-02-laike-service-auth.png'),
    imageAlt: '抖音来客服务应用授权与商家自研服务',
    note: '绑定后来客将与自研应用打通，方可由灵祺 ERP 代调门店与商品等能力。',
  },
  {
    id: 'console',
    phase: 'open',
    title: '进入开放平台控制台',
    bullets: [
      '浏览器打开抖音开放平台：https://developer.open-douyin.com',
      '使用与来客主体一致的企业账号登录。',
      '点击首页「进入控制台」，或顶部导航「控制台」。',
    ],
    imageSrc: guideImg('/douyin-bind-guide/step-03-open-platform-console.png'),
    imageAlt: '抖音开放平台首页进入控制台',
  },
  {
    id: 'create-app',
    phase: 'open',
    title: '创建「生活服务商家应用」',
    bullets: [
      '在控制台「我的应用」区域，选择「生活服务商家应用」标签。',
      '点击「创建生活服务商家应用」，按提示填写应用名称（示例：ERP对接）。',
      '创建完成后在应用列表中进入该应用。',
    ],
    imageSrc: guideImg('/douyin-bind-guide/step-04-create-life-app.png'),
    imageAlt: '创建生活服务商家应用',
    note: '每个主体可创建数量有限（如 1/10），请为灵祺 ERP 单独保留一个正式应用。',
  },
  {
    id: 'credentials',
    phase: 'open',
    title: '获取 AppID 与 App Secret',
    bullets: [
      '进入应用左侧「基础信息」。',
      '复制「APPID」——对应本系统绑定弹窗中的 AppID。',
      '复制「AppSecret」：点击眼睛图标查看后复制——对应本系统 App Secret（勿泄露、勿提交到公开渠道）。',
      '确认应用状态为「正式应用」（审核通过后方可正常调用）。',
    ],
    imageSrc: guideImg('/douyin-bind-guide/step-05-app-credentials.png'),
    imageAlt: '应用基础信息中的 APPID 与 AppSecret',
  },
  {
    id: 'solutions',
    phase: 'open',
    title: '开通解决方案能力权限',
    bullets: [
      '进入应用左侧「解决方案」。',
      '在「全部」或对应行业标签下，找到业务需要的方案（如餐饮、综合、度假等）。',
      '对所需方案点击「开通能力权限」，按平台提示完成申请；涉及门店、商品等能力的方案均需开通。',
    ],
    imageSrc: guideImg('/douyin-bind-guide/step-06-open-solutions.png'),
    imageAlt: '解决方案中开通能力权限',
    note: '未开通的能力，ERP 调用对应 OpenAPI 时会被平台拒绝。',
  },
  {
    id: 'ip-whitelist',
    phase: 'open',
    title: '配置服务器 IP 白名单',
    bullets: [
      '进入应用左侧「开发配置」→「服务器 IP 白名单」。',
      '点击「添加白名单」，填入灵祺 ERP 服务端请求抖音时的出口公网 IP。',
      '保存后列表中应出现已添加的 IP；若使用云厂商固定 EIP + 反代，须与运维配置的 DOUYIN_OPENAPI_BASE_URL 出口一致。',
    ],
    imageSrc: guideImg('/douyin-bind-guide/step-07-ip-whitelist.png'),
    imageAlt: '服务器 IP 白名单配置',
    note: '示例图中 IP 仅供格式参考；实际 IP 请向灵祺实施或运维索取最新白名单地址。Vercel 等动态出口需通过固定 EIP 反代访问抖音。',
  },
]

export const DOUYIN_BIND_ERP_STEP = {
  title: '在灵祺 ERP 完成绑定',
  bullets: [
    '路径：系统设置 → 商家版后台 → 抖音来客商家版。',
    '点击「绑定抖音来客」，在弹窗中填写：AppID、App Secret、商户 ID（即步骤 1 复制的来客账户 ID）。',
    '点击「确认绑定」；成功后将自动拉取账户下门店列表。',
    '若门店列表为空或报错，请核对：账户 ID 是否正确、解决方案是否已开通、IP 白名单是否已添加、应用是否为正式版。',
  ],
}
