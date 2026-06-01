#!/usr/bin/env node
/**
 * 服务商版 Vercel 构建前校验：避免打出「登录服务未配置」的空包。
 * 在 partner-erp / merchant-erp 的 build:partner 前执行。
 */
const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_APP_EDITION',
  'VITE_ERP_AUTH_API_BASE',
]

const missing = required.filter((k) => !String(process.env[k] ?? '').trim())
const edition = String(process.env.VITE_APP_EDITION ?? '').trim()
if (edition && edition !== 'partner') {
  console.error(`[build:partner] VITE_APP_EDITION 应为 partner，当前为「${edition}」`)
  process.exit(1)
}
if (missing.length) {
  console.error(
    '[build:partner] 缺少环境变量（请在 Vercel 服务商项目 Environment Variables 配置，与商家站 cs 相同）：',
  )
  for (const k of missing) console.error(`  - ${k}`)
  console.error(
    '参考：docs/deploy-vercel-partner.md · 配置后 Redeploy，勿仅改代码不补变量。',
  )
  process.exit(1)
}

console.log('[build:partner] env ok:', required.join(', '))
