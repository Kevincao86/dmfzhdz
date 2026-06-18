#!/usr/bin/env node
/**
 * 将预置数字人头像规范为竖版 1080×1920（9:16），写入 merchant-erp/public。
 * 半身：保留画面上段；全身：居中保留完整身形；输出含轻度锐化。
 *
 * 用法：
 *   node scripts/normalize-dh-preset-avatars.mjs [源目录]
 *   node scripts/normalize-dh-preset-avatars.mjs .dh-avatar-staging --map scripts/dh-avatar-frame-map.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizePortraitToFile } from './dhAvatarPortrait.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DEFAULT_SRC = path.resolve(
  ROOT,
  '../../灵祺达人履约管理后台/dist/digital-human/avatars',
)
const OUT_DIR = path.join(ROOT, 'public/digital-human/avatars')

function readFrameMap(argv) {
  const mapIdx = argv.indexOf('--map')
  if (mapIdx < 0) return null
  const mapPath = path.resolve(argv[mapIdx + 1] || '')
  if (!mapPath || !fs.existsSync(mapPath)) return null
  const raw = JSON.parse(fs.readFileSync(mapPath, 'utf8'))
  const out = new Map()
  for (const row of raw) {
    const file = String(row.file || '').trim()
    const bodyFrame = row.bodyFrame === 'full' ? 'full' : 'half'
    if (file) out.set(file, bodyFrame)
  }
  return out
}

async function main() {
  const argv = process.argv.slice(2)
  const frameMap = readFrameMap(argv)
  const srcDir = path.resolve(argv.find((a) => !a.startsWith('--')) || DEFAULT_SRC)
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
    const bodyFrame = frameMap?.get(file) ?? (file.includes('full') ? 'full' : 'half')
    const meta = await normalizePortraitToFile(sharp, src, dest, bodyFrame)
    console.log(`${file} [${bodyFrame}] → ${meta.w}x${meta.h} (${meta.kb}KB)`)
  }
  console.log('Done:', OUT_DIR)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
