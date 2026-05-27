export const ELEME_BIND_GUIDE_STEPS = [
  {
    title: '1. 注册淘宝闪购开放平台',
    body: '登录 open.shop.ele.me，创建「商家自研」类型应用，获取 AppKey 与 AppSecret。',
  },
  {
    title: '2. 配置回调与白名单',
    body: '按文档配置服务器 IP 白名单与授权回调地址（生产环境须 HTTPS）。',
  },
  {
    title: '3. 在本系统绑定',
    body: '将 AppKey、AppSecret 填入灵祺 ERP「商家版后台 → 外卖平台 → 淘宝闪购」并保存。',
  },
  {
    title: '4. 配置服务端环境变量（可选）',
    body: '部署侧设置 ELEME_OPENAPI_BASE_URL 与各业务 PATH，绑定后将直连真实 OpenAPI；未配置时使用演示数据联调 UI。',
  },
] as const

export const MEITUAN_WAIMAI_BIND_GUIDE_STEPS = [
  {
    title: '1. 美团技术服务合作中心',
    body: '在 developer.meituan.com 创建外卖类商家自研应用，完成协议签署与能力开通。',
  },
  {
    title: '2. 获取密钥',
    body: '记录 App Key、App Secret，以及外卖侧商户/开发者 ID（如有）。',
  },
  {
    title: '3. 绑定灵祺 ERP',
    body: '在「商家版后台 → 外卖平台 → 美团外卖」填写凭据并绑定。',
  },
  {
    title: '4. 环境变量',
    body: 'MEITUAN_WAIMAI_OPENAPI_BASE_URL、MEITUAN_WAIMAI_STORE_LIST_PATH、MEITUAN_WAIMAI_GOODS_SAVE_PATH 等。',
  },
] as const

export const JD_WAIMAI_BIND_GUIDE_STEPS = [
  {
    title: '1. 京东秒送开放平台',
    body: '登录 opendj.jd.com，按「商家自研接入指南」创建应用并获取密钥。',
  },
  {
    title: '2. 门店与商品权限',
    body: '确保应用已开通门店、商品、订单、评价、营销等相关 API 权限。',
  },
  {
    title: '3. 绑定灵祺 ERP',
    body: '在「商家版后台 → 外卖平台 → 京东外卖」完成绑定。',
  },
  {
    title: '4. 环境变量',
    body: 'JD_WAIMAI_OPENAPI_BASE_URL 与各业务 PATH，用于生产环境直连。',
  },
] as const
