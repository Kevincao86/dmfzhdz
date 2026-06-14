#!/usr/bin/env node
/**
 * 将 merchant-erp 内置帮助手册种子同步到运营管控台，供「载入默认手册」打包进前端。
 * 用法：node scripts/sync-help-manual-seed.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const src = path.join(root, 'web版/merchant-erp/src/lib/helpManualSeedContent.ts')
const dest = path.join(root, '商家管理后台/src/meooRegistryShared/helpManualSeedContent.ts')

if (!fs.existsSync(src)) {
  console.error('源文件不存在:', src)
  process.exit(1)
}

const body = fs.readFileSync(src, 'utf8')
const header = `/**
 * AUTO-GENERATED — 勿手改。源：web版/merchant-erp/src/lib/helpManualSeedContent.ts
 * 同步：node scripts/sync-help-manual-seed.mjs（商家管理后台 prebuild 自动执行）
 */
`
fs.writeFileSync(dest, header + body)
console.log('OK: synced help manual seed ->', path.relative(root, dest))
