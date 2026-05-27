#!/usr/bin/env node
/**
 * 软件著作权登记 — 源码摘录导出（前 30 页 + 后 30 页，每页 50 行）
 *
 * 用法：
 *   node scripts/copyright-export-source.mjs merchant-erp
 *   node scripts/copyright-export-source.mjs --list
 *
 * 输出目录：docs/软著登记/exports/<产品id>/
 * 将 .txt 用 Word 排版（页眉含软件全称+版本号，宋体/小四，50 行/页）后另存 PDF 上传。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const LINES_PER_PAGE = 50
const PAGES_EACH_SIDE = 30

/** @type {Array<{ id: string; fullName: string; shortName: string; version: string; dirs: string[]; extensions: string[] }>} */
const PRODUCTS = [
  {
    id: 'merchant-erp',
    fullName: '灵祺AI智能ERP商家管理系统',
    shortName: '灵祺商家ERP',
    version: 'V1.0',
    dirs: ['web版/merchant-erp/src', 'web版/merchant-erp/api'],
    extensions: ['.ts', '.tsx'],
  },
  {
    id: 'ops-admin',
    fullName: '灵祺AI智能ERP运营管理平台',
    shortName: '灵祺运营台',
    version: 'V1.0',
    dirs: ['商家管理后台/src', '商家管理后台/api'],
    extensions: ['.ts', '.tsx'],
  },
  {
    id: 'merchant-mp',
    fullName: '灵祺商家小程序软件',
    shortName: '灵祺商家小程序',
    version: 'V1.0',
    dirs: ['灵祺商家小程序'],
    extensions: ['.js', '.wxml', '.wxss', '.json'],
  },
  {
    id: 'talent-mp',
    fullName: '灵祺达人招募小程序软件',
    shortName: '灵祺达人小程序',
    version: 'V1.0',
    dirs: ['灵祺达人招募小程序'],
    extensions: ['.js', '.wxml', '.wxss', '.json'],
  },
]

const SKIP_DIR = new Set([
  'node_modules',
  'dist',
  '.git',
  'public',
  'assets',
])

function listSourceFiles(dirAbs, extensions) {
  const out = []
  if (!fs.existsSync(dirAbs)) return out

  function walk(current) {
    for (const name of fs.readdirSync(current)) {
      if (SKIP_DIR.has(name)) continue
      const abs = path.join(current, name)
      const st = fs.statSync(abs)
      if (st.isDirectory()) {
        walk(abs)
        continue
      }
      const ext = path.extname(name).toLowerCase()
      if (!extensions.includes(ext)) continue
      out.push(abs)
    }
  }

  walk(dirAbs)
  out.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  return out
}

function collectLines(product) {
  const lines = []
  for (const rel of product.dirs) {
    const dirAbs = path.join(ROOT, rel)
    for (const file of listSourceFiles(dirAbs, product.extensions)) {
      const relFile = path.relative(ROOT, file).replace(/\\/g, '/')
      lines.push(`/* ===== FILE: ${relFile} ===== */`)
      const content = fs.readFileSync(file, 'utf8')
      for (const line of content.split(/\r?\n/)) {
        lines.push(line)
      }
      lines.push('')
    }
  }
  return lines
}

function chunkPages(lines) {
  const pages = []
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE))
  }
  return pages
}

function formatPageHeader(product, pageNo, totalPages) {
  return [
    `${product.fullName} ${product.version}`,
    `第 ${pageNo} 页 / 共 ${totalPages} 页（登记摘录）`,
    '—'.repeat(60),
  ]
}

function pagesToText(product, pageSlices, startIndex) {
  return pageSlices
    .map((slice, i) => {
      const pageNo = startIndex + i + 1
      const head = formatPageHeader(product, pageNo, startIndex + pageSlices.length).join('\n')
      const body = slice.join('\n')
      return `${head}\n${body}\n`
    })
    .join('\n')
}

function exportProduct(product) {
  const lines = collectLines(product)
  const pages = chunkPages(lines)
  const totalPages = pages.length
  const needPages = PAGES_EACH_SIDE * 2

  if (totalPages < needPages) {
    console.warn(
      `[${product.id}] 源码共 ${totalPages} 页（${lines.length} 行），不足 ${needPages} 页。`,
    )
    console.warn('  登记时可提交全部源码 PDF，或补充后端/脚本目录后重新导出。')
  }

  const first = pages.slice(0, PAGES_EACH_SIDE)
  const last = pages.slice(-PAGES_EACH_SIDE)
  const outDir = path.join(ROOT, 'docs/软著登记/exports', product.id)
  fs.mkdirSync(outDir, { recursive: true })

  const meta = {
    fullName: product.fullName,
    shortName: product.shortName,
    version: product.version,
    totalSourceLines: lines.length,
    totalSourcePages: totalPages,
    linesPerPage: LINES_PER_PAGE,
    exportedFirstPages: first.length,
    exportedLastPages: last.length,
    generatedAt: new Date().toISOString(),
  }

  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')
  fs.writeFileSync(
    path.join(outDir, '01-源码-前30页.txt'),
    pagesToText(product, first, 0),
    'utf8',
  )
  fs.writeFileSync(
    path.join(outDir, '02-源码-后30页.txt'),
    pagesToText(product, last, Math.max(0, totalPages - last.length)),
    'utf8',
  )

  console.log(`[${product.id}] ${product.fullName} ${product.version}`)
  console.log(`  源码：${lines.length} 行 → ${totalPages} 页（50 行/页）`)
  console.log(`  输出：${path.relative(ROOT, outDir)}/`)
}

const arg = process.argv[2]
if (!arg || arg === '--list' || arg === '-h') {
  console.log('可用产品 id：')
  for (const p of PRODUCTS) console.log(`  ${p.id.padEnd(14)} ${p.fullName} ${p.version}`)
  console.log('\n示例：node scripts/copyright-export-source.mjs merchant-erp')
  console.log('     node scripts/copyright-export-source.mjs all')
  process.exit(0)
}

if (arg === 'all') {
  for (const p of PRODUCTS) exportProduct(p)
} else {
  const product = PRODUCTS.find((p) => p.id === arg)
  if (!product) {
    console.error(`未知产品 id: ${arg}`)
    process.exit(1)
  }
  exportProduct(product)
}
