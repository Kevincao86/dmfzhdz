import * as XLSX from 'xlsx'

export type LibraryFeatureImportRow = {
  id: string
  addons?: boolean
  recommendHall?: boolean
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function pickCol(row: Record<string, unknown>, keys: string[]): string {
  const norm = (k: string) =>
    k
      .replace(/\s/g, '')
      .replace(/[（(].*?[)）]/g, '')
      .toLowerCase()
  const entries = Object.entries(row)
  for (const want of keys) {
    const w = norm(want)
    for (const [rk, rv] of entries) {
      const rkn = norm(rk)
      if (rkn === w) return cellStr(rv)
    }
  }
  for (const want of keys) {
    const w = norm(want)
    for (const [rk, rv] of entries) {
      const rkn = norm(rk)
      if (rkn.includes(w) || w.includes(rkn)) return cellStr(rv)
    }
  }
  return ''
}

function parseBoolCell(raw: string): boolean | undefined {
  const s = raw.trim().toLowerCase()
  if (!s) return undefined
  if (['1', 'true', 'yes', 'y', 'on', '开通', '开启', '是', '已开通', '启用'].includes(s)) return true
  if (['0', 'false', 'no', 'n', 'off', '关闭', '否', '未开通', '停用'].includes(s)) return false
  if (/^已?开通/.test(s)) return true
  if (/^未?开通/.test(s) || /关闭/.test(s)) return false
  return undefined
}

/**
 * 解析 PR/达人库功能开通表：首列灵祺 ID，可选「增值服务」「推荐大厅」列。
 */
export function parseLibraryFeaturesSheet(
  buf: ArrayBuffer,
  kind: 'pr' | 'talent',
): { rows: LibraryFeatureImportRow[]; errors: string[] } {
  const errors: string[] = []
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: 'array' })
  } catch (e) {
    return { rows: [], errors: [`无法读取 Excel：${String(e)}`] }
  }
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return { rows: [], errors: ['工作簿为空'] }
  const ws = wb.Sheets[sheetName]
  if (!ws) return { rows: [], errors: ['未找到工作表'] }
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  if (!rawRows.length) return { rows: [], errors: ['表格无数据行'] }

  const idKeys =
    kind === 'pr'
      ? ['灵祺PRID', 'PRID', '灵祺PR ID', 'LQ-P', 'id', 'ID']
      : ['灵祺达人ID', '达人ID', '灵祺达人 ID', 'LQ-D', 'id', 'ID']

  const rows: LibraryFeatureImportRow[] = []
  rawRows.forEach((row, idx) => {
    const id = pickCol(row, idKeys)
    if (!id) {
      errors.push(`第 ${idx + 2} 行：缺少灵祺 ID`)
      return
    }
    const addons = parseBoolCell(pickCol(row, ['增值服务', 'addon', 'addons', '增值']))
    const recommendHall = parseBoolCell(
      pickCol(row, ['推荐大厅', 'recommendHall', '大厅', '推荐']),
    )
    if (addons === undefined && recommendHall === undefined) {
      errors.push(`第 ${idx + 2} 行 ${id}：未填写增值服务或推荐大厅开关`)
      return
    }
    rows.push({
      id,
      ...(addons !== undefined ? { addons } : {}),
      ...(recommendHall !== undefined ? { recommendHall } : {}),
    })
  })
  return { rows, errors }
}
