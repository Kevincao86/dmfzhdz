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

export type HeuristicMenuParseResult = {
  items: Array<{
    name: string
    productCode?: string
    priceYuan?: number
    category?: string
    note?: string
  }>
}

const HEADER_NAME = /名称|品名|商品名|菜品|项目|服务|product|name|title/i
const HEADER_CODE = /编号|编码|sku|货号|条码|code/i
const HEADER_PRICE = /价格|售价|单价|金额|price|amount/i
const HEADER_CATEGORY = /分类|类别|品类|category|type/i
const HEADER_NOTE = /备注|说明|note|remark/i

function parsePriceCell(text: string): number | undefined {
  const t = text.replace(/[,¥￥\s元]/g, '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function findHeaderMap(rows: string[][]): { headerIdx: number; map: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i]!
    const map: Record<string, number> = {}
    row.forEach((cell, col) => {
      const t = cell.trim()
      if (!t) return
      if (HEADER_NAME.test(t)) map.name = col
      else if (HEADER_CODE.test(t)) map.code = col
      else if (HEADER_PRICE.test(t)) map.price = col
      else if (HEADER_CATEGORY.test(t)) map.category = col
      else if (HEADER_NOTE.test(t)) map.note = col
    })
    if (map.name != null || map.price != null) {
      if (map.name == null) {
        const nameCol = row.findIndex(
          (c, col) => looksLikeProductName(c) && col !== map.price && col !== map.code,
        )
        if (nameCol >= 0) map.name = nameCol
      }
      if (map.name != null || map.price != null) return { headerIdx: i, map }
    }
  }
  return null
}

/** 表头/列位置规则本地解析，API 不可用时的兜底 */
export function heuristicParseMenuRows(rows: string[][]): HeuristicMenuParseResult {
  const refined = refineProductRows(rows)
  const header = findHeaderMap(refined)
  const items: HeuristicMenuParseResult['items'] = []
  const start = header ? header.headerIdx + 1 : 0
  let lastCategory = ''

  for (let i = start; i < refined.length; i++) {
    const row = refined[i]!.map((c) => String(c ?? '').trim())
    if (!row.some((c) => c.length > 0)) continue
    if (/合计|小计|总计|备注说明/.test(row.join(''))) continue

    let name = ''
    let productCode: string | undefined
    let priceYuan: number | undefined
    let category: string | undefined
    let note: string | undefined

    if (header) {
      const { map } = header
      if (map.name != null) name = row[map.name] ?? ''
      if (map.code != null) {
        const code = row[map.code] ?? ''
        if (code && !isLinkOnlyToken(code)) productCode = code
      }
      if (map.price != null) priceYuan = parsePriceCell(row[map.price] ?? '')
      if (map.category != null) {
        const cat = row[map.category] ?? ''
        if (cat) category = cat
      }
      if (map.note != null) note = row[map.note] ?? undefined
    } else {
      const prices = row.map(parsePriceCell).filter((p): p is number => p != null)
      const names = row.filter(looksLikeProductName)
      name = names.sort((a, b) => b.length - a.length)[0] ?? ''
      priceYuan = prices[0]
      const codes = row.filter((c) => c && !looksLikeProductName(c) && !parsePriceCell(c) && !isLinkOnlyToken(c))
      if (codes[0] && /^\w[\w-]{2,}$/.test(codes[0])) productCode = codes[0]
    }

    if (!name) {
      const onlyCat = row.filter((c) => c && !parsePriceCell(c) && !isLinkOnlyToken(c))
      if (onlyCat.length === 1 && onlyCat[0]!.length <= 12 && !looksLikeProductName(onlyCat[0]!)) {
        lastCategory = onlyCat[0]!
        continue
      }
    }

    if (!name || !looksLikeProductName(name)) continue
    if (priceYuan == null && !productCode) continue

    items.push({
      name,
      ...(productCode ? { productCode } : {}),
      ...(priceYuan != null ? { priceYuan } : {}),
      ...(category || lastCategory ? { category: category || lastCategory } : {}),
      ...(note?.trim() ? { note: note.trim() } : {}),
    })
    if (items.length >= 200) break
  }

  return { items }
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
