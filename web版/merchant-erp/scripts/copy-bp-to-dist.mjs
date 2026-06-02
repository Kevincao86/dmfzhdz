/**
 * 将仓库根目录 商业BP/ 复制到 dist/bp/，供 Vercel 静态托管 /bp/
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const erpRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(erpRoot, '../..')
const src = path.join(repoRoot, '商业BP')
const dest = path.join(erpRoot, 'dist', 'bp')

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const name of fs.readdirSync(from)) {
    const s = path.join(from, name)
    const d = path.join(to, name)
    if (fs.statSync(s).isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

if (!fs.existsSync(src)) {
  console.warn('[copy-bp] 商业BP 目录不存在，跳过')
  process.exit(0)
}
if (!fs.existsSync(path.join(erpRoot, 'dist'))) {
  console.warn('[copy-bp] dist 不存在，请先 vite build')
  process.exit(1)
}
fs.rmSync(dest, { recursive: true, force: true })
copyDir(src, dest)
console.log('[copy-bp] 已复制到 dist/bp')
