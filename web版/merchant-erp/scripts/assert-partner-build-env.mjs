#!/usr/bin/env node
/**
 * 服务商版构建前校验：避免打出「登录服务未配置」的空包。
 * ECS 用项目根目录 .env.partner；本地可用 .env.partner.local。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(rel) {
  const p = path.join(ROOT, rel)
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (key && !String(process.env[key] ?? '').trim()) process.env[key] = val
  }
}

loadEnvFile('.env.partner')
loadEnvFile('.env.partner.local')

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
    '[build:partner] 缺少环境变量（ECS 写 .env.partner，本地可用 .env.partner.local）：',
  )
  for (const k of missing) console.error(`  - ${k}`)
  console.error(
    '参考：docs/MIGRATE-VERCEL-TO-ECS-partner-fws.md · 配置后重新 build。',
  )
  process.exit(1)
}

console.log('[build:partner] env ok:', required.join(', '))
