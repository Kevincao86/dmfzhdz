/**
 * 与 web版/merchant-erp/.env.local 中 VITE_SUPABASE_* 保持一致。
 *
 * 局域网 / 真机预览：手机无法访问你电脑上的 127.0.0.1，请任选其一：
 * 1）在下面填写 LAN_API_HOST（开发机局域网 IPv4，如 192.168.3.10）；
 * 2）或复制 config.local.example.js 为 config.local.js，只改 SUPABASE_URL（该文件已加入 .gitignore）。
 *
 * 微信开发者工具：详情 → 本地设置 → 勾选「不校验合法域名…」（本地 HTTP 必需）。
 * project.private.config.json 已关闭 urlCheck 便于开发；上架前请改回 HTTPS 域名并开启校验。
 */
/** @type {string} 例：'192.168.3.10'；模拟器本机调试可留空 */
const LAN_API_HOST = ''

const LOCAL_SUPABASE_PORT = 54321

/** 本地 supabase start 默认 anon（勿用于线上） */
const DEMO_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const host = LAN_API_HOST.trim()
const core = {
  /**
   * true：跳过登录页，使用示意账号进入首页（仅本地/UI 设计用，上架前务必 false）。
   */
  DEV_SKIP_LOGIN: true,
  /** 跳过登录时首页展示的门店/账户名 */
  DEV_SKIP_LOGIN_NAME: 'DMF001',
  SUPABASE_URL: host
    ? `http://${host}:${LOCAL_SUPABASE_PORT}`
    : `http://127.0.0.1:${LOCAL_SUPABASE_PORT}`,
  SUPABASE_ANON_KEY: DEMO_ANON_KEY,
  TENANT_EMAIL_DOMAIN: 'users.meoo.test',
  VOICE_DRAFT_URL: '',
  /** Web ERP 开发服务根地址（与 .env 中 VITE_MERCHANT_API_BASE_URL 一致），例：http://192.168.3.10:5173 */
  MERCHANT_API_BASE_URL: '',
}

let out = { ...core }
try {
  const loc = require('./config.local.js')
  if (loc && typeof loc === 'object') Object.assign(out, loc)
} catch (_) {
  /* 可选覆盖文件不存在 */
}

module.exports = out
