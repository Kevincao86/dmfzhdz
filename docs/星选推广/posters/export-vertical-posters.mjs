#!/usr/bin/env node
/**
 * 导出 9:16 竖版海报 PNG：node docs/星选推广/posters/export-vertical-posters.mjs
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..')
const W = 1080
const H = 1920

const posters = [
  { sel: '#poster-01-ecosystem', out: 'xingxuan-poster-v3-01-ecosystem-9x16.png' },
  { sel: '#poster-02-painpoint', out: 'xingxuan-poster-v3-02-painpoint-9x16.png' },
  { sel: '#poster-03-dashboard', out: 'xingxuan-poster-v3-03-dashboard-9x16.png' },
  { sel: '#poster-04-workflow', out: 'xingxuan-poster-v3-04-workflow-9x16.png' },
  { sel: '#poster-05-cta', out: 'xingxuan-poster-v3-05-cta-9x16.png' },
]

const htmlPath = path.join(__dirname, 'index.html')
if (!fs.existsSync(htmlPath)) {
  console.error('missing index.html')
  process.exit(1)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)

for (const p of posters) {
  const el = await page.$(p.sel)
  if (!el) {
    console.error('missing', p.sel)
    continue
  }
  const outPath = path.join(OUT_DIR, p.out)
  await el.screenshot({ path: outPath, type: 'png' })
  console.log('OK', outPath, p.sel)
}

await browser.close()
