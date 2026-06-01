/**
 * 生产环境 API 根地址（复制为 config.release.js 后提交，或仅在本地 config.local.js 填写）。
 * 末尾不要加 /。
 *
 * 阿里云 ECS（推荐，与商家 Web 共用）：
 *   MERCHANT_API_BASE_URL: 'https://mofangdianai.com/erp-api'
 *   SUPABASE_URL: 'https://mofangdianai.com'   // 自建 Supabase 反代，与商家站一致
 *   SUPABASE_ANON_KEY: '<与商家 Vercel/ECS 相同的 anon key>'
 *
 * 仍用 Vercel 根部署时：
 *   MERCHANT_API_BASE_URL: 'https://dmfweb.vercel.app'
 */
module.exports = {
  MERCHANT_API_BASE_URL: 'https://mofangdianai.com/erp-api',
  SUPABASE_URL: 'https://mofangdianai.com',
  SUPABASE_ANON_KEY: '',
  /** 可选：微信 URL Link 或 H5 报名落地页，支持 {mpId} 占位符 */
  MP_SHARE_APPLY_BASE_URL: '',
}
