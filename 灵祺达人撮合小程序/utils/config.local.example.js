/** 仅开发者工具 / 本机调试生效（存在即表示直连 ECS，与模拟 platform 无关） */
module.exports = {
  MERCHANT_API_BASE_URL: 'https://mofangdianai.com/erp-api',
  /** false = 不走云函数；模拟器 platform 为 ios 时仍生效 */
  MP_USE_CLOUD_PROXY: false,
}
