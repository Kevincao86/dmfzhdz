/**
 * 体验版 / 正式版：仅直连 ECS 根域 erp-api（不使用 api 子域、不走 Vercel）。
 * 微信合法域名（request + downloadFile）：https://mofangdianai.com
 */
module.exports = {
  MERCHANT_API_BASE_URL: 'https://mofangdianai.com/erp-api',
  MP_BUILD_ID: 'mp-20260604-ecs-get-login',
  /** 同源 PostgREST（ECS Nginx /rest/v1），非 Supabase 云 */
  SUPABASE_URL: 'https://mofangdianai.com',
  SUPABASE_ANON_KEY: '',
  MP_ERP_API_FALLBACK_BASES: [],
  MP_GATEWAY_BASE_URL: '',
  MP_REGISTRY_GATEWAY_BASE_URL: '',
  MP_SHARE_APPLY_BASE_URL: '',
}
