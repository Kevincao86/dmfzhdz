/**
 * 体验版 / 正式版：优先直连 ECS erp-api；失败时由 opsRegistry 回退 cs 网关。
 * 勿配置 SUPABASE_URL。微信 request 合法域名须含本 HOST（及可选 https://api.mofangdianai.com）。
 */
module.exports = {
  MERCHANT_API_BASE_URL: 'https://mofangdianai.com/erp-api',
  MP_GATEWAY_BASE_URL: 'https://cs.mofangdianai.com',
  MP_REGISTRY_GATEWAY_BASE_URL: 'https://cs.mofangdianai.com',
  MP_SHARE_APPLY_BASE_URL: '',
}
