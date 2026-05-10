import * as XLSX from 'xlsx'
import type { RegistryTalentPoolRow } from './opsRegistryApi'

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function parseFans(raw: string): number {
  const s = raw.trim()
  if (!s) return 0
  const wan = s.match(/(\d+(?:\.\d+)?)\s*万/)
  if (wan) return Math.max(0, Math.floor(Number(wan[1]) * 10000))
  const n = parseInt(s.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) ? Math.max(0, n) : 0
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

/**
 * 将达人招募表（.xlsx）解析为达人候选行；列名兼容模版首行中文标题。
 * 「智能」部分：列模糊匹配、粉丝量「万」、示例行跳过。
 */
export function parseRecruitmentTalentSheet(
  buf: ArrayBuffer,
  sourceRecruitmentOrderId: string,
): { candidates: RegistryTalentPoolRow[]; errors: string[] } {
  const errors: string[] = []
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: 'array' })
  } catch (e) {
    return { candidates: [], errors: [`无法读取 Excel：${String(e)}`] }
  }
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return { candidates: [], errors: ['工作簿为空'] }
  const ws = wb.Sheets[sheetName]
  if (!ws) return { candidates: [], errors: ['未找到工作表'] }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false })
  if (!rows.length) return { candidates: [], errors: ['表格无数据行'] }

  const candidates: RegistryTalentPoolRow[] = []
  const baseTs = Date.now()
  let i = 0
  for (const row of rows) {
    const name =
      pickCol(row, ['达人昵称', '昵称', '达人名称', '姓名', '达人', 'name', 'Name']) ||
      cellStr(Object.values(row)[0])
    if (!name || /示例/.test(name)) continue

    const platform = pickCol(row, ['平台', '投放平台', 'platform']) || '抖音'
    const contentFormat = pickCol(row, ['内容形态', '内容类型', '形态', 'format']) || '短视频'
    const fansRaw = pickCol(row, ['粉丝量', '粉丝数', '粉丝', 'followers'])
    const niche = pickCol(row, ['领域', '垂类', '标签', 'niche']) || '本地生活'
    const baseFeeRaw = pickCol(row, ['基础费', '基础费(元)', '报价', '基础报价'])
    const bonusRaw = pickCol(row, ['绩效', '绩效(元)', '奖金', 'bonus'])
    const note = pickCol(row, ['备注', '说明'])

    const followers = parseFans(fansRaw)
    const baseFee = Math.max(0, Math.floor(Number(baseFeeRaw.replace(/[^\d.-]/g, '')) || 0))
    const bonus = Math.max(0, Math.floor(Number(bonusRaw.replace(/[^\d.-]/g, '')) || 0))

    i += 1
    candidates.push({
      id: `ing-${sourceRecruitmentOrderId}-${baseTs}-${i}`,
      name,
      platform: platform || '抖音',
      contentFormat: contentFormat || '短视频',
      status: 'pending_confirm',
      followers: followers || 1000,
      niche: niche || '本地生活',
      baseFee: baseFee || 800,
      bonus: bonus || 200,
      schedulingConflict: /冲突|排期/.test(note),
      sourceRecruitmentOrderId,
    })
  }

  if (!candidates.length) {
    errors.push('未解析到有效达人行（需包含「达人昵称」列或首列为昵称，且勿仅保留示例行）')
  }
  return { candidates, errors }
}
