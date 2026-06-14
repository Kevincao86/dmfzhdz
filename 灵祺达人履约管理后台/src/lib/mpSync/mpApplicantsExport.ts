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

const SCHEDULE_HEADERS = ['序号', '达人', '平台账号', '达人意向', '确认排期', '门店', '拼桌备注']

function escapeHtmlCell(v: unknown): string {
  const s = String(v == null ? '' : v)
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function visitScheduleToPrintableHtml(
  applicants: Record<string, unknown>[],
  rows: { applicantId: string; time: string; storeName?: string; tableNote?: string }[],
  orderTitle?: string,
): string {
  const byId = new Map((applicants || []).map((a) => [String(a.id), a]))
  const title = escapeHtmlCell(orderTitle || '探店排期明细')
  const headCells = SCHEDULE_HEADERS.map((h) => `<th>${escapeHtmlCell(h)}</th>`).join('')
  const bodyRows = (rows || [])
    .map((r, i) => {
      const a = byId.get(String(r.applicantId)) || {}
      const cells = [
        i + 1,
        a.platformNickname || a.displayName || a.name || r.applicantId,
        a.platformAccount || '',
        a.talentPreferredVisitAt || a.visitTimeSlot || '',
        r.time,
        r.storeName || '',
        r.tableNote || '',
      ]
        .map((c) => `<td>${escapeHtmlCell(c)}</td>`)
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
<meta charset="utf-8" />
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>探店排期</x:Name>
<x:WorksheetOptions><x:Print><x:ValidPrinterInfo/><x:PaperSizeIndex>9</x:PaperSizeIndex><x:Scale>90</x:Scale><x:HorizontalResolution>600</x:HorizontalResolution><x:VerticalResolution>600</x:VerticalResolution></x:Print><x:PageSetup><x:Layout x:Orientation="Landscape"/></x:PageSetup></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
</xml><![endif]-->
<style>
  @page { size: A4 landscape; margin: 12mm 10mm; }
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 10pt; color: #111; }
  h1 { font-size: 14pt; margin: 0 0 8pt; font-weight: 700; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; word-wrap: break-word; }
  th, td { border: 1px solid #333; padding: 4pt 5pt; vertical-align: top; line-height: 1.35; }
  th { background: #f3f4f6; font-weight: 700; text-align: center; }
  col.c-no { width: 5%; }
  col.c-name { width: 11%; }
  col.c-account { width: 14%; }
  col.c-pref { width: 16%; }
  col.c-time { width: 16%; }
  col.c-store { width: 10%; }
  col.c-note { width: 28%; }
</style>
</head>
<body>
<h1>商单：${title}</h1>
<table>
  <colgroup>
    <col class="c-no" /><col class="c-name" /><col class="c-account" />
    <col class="c-pref" /><col class="c-time" /><col class="c-store" /><col class="c-note" />
  </colgroup>
  <thead><tr>${headCells}</tr></thead>
  <tbody>${bodyRows}</tbody>
</table>
</body>
</html>`
}

export function visitScheduleToCsv(
  applicants: Record<string, unknown>[],
  rows: { applicantId: string; time: string; storeName?: string; tableNote?: string }[],
  orderTitle?: string,
): string {
  const byId = new Map((applicants || []).map((a) => [String(a.id), a]))
  const header = ['商单', orderTitle || ''].join(',')
  const cols = SCHEDULE_HEADERS.map(escapeCsvCell).join(',')
  const lines = (rows || []).map((r, i) => {
    const a = byId.get(String(r.applicantId)) || {}
    return [
      i + 1,
      a.platformNickname || a.displayName || a.name || r.applicantId,
      a.platformAccount || '',
      a.talentPreferredVisitAt || a.visitTimeSlot || '',
      r.time,
      r.storeName || '',
      r.tableNote || '',
    ]
      .map(escapeCsvCell)
      .join(',')
  })
  return `\uFEFF${header}\n${cols}\n${lines.join('\n')}`
}

export function downloadVisitScheduleCsv(
  applicants: Record<string, unknown>[],
  rows: { applicantId: string; time: string; storeName?: string; tableNote?: string }[],
  mpOrderId: string,
  orderTitle?: string,
) {
  const list = (rows || []).filter((r) => String(r.time || '').trim())
  if (!list.length) throw new Error('请先填写排期时间')
  const html = visitScheduleToPrintableHtml(applicants, list, orderTitle)
  const blob = new Blob([`\uFEFF${html}`], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `探店排期明细_${String(mpOrderId || 'order').replace(/[^\w-]/g, '_').slice(0, 40)}_${Date.now()}.xls`
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
