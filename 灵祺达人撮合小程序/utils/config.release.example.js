/**
 * 生产环境（复制为 config.release.js）。
 * 体验版/正式版 API 走 cs.mofangdianai.com（Vercel 网关 → ECS erp-api），勿配 SUPABASE_URL。
 */
module.exports = {
  MERCHANT_API_BASE_URL: 'https://cs.mofangdianai.com',
  MP_GATEWAY_BASE_URL: 'https://cs.mofangdianai.com',
  MP_REGISTRY_GATEWAY_BASE_URL: 'https://cs.mofangdianai.com',
  MP_SHARE_APPLY_BASE_URL: '',
}
