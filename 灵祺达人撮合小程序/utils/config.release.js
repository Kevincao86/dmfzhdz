/**
 * 体验版 / 正式版：仅直连 ECS erp-api（数据在 ECS，不经 Vercel 代拉）。
 * Gitee 只用于 ECS 上 git pull 部署代码，小程序 request 不经过 Gitee。
 * 勿配置 SUPABASE_URL。微信 request 合法域名：https://mofangdianai.com（可选 api 子域）。
 * 登录与业务均直连 ECS；微信合法域名：https://mofangdianai.com。
 */
module.exports = {
  MERCHANT_API_BASE_URL: 'https://mofangdianai.com/erp-api',
  MP_GATEWAY_BASE_URL: '',
  MP_REGISTRY_GATEWAY_BASE_URL: '',
  MP_SHARE_APPLY_BASE_URL: '',
}
