/**
 * 生产环境（复制为 config.release.js）。
 * 微信 Cronet 建议优先 api 子域；须 DNS A 记录 api.mofangdianai.com → ECS 公网 IP。
 */
module.exports = {
  MERCHANT_API_BASE_URL: 'https://api.mofangdianai.com/erp-api',
  MP_ERP_API_FALLBACK_BASES: ['https://mofangdianai.com/erp-api'],
  MP_GATEWAY_BASE_URL: '',
  MP_REGISTRY_GATEWAY_BASE_URL: '',
  MP_SHARE_APPLY_BASE_URL: '',
}
