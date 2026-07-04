#!/usr/bin/env node
/** 验证 mpApplicantsExport 生成的 xlsx 可被 SheetJS 正常读取 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const modPath = path.join(ROOT, '灵祺达人撮合小程序/utils/mpApplicantsExport.js')

// eslint-disable-next-line import/no-dynamic-require, global-require
const mod = require(modPath)

const sample = [
  {
    platformNickname: '米忽悠',
    platform: '抖音',
    platformAccount: '111',
    displayFollowers: 1000,
    accountTags: ['美食'],
    displaySalesLevel: 'Lv3',
    quotePrice: '20',
    visitTimeSlot: '2026-07-05 14:00',
    province: '浙江',
    city: '宁波',
    contact: '13800000000',
    wechatId: 'wx_test',
    profileLink: 'https://example.com',
    alipayAccount: 'ali@test',
    displayAppliedAt: '2026-07-04 12:00',
    taskStatus: 'applied',
    selected: true,
  },
]

const buf = mod.buildApplicantsXlsxBuffer(sample)
if (!buf || !buf.length) {
  console.error('FAIL: empty buffer')
  process.exit(1)
}
if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
  console.error('FAIL: not a zip/xlsx (missing PK header)')
  process.exit(1)
}

const out = path.join('/tmp', `mp-applicants-export-smoke-${Date.now()}.xlsx`)
fs.writeFileSync(out, Buffer.from(buf))

let XLSX
try {
  XLSX = require(path.join(ROOT, '灵祺达人履约管理后台/node_modules/xlsx'))
} catch {
  console.error('SKIP: xlsx package not installed, PK header OK only', out)
  process.exit(0)
}

const wb = XLSX.readFile(out)
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
if (!rows.length || rows[0][0] !== '序号' || rows[1][1] !== '米忽悠') {
  console.error('FAIL: sheet content mismatch', rows.slice(0, 2))
  process.exit(1)
}

console.log('OK:', out, 'rows', rows.length)
