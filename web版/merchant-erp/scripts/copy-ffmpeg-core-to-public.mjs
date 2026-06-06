/**
 * 将 @ffmpeg/core 复制到 public/ffmpeg/，供浏览器同源加载（避免境外 CDN 不稳定）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const erpRoot = path.resolve(__dirname, '..')
const coreDir = path.join(erpRoot, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm')
const destDir = path.join(erpRoot, 'public', 'ffmpeg')

const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm']

if (!fs.existsSync(coreDir)) {
  console.warn('[copy-ffmpeg-core] 未找到 node_modules/@ffmpeg/core，跳过（拼接将回退 CDN）')
  process.exit(0)
}

fs.mkdirSync(destDir, { recursive: true })
for (const name of files) {
  const src = path.join(coreDir, name)
  if (!fs.existsSync(src)) {
    console.warn(`[copy-ffmpeg-core] 缺少 ${name}，跳过`)
    continue
  }
  fs.copyFileSync(src, path.join(destDir, name))
}
console.log('[copy-ffmpeg-core] 已复制到 public/ffmpeg/')
