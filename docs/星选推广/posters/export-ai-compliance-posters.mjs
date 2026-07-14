#!/usr/bin/env node
/** node docs/星选推广/posters/export-ai-compliance-posters.mjs */
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..')
const W = 1080
const H = 1920

const posters = [
  { sel: '#p01', out: 'xingxuan-ai-compliance-poster-04-overview-9x16.png' },
  { sel: '#p02', out: 'xingxuan-ai-compliance-poster-05-rules-9x16.png' },
  { sel: '#p03', out: 'xingxuan-ai-compliance-poster-06-workflow-9x16.png' },
  { sel: '#p04', out: 'xingxuan-ai-compliance-poster-07-compare-9x16.png' },
]

const htmlPath = path.join(__dirname, 'ai-compliance.html')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)

for (const p of posters) {
  const el = await page.$(p.sel)
  if (!el) { console.error('missing', p.sel); continue }
  const outPath = path.join(OUT_DIR, p.out)
  await el.screenshot({ path: outPath, type: 'png' })
  console.log('OK', outPath)
}
await browser.close()
