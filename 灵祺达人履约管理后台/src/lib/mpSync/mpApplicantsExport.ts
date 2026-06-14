import {
  formatScheduleTableNote,
  type VisitScheduleRow,
} from '../../lib/mpSync/visitScheduleRuntime'

export { formatScheduleTableNote }

export function normalizeTableNoteForExport(note: string): string {
  const s = String(note || '').trim()
  if (!s) return ''
  if (/单独探店/.test(s) && !/拼桌/.test(s)) return '单独探店'
  return s
}

const CSV_HEADERS = [
  '序号', '昵称', '平台', '平台账号', '粉丝数', '达人标签', '带货等级', '报价', '探店时间',
  '省份', '城市', '联系方式', '微信号', '主页链接', '支付宝', '报名时间', '任务状态',
]

const SCHEDULE_HEADERS = ['序号', '达人', '平台账号', '达人意向', '确认排期', '门店', '拼桌备注']

const BORDER_STYLES = `
<Style ss:ID="cell"><Borders>
<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
</Borders></Style>
<Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/><Borders>
<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
</Borders></Style>
<Style ss:ID="title"><Font ss:Bold="1" ss:Size="12"/></Style>`

function escapeXml(v: unknown): string {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function xmlCell(value: unknown, style: 'cell' | 'header' = 'cell'): string {
  const text = escapeXml(value)
  return `<Cell ss:StyleID="${style}"><Data ss:Type="String">${text}</Data></Cell>`
}

function xmlRow(cells: unknown[], header = false): string {
  const style = header ? 'header' : 'cell'
  return `<Row>${cells.map((c) => xmlCell(c, style)).join('')}</Row>`
}

function borderedSpreadsheetXml(sheetName: string, title: string, headers: string[], rows: unknown[][]): string {
  const tableRows = [
    xmlRow([title], false),
    xmlRow([]),
    xmlRow(headers, true),
    ...rows.map((r) => xmlRow(r)),
  ].join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>${BORDER_STYLES}</Styles>
<Worksheet ss:Name="${escapeXml(sheetName)}">
<Table>${tableRows}</Table>
<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
<PageSetup>
<Layout x:Orientation="Landscape"/>
<Header x:Margin="0.3"/>
<Footer x:Margin="0.3"/>
<PageMargins x:Bottom="0.5" x:Left="0.4" x:Right="0.4" x:Top="0.5"/>
</PageSetup>
<FitToPage/>
<Print>
<ValidPrinterInfo/>
<PaperSizeIndex>9</PaperSizeIndex>
<Scale>90</Scale>
</Print>
</WorksheetOptions>
</Worksheet>
</Workbook>`
}

function downloadSpreadsheetXml(filename: string, xml: string) {
  const blob = new Blob([`\uFEFF${xml}`], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

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

function safeFileName(mpOrderId: string, prefix: string): string {
  const id = String(mpOrderId || 'order').replace(/[^\w-]/g, '_').slice(0, 40)
  return `${prefix}_${id}_${Date.now()}.xls`
}

export function downloadApplicantsCsv(applicants: Record<string, unknown>[], mpOrderId: string) {
  const list = Array.isArray(applicants) ? applicants : []
  if (!list.length) throw new Error('暂无报名数据可导出')
  const rows = list.map((a, i) => applicantRowCells(a, i))
  const xml = borderedSpreadsheetXml('报名明细', `招募报名 · ${mpOrderId}`, CSV_HEADERS, rows)
  downloadSpreadsheetXml(safeFileName(mpOrderId, '招募报名'), xml)
}

export function visitScheduleToPrintableHtml(
  applicants: Record<string, unknown>[],
  rows: { applicantId: string; time: string; storeName?: string; tableNote?: string }[],
  orderTitle?: string,
): string {
  const byId = new Map((applicants || []).map((a) => [String(a.id), a]))
  const dataRows = (rows || []).map((r, i) => {
    const a = byId.get(String(r.applicantId)) || {}
    return [
      i + 1,
      a.platformNickname || a.displayName || a.name || r.applicantId,
      a.platformAccount || '',
      a.talentPreferredVisitAt || a.visitTimeSlot || '',
      r.time,
      r.storeName || '',
      normalizeTableNoteForExport(String(r.tableNote || '')),
    ]
  })
  return borderedSpreadsheetXml('探店排期', `商单：${orderTitle || '探店排期明细'}`, SCHEDULE_HEADERS, dataRows)
}

export function visitScheduleToCsv(
  applicants: Record<string, unknown>[],
  rows: { applicantId: string; time: string; storeName?: string; tableNote?: string }[],
  orderTitle?: string,
): string {
  return visitScheduleToPrintableHtml(applicants, rows, orderTitle)
}

export function downloadVisitScheduleCsv(
  applicants: Record<string, unknown>[],
  rows: { applicantId: string; time: string; storeName?: string; tableNote?: string }[],
  mpOrderId: string,
  orderTitle?: string,
) {
  const list = (rows || []).filter((r) => String(r.time || '').trim())
  if (!list.length) throw new Error('请先填写排期时间')
  const xml = visitScheduleToPrintableHtml(applicants, list, orderTitle)
  downloadSpreadsheetXml(safeFileName(mpOrderId, '探店排期明细'), xml)
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
