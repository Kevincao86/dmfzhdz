#!/usr/bin/env node
/**
 * 口播稿总目录 PPT → 每页 JPG 落入 html-讲义/口播稿总目录/slides/
 *
 * 用法（在仓库根或本目录）：
 *   node docs/星选推广/商家ERP月订阅课程包-课件材料/html-讲义/scripts/export-catalog-ppt-slides.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HTML_ROOT = path.join(__dirname, '..')
const PPT = path.join(HTML_ROOT, '口播稿总目录-PPT.html')
const OUT_DIR = path.join(HTML_ROOT, '口播稿总目录', 'slides')

const SLIDE_FILES = [
  '01-封面.jpg',
  '02-今天开场.jpg',
  '03-怎么用.jpg',
  '04-九子项目.jpg',
  '05-模块0-1.jpg',
  '06-模块2.jpg',
  '07-模块3.jpg',
  '08-模块4-5.jpg',
  '09-模块6-7.jpg',
  '10-四周直播.jpg',
  '11-学练用.jpg',
  '12-课表速览.jpg',
  '13-今天带走.jpg',
  '14-结束.jpg',
]

async function main() {
  if (!fs.existsSync(PPT)) {
    console.error('找不到 PPT:', PPT)
    process.exit(1)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  })
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  })

  await page.goto(pathToFileURL(PPT).href, { waitUntil: 'networkidle' })
  // 隐藏底栏，截图更干净
  await page.addStyleTag({
    content: '.bar{display:none!important}',
  })

  const count = await page.locator('.slide').count()
  const n = Math.min(count, SLIDE_FILES.length)
  console.log(`共 ${count} 页，导出 ${n} 张 → ${OUT_DIR}`)

  for (let i = 0; i < n; i++) {
    await page.evaluate((idx) => {
      const slides = [...document.querySelectorAll('.slide')]
      slides.forEach((s, k) => s.classList.toggle('active', k === idx))
      const el = document.getElementById('idx')
      if (el) el.textContent = String(idx + 1)
    }, i)
    await page.waitForTimeout(120)
    const file = SLIDE_FILES[i]
    const out = path.join(OUT_DIR, file)
    await page.screenshot({
      path: out,
      type: 'jpeg',
      quality: 92,
      fullPage: false,
    })
    console.log(`  ✓ ${file}`)
  }

  await browser.close()

  // 写一份清单
  const listPath = path.join(HTML_ROOT, '口播稿总目录', 'slides清单.md')
  const lines = [
    '# 口播稿总目录 · 幻灯图片',
    '',
    `共 ${n} 页，目录：\`html-讲义/口播稿总目录/slides/\``,
    '',
    '| 页 | 文件 |',
    '|----|------|',
    ...SLIDE_FILES.slice(0, n).map((f, i) => `| ${i + 1} | [slides/${f}](./slides/${f}) |`),
    '',
    '源 PPT：[`../口播稿总目录-PPT.html`](../口播稿总目录-PPT.html)',
    '',
  ]
  fs.writeFileSync(listPath, lines.join('\n'), 'utf8')
  console.log(`\n完成。清单：${listPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
