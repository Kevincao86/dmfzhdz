/**
 * 解析价目表 Excel / CSV 为行矩阵，供 AI 识别接口使用。
 * WPS 常在尾部留下仅含 ID/超链的占位行；按「品名或价格」截断有效数据区。
 */
import type { CellObject, WorkSheet } from 'xlsx'

const ACCEPT_EXT = /\.(xlsx|xls|csv)$/i

const MENU_SHEET_HINTS = [
  /商品/,
  /价目/,
  /菜单/,
  /货品/,
  /产品/,
  /售卖/,
  /menu/i,
  /product/i,
  /price/i,
]
const SKIP_SHEET_HINTS = [/达人/, /主播/, /kol/i, /influencer/i, /creator/i]

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

function isLinkOnlyToken(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (t === '打开链接' || t === '链接' || t === '查看链接' || t === '点击打开') return true
  if (/^https?:\/\//i.test(t)) return true
  return false
}

function looksLikePrice(text: string): boolean {
  const t = text.replace(/[,¥￥\s]/g, '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return false
  const n = Number(t)
  return Number.isFinite(n) && n > 0
}

function looksLikeProductName(text: string): boolean {
  const t = text.trim()
  if (!t || isLinkOnlyToken(t)) return false
  // 纯长数字 ID 不算品名
  if (/^\d{8,}$/.test(t)) return false
  if (/名称|品名|商品名|菜品|项目/.test(t)) return true
  if (/[\u4e00-\u9fff]/.test(t) && t.length >= 2) return true
  if (/[A-Za-z\u4e00-\u9fff]/.test(t) && t.length >= 3) return true
  return false
}

/** 含品名/表头或价格的有效商品行（排除仅 ID+链接的尾部占位行） */
export function rowHasProductCore(row: string[]): boolean {
  const cells = row.map((c) => c.trim()).filter((c) => c.length > 0)
  if (cells.length === 0) return false

  const nameCells = cells.filter(looksLikeProductName)
  const priceCells = cells.filter(looksLikePrice)

  if (nameCells.length > 0 && priceCells.length > 0) return true
  if (nameCells.some((n) => n.length >= 4)) return true
  if (nameCells.some((n) => /名称|品名|商品|菜品|项目|分类/.test(n))) return true
  return false
}

/** 截到最后一条「有品名或价格」的数据行 */
export function trimToProductTable(rows: string[][]): string[][] {
  let last = -1
  for (let i = 0; i < rows.length; i++) {
    if (rowHasProductCore(rows[i]!)) last = i
  }
  if (last >= 0) return rows.slice(0, last + 1)
  return rows
}

/** @deprecated 兼容旧引用；请用 refineProductRows */
export function isMeaningfulProductRow(cells: string[]): boolean {
  return rowHasProductCore(cells)
}

export function refineProductRows(rows: string[][]): string[][] {
  const trimmed = trimToProductTable(rows)
  if (trimmed.length > 0 && trimmed.length < rows.length) return trimmed

  const out: string[][] = []
  let junkStreak = 0
  for (const row of rows) {
    if (rowHasProductCore(row)) {
      out.push(row)
      junkStreak = 0
    } else {
      junkStreak++
      if (out.length > 0 && junkStreak > 4) break
      if (out.length === 0 && junkStreak <= 2) out.push(row)
    }
  }
  return out.length > 0 ? out : rows
}

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

type SheetCandidate = {
  name: string
  index: number
  rows: string[][]
}

function scoreSheetCandidate(name: string, index: number, rows: string[][]): number {
  if (rows.length === 0) return -1
  if (SKIP_SHEET_HINTS.some((re) => re.test(name))) return -1000 + rows.length
  let score = 0
  if (MENU_SHEET_HINTS.some((re) => re.test(name))) score += 10_000
  if (index === 0) score += 500
  if (rows.length <= 800) score += 200
  else score -= rows.length
  score += rows.filter(rowHasProductCore).length
  return score
}

function pickMenuSheet(candidates: SheetCandidate[]): SheetCandidate {
  if (candidates.length === 0) {
    return { name: 'Sheet1', index: 0, rows: [] }
  }
  const ranked = [...candidates].sort((a, b) => {
    const sa = scoreSheetCandidate(a.name, a.index, a.rows)
    const sb = scoreSheetCandidate(b.name, b.index, b.rows)
    if (sb !== sa) return sb - sa
    return a.index - b.index
  })
  return ranked[0]!
}

export async function parseMenuExcelFile(file: File): Promise<{
  rows: string[][]
  sheetName: string
}> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', raw: false, cellDates: true })

  const candidates: SheetCandidate[] = []
  wb.SheetNames.forEach((name, index) => {
    const sheet = wb.Sheets[name]
    if (!sheet) return
    const raw = extractSheetDataRows(sheet, XLSX.utils)
    const rows = refineProductRows(raw)
    candidates.push({ name, index, rows })
  })

  const picked = pickMenuSheet(candidates)
  return { rows: picked.rows, sheetName: picked.name }
}
