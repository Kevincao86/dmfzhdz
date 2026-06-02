/**
 * 体验版 / 正式版：API 统一走 cs.mofangdianai.com（Vercel 网关 → ECS erp-api）。
 * 勿配置 SUPABASE_URL：数据已全部在 ECS，不经小程序直连 PostgREST。
 */
module.exports = {
  MERCHANT_API_BASE_URL: 'https://cs.mofangdianai.com',
  MP_GATEWAY_BASE_URL: 'https://cs.mofangdianai.com',
  MP_REGISTRY_GATEWAY_BASE_URL: 'https://cs.mofangdianai.com',
  MP_SHARE_APPLY_BASE_URL: '',
}
