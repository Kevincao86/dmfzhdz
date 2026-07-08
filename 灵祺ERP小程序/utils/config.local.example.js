/**
 * 复制为 config.local.js（已在仓库 .gitignore，勿提交）后按需修改。
 * config.local.js 会合并覆盖 config.js 中的同名字段。
 *
 * 灵祺 AI 智能体要走真实对话：必须设置 MERCHANT_API_BASE_URL，
 * 与 web版/merchant-erp dev 同源（默认 http://127.0.0.1:5173）。真机请改为电脑的局域网 IPv4。
 * 本地跳过登录（DEV_SKIP_LOGIN: true）时：电脑需在 merchant-erp 使用 .env.local，
 * 见 web版/merchant-erp/.env.development.agent.example（MEOO_AI_CHAT_ALLOW_UNAUTHENTICATED=1 + 至少一项 AI Key）。
 */
module.exports = {
  /** 正式/真机：与微信「服务器域名」一致 */
  MERCHANT_API_BASE_URL: 'https://cs.mofangdianai.com',
  SUPABASE_URL: 'https://rborqkadhtwxqoaskddy.supabase.co',
  // SUPABASE_ANON_KEY: '从 Supabase Dashboard → API → anon public 复制',
  DEV_SKIP_LOGIN: false,
  // 本地 Docker 开发时用下面两行，并勾选「不校验合法域名」：
  // MERCHANT_API_BASE_URL: 'http://127.0.0.1:5173',
  // SUPABASE_URL: 'http://127.0.0.1:54321',
}
