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

/** Excel 2003 XML（.xls），微信 openDocument 可直接用 Excel/WPS 打开 */
function applicantsToSpreadsheetXml(applicants) {
  const headerRow =
    '<Row>' +
    CSV_HEADERS.map((h) => `<Cell><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`).join('') +
    '</Row>'
  const bodyRows = (applicants || [])
    .map((a, i) => {
      const cells = applicantRowCells(a, i)
        .map((c) => `<Cell><Data ss:Type="String">${xmlEscape(c)}</Data></Cell>`)
        .join('')
      return `<Row>${cells}</Row>`
    })
    .join('')
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n' +
    ' <Worksheet ss:Name="报名明细">\n' +
    '  <Table>\n' +
    `   ${headerRow}\n` +
    `   ${bodyRows}\n` +
    '  </Table>\n' +
    ' </Worksheet>\n' +
    '</Workbook>'
  )
}

function safeFileName(mpOrderId) {
  const id = String(mpOrderId || 'order').replace(/[^\w-]/g, '_').slice(0, 40)
  return `招募报名_${id}_${Date.now()}.xls`
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

function writeExportFile(filePath, data) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data,
      encoding: 'utf8',
      success: () => resolve(filePath),
      fail: (wErr) => reject(new Error(formatExportError(wErr))),
    })
  })
}

function tryOpenExcel(filePath) {
  return new Promise((resolve) => {
    wx.openDocument({
      filePath,
      fileType: 'xls',
      showMenu: true,
      success: () => resolve({ filePath, mode: 'open' }),
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
  const xml = applicantsToSpreadsheetXml(list)
  const csv = applicantsToCsv(list)
  const fileName = safeFileName(mpOrderId)
  const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`
  await writeExportFile(filePath, xml)

  const opened = await tryOpenExcel(filePath)
  if (opened) return opened

  const saved = await trySaveToDisk(filePath)
  if (saved) return saved

  return tryClipboardFallback(csv)
}

module.exports = {
  applicantsToCsv,
  applicantsToSpreadsheetXml,
  exportApplicantsExcel,
  formatExportError,
}
