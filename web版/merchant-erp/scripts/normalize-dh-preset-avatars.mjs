#!/usr/bin/env node
/**
 * 将预置数字人头像规范为竖版 720×1280（居中裁切），写入 merchant-erp/public。
 * 用法：node scripts/normalize-dh-preset-avatars.mjs [源目录]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DEFAULT_SRC = path.resolve(
  ROOT,
  '../../灵祺达人履约管理后台/dist/digital-human/avatars',
)
const OUT_DIR = path.join(ROOT, 'public/digital-human/avatars')

const PORTRAIT_W = 720
const PORTRAIT_H = 1280

async function main() {
  const srcDir = path.resolve(process.argv[2] || DEFAULT_SRC)
  if (!fs.existsSync(srcDir)) {
    console.error('源目录不存在:', srcDir)
    process.exit(1)
  }
  const sharpMod = await import('sharp')
  const sharp = sharpMod.default
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const files = fs.readdirSync(srcDir).filter((f) => /\.jpe?g$/i.test(f))
  if (!files.length) {
    console.error('未找到 JPG 头像:', srcDir)
    process.exit(1)
  }
  for (const file of files) {
    const src = path.join(srcDir, file)
    const dest = path.join(OUT_DIR, file.replace(/\.png$/i, '.jpg'))
    await sharp(src)
      .resize(PORTRAIT_W, PORTRAIT_H, { fit: 'cover', position: 'centre', kernel: sharp.kernel.lanczos3 })
      .jpeg({ quality: 92, mozjpeg: true })
      .toFile(dest)
    const meta = await sharp(dest).metadata()
    const stat = fs.statSync(dest)
    console.log(`${file} → ${meta.width}x${meta.height} (${Math.round(stat.size / 1024)}KB)`)
  }
  console.log('Done:', OUT_DIR)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
