const CSV_HEADERS = [
  '序号', '昵称', '平台', '平台账号', '粉丝数', '达人标签', '带货等级', '报价', '探店时间',
  '省份', '城市', '联系方式', '微信号', '主页链接', '支付宝', '报名时间', '任务状态',
]

function escapeCsvCell(v: unknown): string {
  const s = String(v == null ? '' : v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function formatAccountTags(a: Record<string, unknown>): string {
  const tags = Array.isArray(a.accountTags) ? a.accountTags : []
  return tags.map((t) => String(t || '').trim()).filter(Boolean).join('、')
}

function applicantRowCells(a: Record<string, unknown>, index: number) {
  return [
    index + 1,
    a.platformNickname || a.displayName || a.name || '',
    a.platform || '',
    a.platformAccount || '',
    a.followers != null ? a.followers : a.displayFollowers || '',
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
    a.appliedAt || a.displayAppliedAt || '',
    a.taskStatus || (a.selected ? '已入选' : ''),
  ]
}

export function applicantsToCsv(applicants: Record<string, unknown>[]): string {
  const header = CSV_HEADERS.map(escapeCsvCell).join(',')
  const lines = (applicants || []).map((a, i) => applicantRowCells(a, i).map(escapeCsvCell).join(','))
  return `\uFEFF${header}\n${lines.join('\n')}`
}

function safeFileName(mpOrderId: string): string {
  const id = String(mpOrderId || 'order').replace(/[^\w-]/g, '_').slice(0, 40)
  return `招募报名_${id}_${Date.now()}.csv`
}

export function downloadApplicantsCsv(applicants: Record<string, unknown>[], mpOrderId: string) {
  const list = Array.isArray(applicants) ? applicants : []
  if (!list.length) throw new Error('暂无报名数据可导出')
  const csv = applicantsToCsv(list)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeFileName(mpOrderId)
  a.click()
  URL.revokeObjectURL(url)
}

export function copyApplicantProfile(a: Record<string, unknown>) {
  const tagLine = Array.isArray(a.accountTags) && a.accountTags.length ? (a.accountTags as string[]).join('、') : ''
  const lines = [
    `昵称：${a.displayName || a.platformNickname || a.name || ''}`,
    `平台：${a.platform || ''}`,
    `账号：${a.platformAccount || ''}`,
    `粉丝：${a.displayFollowers || a.followers || ''}`,
    tagLine ? `达人标签：${tagLine}` : '',
    `带货等级：${a.displaySalesLevel || a.douyinSalesLevel || '—'}`,
    `报价：${a.quotePrice || ''}`,
    a.visitTimeSlot ? `探店：${a.visitTimeSlot}` : '',
    `联系：${a.contact || ''}`,
    `微信：${a.wechatId || ''}`,
    `主页：${a.profileLink || ''}`,
    a.selected ? '状态：已入选' : '',
  ].filter(Boolean)
  return navigator.clipboard.writeText(lines.join('\n'))
}
