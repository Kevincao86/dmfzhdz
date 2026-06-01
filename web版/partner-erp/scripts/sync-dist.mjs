#!/usr/bin/env node
/** Vercel 产出须在 partner-erp 根内：将 merchant-erp/dist-partner 同步到本目录 dist */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const src = path.resolve(root, '../merchant-erp/dist-partner')
const dest = path.join(root, 'dist')

if (!fs.existsSync(src)) {
  console.error('[partner-erp] missing build output:', src)
  process.exit(1)
}

fs.rmSync(dest, { recursive: true, force: true })
fs.cpSync(src, dest, { recursive: true })
console.log('[partner-erp] synced', src, '->', dest)
