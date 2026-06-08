#!/usr/bin/env node
/** 从 recruitCoverLibrary.manifest 生成 coverAssetRegistry.js（require 确保上传包含 JPEG） */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const MP = path.join(ROOT, '灵祺达人撮合小程序')
const manifestPath = path.join(MP, 'utils/recruitCoverLibrary.manifest.js')
const outPath = path.join(MP, 'packages/recruit-covers-mp/coverAssetRegistry.js')

const text = fs.readFileSync(manifestPath, 'utf8')
const manifest = Function(`return ${text.split('=').slice(1).join('=').trim().replace(/;$/, '')}`)()
const paths = []
for (const bucket of ['platforms', 'tags']) {
  for (const items of Object.values(manifest[bucket] || {})) {
    for (const item of items || []) {
      if (item.path && !paths.includes(item.path)) paths.push(item.path)
    }
  }
}
paths.sort()

const lines = [
  '/** 自动生成：require 引用确保上传/体验版包含全部封面 JPEG（勿手改） */',
  'const byPath = {',
]
for (const p of paths) {
  lines.push(`  '${p.replace(/'/g, "\\'")}': require('./${p}'),`)
}
lines.push(
  '}',
  '',
  'function urlByPath(rel) {',
  "  const key = String(rel || '').replace(/^\\/+/, '')",
  '  return byPath[key] || \'\'',
  '}',
  '',
  'module.exports = byPath',
  'module.exports.byPath = byPath',
  'module.exports.urlByPath = urlByPath',
  '',
)

fs.writeFileSync(outPath, lines.join('\n'))
console.log(`OK: coverAssetRegistry ${paths.length} assets -> ${outPath}`)
