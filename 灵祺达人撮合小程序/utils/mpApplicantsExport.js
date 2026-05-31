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

function formatAccountTags(a) {
  const tags = Array.isArray(a.accountTags) ? a.accountTags : []
  return tags.map((t) => String(t || '').trim()).filter(Boolean).join('、')
}

function applicantRowCells(a, index) {
  return [
    index + 1,
    a.platformNickname || a.name || '',
    a.platform || '',
    a.platformAccount || '',
    a.followers != null ? a.followers : '',
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
    a.appliedAt || '',
    a.taskStatus || '',
  ]
}

function applicantsToCsv(applicants) {
  const header = CSV_HEADERS.map(escapeCsvCell).join(',')
  const lines = (applicants || []).map((a, i) =>
    applicantRowCells(a, i).map(escapeCsvCell).join(','),
  )
  return `\uFEFF${header}\n${lines.join('\n')}`
}

function safeFileName(mpOrderId) {
  const id = String(mpOrderId || 'order').replace(/[^\w-]/g, '_').slice(0, 40)
  return `招募报名_${id}_${Date.now()}.csv`
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

function exportApplicantsExcel(applicants, mpOrderId) {
  const list = Array.isArray(applicants) ? applicants : []
  if (!list.length) {
    return Promise.reject(new Error('暂无报名数据可导出'))
  }
  const csv = applicantsToCsv(list)
  const fileName = safeFileName(mpOrderId)
  const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`

  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data: csv,
      encoding: 'utf8',
      success: () => {
        wx.openDocument({
          filePath,
          fileType: 'csv',
          showMenu: true,
          success: () => resolve({ filePath, mode: 'open' }),
          fail: () => {
            wx.setClipboardData({
              data: csv,
              success: () => resolve({ filePath, mode: 'clipboard' }),
              fail: (clipErr) => {
                // 文件已写入；部分环境无法打开 csv / 剪贴板受限
                resolve({ filePath, mode: 'saved', hint: formatExportError(clipErr) })
              },
            })
          },
        })
      },
      fail: (wErr) => reject(new Error(formatExportError(wErr))),
    })
  })
}

module.exports = {
  applicantsToCsv,
  exportApplicantsExcel,
  formatExportError,
}
