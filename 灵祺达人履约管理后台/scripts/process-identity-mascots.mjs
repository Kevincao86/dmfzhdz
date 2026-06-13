/**
 * 将 AI 卡通素材转为真正透明底 PNG：
 * - 从四边泛洪去除黑底 / 棋盘格 / 浅色光晕底
 * - 填补角色内部被误抠的镂空（如白裙子），避免白底一键抠图误伤
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const MP_IMG = path.resolve(ROOT, '../灵祺达人撮合小程序/images')
const OUT = path.join(ROOT, 'public/identity-mascots')

function sat(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max - min
}

/** 可从边缘泛洪的背景色（不含角色内白色衣物） */
function isBgPixel(r, g, b, a = 255) {
  if (a < 8) return true
  const s = sat(r, g, b)
  const max = Math.max(r, g, b)
  // 纯黑 / 近黑
  if (max <= 32) return true
  // 棋盘格：白格或浅灰格
  if (max >= 168 && s <= 28) return true
  // 粉紫浅色光晕底（抠图残留）
  if (max >= 140 && s <= 70 && r >= g - 5 && g >= b - 12) return true
  return false
}

function isStrictChecker(r, g, b) {
  return (
    r >= 188 &&
    r <= 222 &&
    g >= 188 &&
    g <= 222 &&
    b >= 188 &&
    b <= 222 &&
    Math.abs(r - g) <= 6 &&
    Math.abs(g - b) <= 6
  )
}

function buildCharacterMask(png, external) {
  const { width: w, height: h, data } = png
  const mask = new Uint8Array(w * h)
  const q = []

  for (let idx = 0; idx < w * h; idx++) {
    if (external[idx]) continue
    const i = idx * 4
    if (data[i + 3] < 20) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (isStrictChecker(r, g, b)) continue
    if (isBgPixel(r, g, b, data[i + 3]) && sat(r, g, b) < 20) continue
    mask[idx] = 1
    q.push(idx)
  }

  // 膨胀保护衣物与发丝
  for (let pass = 0; pass < 5; pass++) {
    const next = new Uint8Array(mask)
    for (let idx = 0; idx < w * h; idx++) {
      if (!mask[idx]) continue
      const x = idx % w
      const y = (idx - x) / w
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        next[w * ny + nx] = 1
      }
    }
    for (let i = 0; i < mask.length; i++) mask[i] = next[i]
  }

  return mask
}

function stripCheckerboard(png, external) {
  const { width: w, height: h, data } = png
  const mask = buildCharacterMask(png, external)
  for (let idx = 0; idx < w * h; idx++) {
    const i = idx * 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const checker = isStrictChecker(r, g, b)
    const paperWhite = r > 238 && g > 238 && b > 238
    if (!checker && !paperWhite) continue
    if (mask[idx]) continue
    data[i + 3] = 0
  }
}

function isSkinTone(r, g, b) {
  return r > 125 && g > 78 && b < 190 && r >= g - 20 && g >= b - 25
}

/** PR 版：原素材误把白色短裙抠成黑块，在角色下半区还原为白 */
function repairPrGarment(png, external) {
  const { width: w, height: h, data } = png
  let minX = w
  let maxX = 0
  let minY = h
  let maxY = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = w * y + x
      if (external[idx]) continue
      const i = idx * 4
      if (data[i + 3] < 20) continue
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  const span = Math.max(1, maxY - minY)
  const beltBottom = minY + Math.floor(span * 0.46)
  const skirtTop = minY + Math.floor(span * 0.4)
  const skirtBottom = minY + Math.floor(span * 0.8)

  const paintWhite = (idx) => {
    const i = idx * 4
    data[i] = 252
    data[i + 1] = 250
    data[i + 2] = 255
    data[i + 3] = 255
  }

  for (let y = skirtTop; y <= skirtBottom; y++) {
    let rowLeft = w
    let rowRight = -1
    for (let x = minX; x <= maxX; x++) {
      const idx = w * y + x
      if (external[idx]) continue
      const i = idx * 4
      if (data[i + 3] < 20) continue
      rowLeft = Math.min(rowLeft, x)
      rowRight = Math.max(rowRight, x)
    }
    if (rowRight < rowLeft) continue
    for (let x = rowLeft; x <= rowRight; x++) {
      const idx = w * y + x
      if (external[idx]) continue
      const i = idx * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]
      if (isSkinTone(r, g, b)) continue
      // 腰带保留一圈紫色
      if (y <= beltBottom && sat(r, g, b) > 45 && b > 60) continue
      if (a < 20 || y <= skirtBottom) paintWhite(idx)
    }
  }
}

function floodExternalBackground(png) {
  const { width: w, height: h, data } = png
  const external = new Uint8Array(w * h)
  const q = []

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const idx = w * y + x
    if (external[idx]) return
    const i = idx * 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (!isBgPixel(r, g, b, a)) return
    external[idx] = 1
    q.push(idx)
  }

  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }

  while (q.length) {
    const idx = q.pop()
    const x = idx % w
    const y = (idx - x) / w
    push(x - 1, y)
    push(x + 1, y)
    push(x, y - 1)
    push(x, y + 1)
  }

  return external
}

