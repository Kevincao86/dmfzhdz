const CSV_HEADERS = [
  '序号',
  '昵称',
  '平台',
  '平台账号',
  '粉丝数',
  '达人标签',
  '带货等级',
  '报价',
  '探店时间',
  '省份',
  '城市',
  '联系方式',
  '微信号',
  '主页链接',
  '支付宝',
  '报名时间',
  '任务状态',
]

function escapeCsvCell(v) {
  const s = String(v == null ? '' : v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function xmlEscape(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatAccountTags(a) {
  const tags = Array.isArray(a.accountTags) ? a.accountTags : []
  return tags.map((t) => String(t || '').trim()).filter(Boolean).join('、')
}

function isApplicantSelectedForExport(a) {
  return !!(a && (a.selected || a.prSelected || a.merchantSelected))
}

/** 导出列「任务状态」：PR 已选入须显示「已入选」，不能仍用 applied 英文字段 */
function formatApplicantExportTaskStatus(a) {
  if (a.iceTaskStatus) return String(a.iceTaskStatus).trim()
  const ts = String(a.taskStatus || '').trim()
  const selected = isApplicantSelectedForExport(a)
  if (selected && (!ts || ts === 'applied')) return '已入选'
  const labels = {
    applied: '已报名',
    pending_confirm: '待确认接收',
    confirmed: '已确认接收',
    rejected: '已拒绝',
    shortlisted: '已入选',
    approved: '已通过',
  }
  if (ts && labels[ts]) return labels[ts]
  if (selected) return '已入选'
  return ts
}

function applicantRowCells(a, index) {
  return [
    index + 1,
    a.platformNickname || a.displayName || a.name || '',
    a.platform || a.displayPlatform || '',
    a.platformAccount || '',
    a.displayFollowers != null && a.displayFollowers !== ''
      ? a.displayFollowers
      : a.followers != null
        ? a.followers
        : '',
    formatAccountTags(a),
    a.displaySalesLevel || a.douyinSalesLevel || '',
    a.quotePrice || '',
    a.visitTimeSlot || '',
    a.province || '',
    a.city || '',
    a.contact || '',
    a.wechatId || '',
    a.profileLink || '',
    a.alipayAccount || a.paymentMethod || '',
    a.displayAppliedAt || a.appliedAt || '',
    formatApplicantExportTaskStatus(a),
  ]
}

function applicantsToCsv(applicants) {
  const header = CSV_HEADERS.map(escapeCsvCell).join(',')
  const lines = (applicants || []).map((a, i) =>
    applicantRowCells(a, i).map(escapeCsvCell).join(','),
  )
  return `\uFEFF${header}\n${lines.join('\n')}`
}

function colName(index) {
  let n = index
  let s = ''
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

function sheetXmlFromRows(headers, rows) {
  let body = `<row r="1">${headers
    .map((h, i) => `<c r="${colName(i)}1" t="inlineStr"><is><t>${xmlEscape(h)}</t></is></c>`)
    .join('')}</row>`
  ;(rows || []).forEach((row, ri) => {
    const r = ri + 2
    body += `<row r="${r}">${row
      .map((cell, ci) => `<c r="${colName(ci)}${r}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`)
      .join('')}</row>`
  })
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetData>' +
    body +
    '</sheetData></worksheet>'
  )
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function utf8Bytes(text) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(String(text))
  }
  const s = unescape(encodeURIComponent(String(text)))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i)
  return out
}

function concatBytes(chunks) {
  let total = 0
  chunks.forEach((c) => {
    total += c.length
  })
  const out = new Uint8Array(total)
  let offset = 0
  chunks.forEach((c) => {
    out.set(c, offset)
    offset += c.length
  })
  return out
}

/** Store-only ZIP（xlsx = Office Open XML 压缩包） */
function zipStore(entries) {
  const locals = []
  const central = []
  let offset = 0

  entries.forEach((entry) => {
    const nameBytes = utf8Bytes(entry.name)
    const data = entry.data instanceof Uint8Array ? entry.data : utf8Bytes(entry.data)
    const crc = crc32(data)
    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0, true)
    lv.setUint16(8, 0, true)
    lv.setUint16(10, 0, true)
    lv.setUint16(12, 0, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    locals.push(local, data)

    const cen = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(cen.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    cen.set(nameBytes, 46)
    central.push(cen)

    offset += local.length + data.length
  })

  const centralBytes = concatBytes(central)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralBytes.length, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  return concatBytes([...locals, centralBytes, end])
}

/** 生成微信 openDocument 可识别的标准 .xlsx 二进制 */
function buildApplicantsXlsxBuffer(applicants) {
  const list = Array.isArray(applicants) ? applicants : []
  const rows = list.map((a, i) => applicantRowCells(a, i))
  const sheetXml = sheetXmlFromRows(CSV_HEADERS, rows)
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>'
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="报名明细" sheetId="1" r:id="rId1"/></sheets></workbook>'
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>'

  return zipStore([
    { name: '[Content_Types].xml', data: utf8Bytes(contentTypes) },
    { name: '_rels/.rels', data: utf8Bytes(rels) },
    { name: 'xl/workbook.xml', data: utf8Bytes(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: utf8Bytes(workbookRels) },
    { name: 'xl/worksheets/sheet1.xml', data: utf8Bytes(sheetXml) },
  ])
}

function uint8ToBase64(bytes) {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i]
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0
    const n = (b1 << 16) | (b2 << 8) | b3
    out += table[(n >> 18) & 63]
    out += table[(n >> 12) & 63]
    out += i + 1 < bytes.length ? table[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? table[n & 63] : '='
  }
  return out
}

function safeFileName(mpOrderId) {
  const id = String(mpOrderId || 'order').replace(/[^\w-]/g, '_').slice(0, 40)
  return `招募报名_${id}_${Date.now()}.xlsx`
}

/** 微信 API 失败对象 → 可读文案 */
function formatExportError(err) {
  if (!err) return '导出失败'
  if (err instanceof Error && err.message) return String(err.message)
  if (typeof err === 'string') return err
  if (err.errMsg) return String(err.errMsg).replace(/^setClipboardData:fail\s*/i, '')
  if (err.message) return String(err.message)
  return '导出失败，请稍后重试'
}

function writeExportFileBase64(filePath, base64) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data: base64,
      encoding: 'base64',
      success: () => resolve(filePath),
      fail: (wErr) => reject(new Error(formatExportError(wErr))),
    })
  })
}

function tryOpenExcel(filePath) {
  return new Promise((resolve) => {
    wx.openDocument({
      filePath,
      fileType: 'xlsx',
      showMenu: true,
      success: () => resolve({ filePath, mode: 'open' }),
      fail: () => resolve(null),
    })
  })
}

function tryShareFileMessage(filePath, fileName) {
  if (typeof wx.shareFileMessage !== 'function') return Promise.resolve(null)
  return new Promise((resolve) => {
    wx.shareFileMessage({
      filePath,
      fileName: fileName || filePath.split('/').pop(),
      success: () => resolve({ filePath, mode: 'share' }),
      fail: () => resolve(null),
    })
  })
}

function trySaveToDisk(filePath) {
  if (typeof wx.saveFileToDisk !== 'function') return Promise.resolve(null)
  return new Promise((resolve) => {
    wx.saveFileToDisk({
      filePath,
      success: () => resolve({ filePath, mode: 'disk' }),
      fail: () => resolve(null),
    })
  })
}

function tryClipboardFallback(csv) {
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: csv,
      success: () => resolve({ mode: 'clipboard' }),
      fail: (clipErr) => reject(new Error(formatExportError(clipErr))),
    })
  })
}

async function exportApplicantsExcel(applicants, mpOrderId) {
  const list = Array.isArray(applicants) ? applicants : []
  if (!list.length) {
    throw new Error('暂无报名数据可导出')
  }
  const xlsxBytes = buildApplicantsXlsxBuffer(list)
  const fileName = safeFileName(mpOrderId)
  const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`
  await writeExportFileBase64(filePath, uint8ToBase64(xlsxBytes))

  const saved = await trySaveToDisk(filePath)
  if (saved) return saved

  const opened = await tryOpenExcel(filePath)
  if (opened) return opened

  const shared = await tryShareFileMessage(filePath, fileName)
  if (shared) return shared

  return tryClipboardFallback(applicantsToCsv(list))
}

function showExportResultToast(res) {
  const mode = res && res.mode
  if (mode === 'disk') {
    wx.showToast({ title: 'Excel 已保存', icon: 'success', duration: 2500 })
    return
  }
  if (mode === 'open') {
    wx.showToast({ title: 'Excel 已打开', icon: 'success', duration: 2000 })
    return
  }
  if (mode === 'share') {
    wx.showToast({ title: '请选择发送对象', icon: 'none', duration: 2000 })
    return
  }
  if (mode === 'clipboard') {
    wx.showToast({ title: '已复制，可粘贴到 Excel', icon: 'none', duration: 2500 })
  }
}

module.exports = {
  applicantsToCsv,
  buildApplicantsXlsxBuffer,
  exportApplicantsExcel,
  formatExportError,
  showExportResultToast,
}
