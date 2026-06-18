#!/usr/bin/env node
/**
 * 将 AI 生成的 12 张预置形象发布到线上静态目录 public/digital-human/avatars/。
 *
 * 源目录优先级：
 *   1. .dh-avatar-staging-raw/  （万相原图 ~1.5MB 横图，勿覆盖）
 *   2. .dh-avatar-staging/
 *
 * 用法（在 web版/merchant-erp 下）：
 *   node scripts/publish-dh-preset-avatars.mjs
 *
 * 若 staging 里仍是 1.7M 原图，请先备份再发布：
 *   mkdir -p .dh-avatar-staging-raw && cp .dh-avatar-staging/av-real-*.jpg .dh-avatar-staging-raw/
 *   node scripts/publish-dh-preset-avatars.mjs
 *
 * 发布后在 digitalHumanBroadcast.ts 递增 PRESET_AVATAR_ASSET_VERSION，再部署 cs。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizePortraitToFile } from './dhAvatarPortrait.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RAW = path.join(ROOT, '.dh-avatar-staging-raw')
const STAGING = path.join(ROOT, '.dh-avatar-staging')
const OUT_DIR = path.join(ROOT, 'public/digital-human/avatars')
const MAP_PATH = path.join(__dirname, 'dh-avatar-frame-map.json')

function pickSourceDir() {
  if (fs.existsSync(RAW)) {
    const n = fs.readdirSync(RAW).filter((f) => /^av-real-\d+\.jpe?g$/i.test(f)).length
    if (n >= 12) return { dir: RAW, label: 'raw' }
  }
  if (fs.existsSync(STAGING)) {
    const n = fs.readdirSync(STAGING).filter((f) => /^av-real-\d+\.jpe?g$/i.test(f)).length
    if (n >= 12) return { dir: STAGING, label: 'staging' }
  }
  return null
}

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
  const picked = pickSourceDir()
  if (!picked) {
    console.error('未找到 12 张 av-real-*.jpg')
    console.error('请先生成：node scripts/generate-dh-preset-avatars.mjs')
    console.error('或把原图放入 .dh-avatar-staging-raw/')
    process.exit(1)
  }
  const frameMap = readFrameMap()
  const sharpMod = await import('sharp')
  const sharp = sharpMod.default
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const files = fs
    .readdirSync(picked.dir)
    .filter((f) => /^av-real-\d+\.jpe?g$/i.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] || 0)
      const nb = Number(b.match(/\d+/)?.[0] || 0)
      return na - nb
    })

  console.log(`源: ${picked.dir} (${picked.label}, ${files.length} 张)`)
  console.log(`目标: ${OUT_DIR}\n`)

  for (const file of files) {
    const src = path.join(picked.dir, file)
    const dest = path.join(OUT_DIR, file)
    const bodyFrame = frameMap.get(file) ?? 'half'
    const meta = await normalizePortraitToFile(sharp, src, dest, bodyFrame)
    console.log(`${file} [${bodyFrame}] → ${meta.w}x${meta.h} (${meta.kb}KB)`)
  }

  console.log('\n发布完成。请递增 PRESET_AVATAR_ASSET_VERSION 并部署 cs。')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
