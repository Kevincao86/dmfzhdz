const CSV_HEADERS = [
  '序号',
  '昵称',
  '平台',
  '平台账号',
  '粉丝数',
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

function applicantRowCells(a, index) {
  return [
    index + 1,
    a.platformNickname || a.name || '',
    a.platform || '',
    a.platformAccount || '',
    a.followers != null ? a.followers : '',
    a.douyinSalesLevel || '',
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
              fail: reject,
            })
          },
        })
      },
      fail: reject,
    })
  })
}

module.exports = {
  applicantsToCsv,
  exportApplicantsExcel,
}
