/**
 * 复制为 config.local.js（勿提交）后按需修改。
 * config.local.js 会覆盖 config.js 中的同名字段。
 *
 * 也可只维护一个 LAN_IP 常量，再拼 SUPABASE_URL / MERCHANT_API_BASE_URL（见仓库内已生成的 config.local.js 模板）。
 */
module.exports = {
  // 真机连本机 Docker Supabase 时使用局域网 IP：
  // SUPABASE_URL: 'http://192.168.1.8:54321',
  // 使用云端 Supabase（须 https）：
  // SUPABASE_URL: 'https://xxxx.supabase.co',
  // SUPABASE_ANON_KEY: 'eyJ...',
  /** 与 Web ERP（merchant-erp）dev 同源，招募单写入 /api/ops-sync；例 http://192.168.1.8:5173 */
  // MERCHANT_API_BASE_URL: 'http://192.168.1.8:5173',
}
