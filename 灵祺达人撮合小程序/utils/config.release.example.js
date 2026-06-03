/**
 * 生产环境（复制为 config.release.js）。仅根域，勿配 api 子域。
 */
module.exports = {
  MERCHANT_API_BASE_URL: 'https://mofangdianai.com/erp-api',
  MP_ERP_API_FALLBACK_BASES: [],
  MP_GATEWAY_BASE_URL: '',
  MP_REGISTRY_GATEWAY_BASE_URL: '',
  MP_SHARE_APPLY_BASE_URL: '',
}
