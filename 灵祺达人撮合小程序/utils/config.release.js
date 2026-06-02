/**
 * 体验版 / 正式版（均指向 ECS，非 Supabase 云）：
 * - MERCHANT_API_BASE_URL：erp-api（注册表、报名、站内信写入等）
 * - SUPABASE_URL + ANON_KEY：公网 /rest/v1 数据网关；erp-api:3001 不可用时私信走此通道
 */
module.exports = {
  MERCHANT_API_BASE_URL: 'https://mofangdianai.com/erp-api',
  /** 招募大厅读：Vercel 服务端代拉 ECS（手机微信直连根域易 reset） */
  MP_REGISTRY_GATEWAY_BASE_URL: 'https://cs.mofangdianai.com',
  SUPABASE_URL: 'https://mofangdianai.com',
  SUPABASE_ANON_KEY:
    'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgwMzA5MTUyLCJleHAiOjIwOTU2NjkxNTJ9.sII43FrL3XWDZLfRBzhEhHwPvyEWvZTYf0p846di9vs',
  MP_SHARE_APPLY_BASE_URL: '',
}
