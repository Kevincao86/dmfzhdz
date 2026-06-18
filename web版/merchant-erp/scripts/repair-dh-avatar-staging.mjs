#!/usr/bin/env node
/**
 * 从 .dh-avatar-staging-raw/ 读取万相原图，裁成竖版写入 .dh-avatar-staging/（不覆盖 raw）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computePortraitCenterCrop, PORTRAIT_H, PORTRAIT_W } from './dhAvatarPortrait.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RAW = path.join(ROOT, '.dh-avatar-staging-raw')
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

function pickRawDir() {
  if (!fs.existsSync(RAW)) return null
  const files = fs.readdirSync(RAW).filter((f) => /\.jpe?g$/i.test(f))
  return files.length ? RAW : null
}

async function main() {
  const srcDir = pickRawDir() ?? (fs.existsSync(STAGING) ? STAGING : null)
  if (!srcDir) {
    console.error('缺少 .dh-avatar-staging-raw/ 或 .dh-avatar-staging/')
    process.exit(1)
  }
  if (srcDir === STAGING) {
    console.warn('WARN: 未找到 raw 目录，正在就地处理 staging（会覆盖 staging 文件）')
  }
  const frameMap = readFrameMap()
  const sharpMod = await import('sharp')
  const sharp = sharpMod.default
  fs.mkdirSync(STAGING, { recursive: true })
  const files = fs.readdirSync(srcDir).filter((f) => /\.jpe?g$/i.test(f))
  for (const file of files) {
    const src = path.join(srcDir, file)
    const dest = path.join(STAGING, file)
    const bodyFrame = frameMap.get(file) ?? 'half'
    const meta = await sharp(src).metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    const crop = computePortraitCenterCrop(w, h, bodyFrame)
    const tmp = `${dest}.repair.tmp.jpg`
    await sharp(src)
      .extract(crop)
      .resize(PORTRAIT_W, PORTRAIT_H, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .jpeg({ quality: 95, mozjpeg: true })
      .toFile(tmp)
    fs.renameSync(tmp, dest)
    console.log(`${file} [${bodyFrame}] ${w}x${h} → staging ${PORTRAIT_W}x${PORTRAIT_H}`)
  }
  console.log('Done staging:', STAGING)
  if (srcDir !== STAGING) console.log('Raw preserved:', RAW)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
