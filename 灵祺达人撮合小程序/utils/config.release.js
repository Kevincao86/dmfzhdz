/**
 * 备案期：仅走微信云开发，手机不访问已暂停的域名
 * 备案通过后见 config.release.after-beian.example.js
 */
module.exports = {
  MP_USE_CLOUD_PROXY: true,
  /** 必填：微信开发者工具 → 云开发 → 环境 ID */
  MP_CLOUD_ENV: 'cloud1-d4g6yyypee3d656cb',
  /** 备案恢复直连后的 API 根地址（当前可不解析） */
  MERCHANT_API_BASE_URL: 'https://mofangdianai.com/erp-api',
  /** 云函数用 IP 访问轻量（与云开发环境变量一致，仅文档用） */
  MP_ERP_IP: '139.196.42.5',
  MP_ERP_HOST: 'mofangdianai.com',
  MP_BUILD_ID: 'mp-20260607-login-identity-icons',
  /** 正式体验版仅展示数据库商单；开发者工具可在 config.local.js 设为 true 看演示 */
  MP_SHOW_DEMO_ORDERS: false,
}
