/**
 * 解析价目表 Excel / CSV 为行矩阵，供 AI 识别接口使用。
 */
const ACCEPT_EXT = /\.(xlsx|xls|csv)$/i

export function isMenuExcelFile(file: File): boolean {
  const name = file.name.toLowerCase()
  if (ACCEPT_EXT.test(name)) return true
  const t = file.type
  return (
    t === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    t === 'application/vnd.ms-excel' ||
    t === 'text/csv' ||
    t === 'application/csv'
  )
}

export async function parseMenuExcelFile(file: File): Promise<{
  rows: string[][]
  sheetName: string
}> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', raw: false })
  const sheetName = wb.SheetNames[0] ?? 'Sheet1'
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    return { rows: [], sheetName }
  }
  const raw = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })
  const rows = raw
    .map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some((c) => c.length > 0))
  return { rows, sheetName }
}
