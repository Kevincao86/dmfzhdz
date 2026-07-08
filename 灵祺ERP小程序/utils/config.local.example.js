/**
 * 复制为 config.local.js（已在仓库 .gitignore，勿提交）后按需修改。
 * config.local.js 会合并覆盖 config.js 中的同名字段。
 *
 * 正式/真机（接轻量 ECS）：
 * - MERCHANT_API_BASE_URL 指向 cs（与微信「request 合法域名」一致）
 * - SUPABASE_URL 与 MERCHANT 同源（Nginx 反代 /auth/v1、/rest/v1）
 * - SUPABASE_ANON_KEY 可留空：启动时会从 /api/meoo-erp-client-config 自动拉取
 *
 * 本地 dev（npm run dev）：
 * - MERCHANT_API_BASE_URL: 'http://127.0.0.1:5173' 或局域网 IP:5173
 * - 勾选「不校验合法域名」
 */
module.exports = {
  /** 正式/真机：与微信「服务器域名」一致；账单 API 为 {MERCHANT_API_BASE_URL}/erp-api/meoo-tenant-billing */
  MERCHANT_API_BASE_URL: 'https://cs.mofangdianai.com',
  /** ECS：与 MERCHANT 同源；禁止 *.supabase.co */
  SUPABASE_URL: 'https://cs.mofangdianai.com',
  // SUPABASE_ANON_KEY: '可选；留空则启动时从 /api/meoo-erp-client-config 拉取',
  DEV_SKIP_LOGIN: false,
  // 本地 Docker 开发时用下面两行，并勾选「不校验合法域名」：
  // MERCHANT_API_BASE_URL: 'http://127.0.0.1:5173',
  // SUPABASE_URL: 'http://127.0.0.1:54321',
}
