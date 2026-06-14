/** 仅开发者工具 / 本机调试生效（存在即表示直连 ECS，与模拟 platform 无关） */
module.exports = {
  /** 备案期域名 reset 时用轻量 IP + Host 头（见 ecs.js hostHeaderForBase） */
  MERCHANT_API_BASE_URL: 'http://139.196.42.5/erp-api',
  /** false = 不走云函数；模拟器 platform 为 ios 时仍生效 */
  MP_USE_CLOUD_PROXY: false,
}
