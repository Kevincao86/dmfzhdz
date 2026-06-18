#!/usr/bin/env node
/**
 * 将 .dh-avatar-staging 横图规范为竖版 9:16（按 dh-avatar-frame-map 半身/全身裁切）。
 * 在 normalize 或 AI 超分之前执行。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computePortraitCenterCrop, PORTRAIT_H, PORTRAIT_W } from './dhAvatarPortrait.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const STAGING = path.join(ROOT, '.dh-avatar-staging')
const MAP_PATH = path.join(__dirname, 'dh-avatar-frame-map.json')

function readFrameMap() {
  const raw = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'))
  const out = new Map()
  for (const row of raw) {
    const file = String(row.file || '').trim()
    const bodyFrame = row.bodyFrame === 'full' ? 'full' : 'half'
    if (file) out.set(file, bodyFrame)
  }
  return out
}

async function main() {
  const frameMap = readFrameMap()
  const sharpMod = await import('sharp')
  const sharp = sharpMod.default
  fs.mkdirSync(STAGING, { recursive: true })
  const files = fs.readdirSync(STAGING).filter((f) => /\.jpe?g$/i.test(f))
  if (!files.length) {
    console.error('staging 无 JPG:', STAGING)
    process.exit(1)
  }
  for (const file of files) {
    const src = path.join(STAGING, file)
    const bodyFrame = frameMap.get(file) ?? 'half'
    const meta = await sharp(src).metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    const crop = computePortraitCenterCrop(w, h, bodyFrame)
    const tmp = `${src}.repair.tmp.jpg`
    await sharp(src)
      .extract(crop)
      .resize(PORTRAIT_W, PORTRAIT_H, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .jpeg({ quality: 95, mozjpeg: true })
      .toFile(tmp)
    fs.renameSync(tmp, src)
    console.log(`${file} [${bodyFrame}] ${w}x${h} → ${PORTRAIT_W}x${PORTRAIT_H}`)
  }
  console.log('Done:', STAGING)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
