/**
 * 体验版 / 正式版：直连 ECS erp-api。
 * 微信 Cronet 对根域 mofangdianai.com 易 ERR_CONNECTION_RESET，优先 api 子域（仅反代 API，无静态站）。
 * 域名控制台须添加 A 记录：api.mofangdianai.com → 与根域相同公网 IP。
 * 微信公众平台 request / downloadFile 合法域名均添加：
 *   https://api.mofangdianai.com
 *   https://mofangdianai.com
 */
module.exports = {
  MERCHANT_API_BASE_URL: 'https://api.mofangdianai.com/erp-api',
  MP_ERP_API_FALLBACK_BASES: ['https://mofangdianai.com/erp-api'],
  MP_GATEWAY_BASE_URL: '',
  MP_REGISTRY_GATEWAY_BASE_URL: '',
  MP_SHARE_APPLY_BASE_URL: '',
}
