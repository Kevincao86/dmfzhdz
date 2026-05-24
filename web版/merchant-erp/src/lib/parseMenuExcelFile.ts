/**
 * 解析价目表 Excel / CSV 为行矩阵，供 AI 识别接口使用。
 * WPS/Excel 常把 !ref 扩到很大；按实际有值单元格裁剪，避免误报「超过 800 行」。
 */
import type { CellObject, WorkSheet } from 'xlsx'

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

function cellDisplayText(cell: CellObject | undefined): string {
  if (!cell) return ''
  if (typeof cell.w === 'string' && cell.w.trim()) return cell.w.trim()
  const v = cell.v
  if (v == null) return ''
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'string') return v.trim()
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return ''
}

/** 仅读取 sheet 中真实有值的行（忽略 !ref 尾部空白/format 占位） */
export function extractSheetDataRows(
  sheet: WorkSheet,
  utils: Pick<typeof import('xlsx')['utils'], 'decode_range' | 'decode_cell' | 'encode_cell'>,
): string[][] {
  const ref = sheet['!ref']
  if (!ref) return []

  const decoded = utils.decode_range(ref)
  let maxR = decoded.s.r
  let maxC = decoded.s.c

  for (const key of Object.keys(sheet)) {
    if (key[0] === '!') continue
    const addr = utils.decode_cell(key)
    const text = cellDisplayText(sheet[key] as CellObject)
    if (!text) continue
    if (addr.r > maxR) maxR = addr.r
    if (addr.c > maxC) maxC = addr.c
  }

  const rows: string[][] = []
  for (let r = decoded.s.r; r <= maxR; r++) {
    const row: string[] = []
    let any = false
    for (let c = decoded.s.c; c <= maxC; c++) {
      const t = cellDisplayText(sheet[utils.encode_cell({ r, c })] as CellObject | undefined)
      row.push(t)
      if (t) any = true
    }
    if (any) rows.push(row)
  }
  return rows
}

export async function parseMenuExcelFile(file: File): Promise<{
  rows: string[][]
  sheetName: string
}> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', raw: false, cellDates: true })

  let sheetName = wb.SheetNames[0] ?? 'Sheet1'
  let rows: string[][] = []

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    if (!sheet) continue
    const candidate = extractSheetDataRows(sheet, XLSX.utils)
    if (candidate.length > rows.length) {
      rows = candidate
      sheetName = name
    }
  }

  return { rows, sheetName }
}