function fillInteriorHoles(png, external) {
  const { width: w, height: h, data } = png
  const filled = new Uint8Array(w * h)
  const q = []

  for (let idx = 0; idx < w * h; idx++) {
    if (external[idx]) continue
    const i = idx * 4
    if (data[i + 3] > 8) continue
    filled[idx] = 1
    q.push(idx)
  }

  while (q.length) {
    const idx = q.pop()
    const x = idx % w
    const y = (idx - x) / w
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const nidx = w * ny + nx
      if (external[nidx] || filled[nidx]) continue
      const ni = nidx * 4
      if (data[ni + 3] > 8) continue
      filled[nidx] = 1
      q.push(nidx)
    }
  }

  for (let idx = 0; idx < w * h; idx++) {
    if (!filled[idx]) continue
    const i = idx * 4
    data[i] = 252
    data[i + 1] = 250
    data[i + 2] = 255
    data[i + 3] = 255
  }
}

function applyMask(png, external) {
  const { width: w, height: h, data } = png
  for (let idx = 0; idx < w * h; idx++) {
    if (!external[idx]) continue
    const i = idx * 4
    data[i + 3] = 0
  }
}

function trimAndResize(png, maxH = 520) {
  const { width: w, height: h, data } = png
  let minX = w
  let minY = h
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(w * y + x) * 4 + 3]
      if (a > 12) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return png

  const pad = 8
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(w - 1, maxX + pad)
  maxY = Math.min(h - 1, maxY + pad)
  const cw = maxX - minX + 1
  const ch = maxY - minY + 1

  const cropped = new PNG({ width: cw, height: ch })
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((y + minY) * w + (x + minX)) * 4
      const di = (y * cw + x) * 4
      cropped.data[di] = data[si]
      cropped.data[di + 1] = data[si + 1]
      cropped.data[di + 2] = data[si + 2]
      cropped.data[di + 3] = data[si + 3]
    }
  }

  if (ch <= maxH) return cropped
  const scale = maxH / ch
  const nw = Math.max(1, Math.round(cw * scale))
  const nh = maxH
  const resized = new PNG({ width: nw, height: nh })
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(cw - 1, Math.round(x / scale))
      const sy = Math.min(ch - 1, Math.round(y / scale))
      const si = (sy * cw + sx) * 4
      const di = (y * nw + x) * 4
      resized.data[di] = cropped.data[si]
      resized.data[di + 1] = cropped.data[si + 1]
      resized.data[di + 2] = cropped.data[si + 2]
      resized.data[di + 3] = cropped.data[si + 3]
    }
  }
  return resized
}

function cleanupDarkSpecks(png) {
  const { width: w, height: h, data } = png
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = w * y + x
      const i = idx * 4
      if (data[i + 3] < 20) continue
      const max = Math.max(data[i], data[i + 1], data[i + 2])
      if (max > 48) continue
      let samples = 0
      let sr = 0
      let sg = 0
      let sb = 0
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        const ni = (w * ny + nx) * 4
        if (data[ni + 3] < 80) continue
        const nmax = Math.max(data[ni], data[ni + 1], data[ni + 2])
        if (nmax < 110) continue
        samples++
        sr += data[ni]
        sg += data[ni + 1]
        sb += data[ni + 2]
      }
      if (samples < 2) continue
      data[i] = Math.round(sr / samples)
      data[i + 1] = Math.round(sg / samples)
      data[i + 2] = Math.round(sb / samples)
      data[i + 3] = 255
    }
  }
}

function processFile(src, dest, { fillHoles = true, repairPr = false, cleanupSpecks = false } = {}) {
  const buf = fs.readFileSync(src)
  const png = PNG.sync.read(buf)
  const external = floodExternalBackground(png)
  if (fillHoles) fillInteriorHoles(png, external)
  if (repairPr) repairPrGarment(png, external)
  stripCheckerboard(png, external)
  applyMask(png, external)
  if (cleanupSpecks) cleanupDarkSpecks(png)
  const out = trimAndResize(png)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, PNG.sync.write(out))
  console.log('OK', path.basename(dest), `${out.width}x${out.height}`)
}

const MAP = [
  ['home/hero-talent-v2-search.png', 'talent.png', { fillHoles: false }],
  ['home/hero-talent-v2-cloud-tablet.png', 'shoot.png', { fillHoles: false, cleanupSpecks: true }],
  ['home/hero-talent-v2-heart.png', 'edit.png', { fillHoles: false }],
  // rec-hall 源图白裙已被误抠且无法自动修复，改用完整形象的 wave-clouds
  ['home/hero-talent-v2-wave-clouds.png', 'pr.png', { fillHoles: false }],
]

for (const [rel, name, opts] of MAP) {
  processFile(path.join(MP_IMG, rel), path.join(OUT, name), opts)
}
