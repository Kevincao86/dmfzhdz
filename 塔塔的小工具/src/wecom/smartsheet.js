import fs from 'node:fs'
import { config, hasWecomAuth, hasSheetCreds, demoPath } from '../config.js'
import { getAccessToken } from './token.js'

async function postSmartsheet(path, body) {
  const token = await getAccessToken()
  const url = `https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/${path}?access_token=${encodeURIComponent(token)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`smartsheet ${path} 失败: ${data.errcode} ${data.errmsg || ''}`)
  }
  return data
}

/**
 * 查询字段列表
 * @see https://developer.work.weixin.qq.com/document/path/101147
 */
export async function getFields(docid, sheetId) {
  const data = await postSmartsheet('get_fields', {
    docid,
    sheet_id: sheetId,
  })
  return Array.isArray(data.fields) ? data.fields : []
}

/**
 * 分页拉取记录（最多拉 limit 条，默认 500）
 * @see https://developer.work.weixin.qq.com/document/path/101158
 */
export async function getRecords(docid, sheetId, { limit = 500 } = {}) {
  const records = []
  let offset = ''
  let hasMore = true
  while (hasMore && records.length < limit) {
    const body = {
      docid,
      sheet_id: sheetId,
      offset: offset || undefined,
      limit: Math.min(100, limit - records.length),
    }
    const data = await postSmartsheet('get_records', body)
    const batch = Array.isArray(data.records) ? data.records : []
    records.push(...batch)
    hasMore = Boolean(data.has_more)
    offset = data.next || data.next_offset || ''
    if (!batch.length) break
  }
  return records
}

/** 智能表格单元格值拍平为可读标量/布尔 */
export function cellToPlain(value) {
  if (value == null) return ''
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((v) => cellToPlain(v))
      .filter((v) => v !== '' && v != null)
      .join('、')
  }
  if (typeof value === 'object') {
    if ('type' in value && 'text' in value) return String(value.text ?? '')
    if ('text' in value) return String(value.text ?? '')
    if ('checked' in value) return Boolean(value.checked)
    if ('number' in value) return Number(value.number)
    if (Array.isArray(value.values)) return cellToPlain(value.values)
    if (Array.isArray(value.users)) {
      return value.users.map((u) => u.name || u.userid || '').filter(Boolean).join('、')
    }
  }
  return String(value)
}

/**
 * 将 get_records 结果映射为「中文列标题 → 值」的行对象。
 * fields: [{ field_id, field_title, field_type }]
 * records: [{ record_id, values: { [field_id]: ... } }]
 */
export function recordsToRows(fields, records) {
  const idToTitle = new Map()
  for (const f of fields) {
    const id = f.field_id || f.id
    const title = f.field_title || f.title || f.field_name
    if (id && title) idToTitle.set(String(id), String(title))
  }
  return records.map((rec) => {
    const values = rec.values || rec.fields || {}
    const row = {}
    for (const [fid, raw] of Object.entries(values)) {
      const title = idToTitle.get(String(fid)) || String(fid)
      row[title] = cellToPlain(raw)
    }
    return row
  })
}

function loadDemoRows(fileName) {
  const p = demoPath(fileName)
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
  return Array.isArray(raw) ? raw : []
}

/**
 * 按业务 kind 拉行：有凭证读企微，否则读 demo JSON。
 * @param {'followup'|'rank'|'files'} kind
 */
export async function loadSheetRows(kind) {
  const demoFiles = {
    followup: 'followup.json',
    rank: 'rank.json',
    files: 'files.json',
  }
  const fileName = demoFiles[kind]
  if (!fileName) throw new Error(`未知 sheet kind: ${kind}`)

  // DRY_RUN=1 或缺少凭证/docid → demo；DRY_RUN=0 且凭证齐全 → 真表
  if (!hasWecomAuth() || !hasSheetCreds(kind) || config.dryRun) {
    const reason = config.dryRun
      ? 'DRY_RUN=1'
      : '缺少凭证或 docid/sheet_id'
    console.log(`[sheet] ${kind}: 使用 demo 数据（${reason}）`)
    return { source: 'demo', rows: loadDemoRows(fileName) }
  }

  const { docid, sheetId } = config.wecom.docs[kind]
  console.log(`[sheet] ${kind}: 读取企微智能表格 docid=${docid}`)
  const fields = await getFields(docid, sheetId)
  const records = await getRecords(docid, sheetId)
  const rows = recordsToRows(fields, records)
  return { source: 'wecom', rows }
}
