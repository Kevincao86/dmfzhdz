/**
 * 新发招募单：一行一单。插入只锁自己的行，不改 ops_registry_snapshot。
 * 已在注册表 JSON 里的旧单不搬、不改；读取时把两边拼在一起。
 */
import pg from 'pg'
import type { RegistryFile, RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import {
  normalizeMpRecruitmentOrderForRegistryPersist,
  sanitizeValueForPostgresJson,
  stripOrderInlineImagesForPersist,
} from './mpRecruitmentRegistryPersist.js'

const { Client } = pg

type RowBaseline = {
  jsonById: Map<string, string>
  qrById: Map<string, string>
}

const rowBaselineByFile = new WeakMap<RegistryFile, RowBaseline>()
let schemaReady: Promise<void> | null = null

function readConnectionString(): string | null {
  const direct = String(process.env.MEOO_DATABASE_URL || process.env.DATABASE_URL || '').trim()
  if (direct) return direct
  const password = String(process.env.POSTGRES_PASSWORD || '').trim()
  if (!password) return null
  return `postgres://postgres:${encodeURIComponent(password)}@127.0.0.1:5433/postgres?sslmode=disable`
}

function orderIdOf(row: unknown): string {
  if (!row || typeof row !== 'object') return ''
  return String((row as { id?: string }).id || '').trim()
}

function readQr(order: RegistryMpRecruitmentOrder | undefined, map?: Record<string, string>): string {
  if (!order) return ''
  const id = String(order.id || '').trim()
  const fromMap = id && map ? String(map[id] || '').trim() : ''
  if (fromMap) return fromMap
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : null
  return String(order.groupQrImage || meta?.groupQrImage || '').trim()
}

export function canonicalMpOrderRowJson(order: RegistryMpRecruitmentOrder): string {
  const normalized = normalizeMpRecruitmentOrderForRegistryPersist(order)
  const stripped = stripOrderInlineImagesForPersist(normalized)
  if (stripped.groupQrImage) delete stripped.groupQrImage
  const metaRaw = stripped.mpPublishMeta
  if (metaRaw && typeof metaRaw === 'object') {
    const meta = { ...(metaRaw as Record<string, unknown>) }
    delete meta.groupQrImage
    stripped.mpPublishMeta = Object.keys(meta).length ? meta : undefined
  }
  return JSON.stringify(sanitizeValueForPostgresJson(stripped))
}

function parseOrderBody(raw: unknown): RegistryMpRecruitmentOrder | null {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = orderIdOf(value)
  if (!id) return null
  return value as RegistryMpRecruitmentOrder
}

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const cs = readConnectionString()
  if (!cs) throw new Error('pg_not_configured')
  const client = new Client({ connectionString: cs })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export async function ensureMpRecruitmentOrderRowSchema(): Promise<void> {
  if (!readConnectionString()) return
  if (!schemaReady) {
    schemaReady = withClient(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS mp_recruitment_order (
          id text PRIMARY KEY,
          source_merchant_order_id text NOT NULL,
          status text NOT NULL DEFAULT '',
          inserted_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          body jsonb NOT NULL,
          group_qr text NOT NULL DEFAULT ''
        )
      `)
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS mp_recruitment_order_source_uid
          ON mp_recruitment_order (source_merchant_order_id)
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS mp_recruitment_order_inserted_idx
          ON mp_recruitment_order (inserted_at DESC)
      `)
    }).catch((error) => {
      schemaReady = null
      throw error
    })
  }
  await schemaReady
}

type ListedRow = { order: RegistryMpRecruitmentOrder; groupQr: string }

async function listRows(ids?: string[]): Promise<ListedRow[]> {
  if (!readConnectionString()) return []
  await ensureMpRecruitmentOrderRowSchema()
  return withClient(async (client) => {
    const result = ids
      ? await client.query<{ body: unknown; group_qr: string | null }>(
          `SELECT body, group_qr FROM mp_recruitment_order WHERE id = ANY($1::text[])`,
          [ids],
        )
      : await client.query<{ body: unknown; group_qr: string | null }>(
          `SELECT body, group_qr FROM mp_recruitment_order ORDER BY inserted_at DESC`,
        )
    const out: ListedRow[] = []
    for (const row of result.rows) {
      const order = parseOrderBody(row.body)
      if (!order) continue
      out.push({ order, groupQr: String(row.group_qr || '').trim() })
    }
    return out
  })
}

async function listRowIds(): Promise<Set<string>> {
  if (!readConnectionString()) return new Set()
  await ensureMpRecruitmentOrderRowSchema()
  return withClient(async (client) => {
    const result = await client.query<{ id: string }>(`SELECT id FROM mp_recruitment_order`)
    return new Set(result.rows.map((row) => String(row.id || '').trim()).filter(Boolean))
  })
}

export function mergeSnapshotOrdersWithRows(
  snapshotOrders: RegistryMpRecruitmentOrder[],
  rowOrders: RegistryMpRecruitmentOrder[],
): RegistryMpRecruitmentOrder[] {
  const seen = new Set(snapshotOrders.map((order) => orderIdOf(order)).filter(Boolean))
  const extra = rowOrders.filter((order) => {
    const id = orderIdOf(order)
    return id && !seen.has(id)
  })
  return extra.length ? [...extra, ...snapshotOrders] : snapshotOrders
}

function rememberBaseline(file: RegistryFile, rows: ListedRow[], snapshotIds: Set<string>): void {
  const jsonById = new Map<string, string>()
  const qrById = new Map<string, string>()
  for (const row of rows) {
    const id = orderIdOf(row.order)
    if (!id || snapshotIds.has(id)) continue
    jsonById.set(id, canonicalMpOrderRowJson(row.order))
    qrById.set(id, row.groupQr)
  }
  rowBaselineByFile.set(file, { jsonById, qrById })
}

function applyRowsOntoFile(file: RegistryFile, rows: ListedRow[]): void {
  const snapshotOrders = Array.isArray(file.mpRecruitmentOrders) ? file.mpRecruitmentOrders : []
  const snapshotIds = new Set(snapshotOrders.map((order) => orderIdOf(order)).filter(Boolean))
  file.mpRecruitmentOrders = mergeSnapshotOrdersWithRows(
    snapshotOrders,
    rows.map((row) => row.order),
  )
  if (!file.mpGroupQrByOrderId || typeof file.mpGroupQrByOrderId !== 'object') {
    file.mpGroupQrByOrderId = {}
  }
  for (const row of rows) {
    const id = orderIdOf(row.order)
    if (!id || !row.groupQr || snapshotIds.has(id)) continue
    if (!String(file.mpGroupQrByOrderId[id] || '').trim()) {
      file.mpGroupQrByOrderId[id] = row.groupQr
    }
  }
  rememberBaseline(file, rows, snapshotIds)
}

/** 读注册表时把新表里的单拼进内存。不写回旧 JSON。 */
export async function attachRowOrdersForRead(file: RegistryFile): Promise<void> {
  try {
    const rows = await listRows()
    if (!rows.length) {
      rowBaselineByFile.set(file, { jsonById: new Map(), qrById: new Map() })
      return
    }
    applyRowsOntoFile(file, rows)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn('[mpRecruitmentOrderRow] attach skipped:', msg.slice(0, 180))
  }
}

/** 大厅等只读切片：拼上新表的单和群码，不记录保存基线。 */
export async function overlayRowOrdersOnPartial(partial: Partial<RegistryFile>): Promise<void> {
  try {
    const rows = await listRows()
    if (!rows.length) return
    const snapshotOrders = Array.isArray(partial.mpRecruitmentOrders) ? partial.mpRecruitmentOrders : []
    const snapshotIds = new Set(snapshotOrders.map((order) => orderIdOf(order)).filter(Boolean))
    partial.mpRecruitmentOrders = mergeSnapshotOrdersWithRows(
      snapshotOrders,
      rows.map((row) => row.order),
    )
    const map =
      partial.mpGroupQrByOrderId && typeof partial.mpGroupQrByOrderId === 'object'
        ? { ...partial.mpGroupQrByOrderId }
        : {}
    for (const row of rows) {
      const id = orderIdOf(row.order)
      if (!id || !row.groupQr || snapshotIds.has(id)) continue
      if (!String(map[id] || '').trim()) map[id] = row.groupQr
    }
    if (Object.keys(map).length) partial.mpGroupQrByOrderId = map
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn('[mpRecruitmentOrderRow] overlay skipped:', msg.slice(0, 180))
  }
}

export async function insertMpRecruitmentOrderRow(input: {
  order: RegistryMpRecruitmentOrder
  groupQr: string
}): Promise<{ ok: true } | { ok: false; error: 'duplicate_merchant_order'; existingId: string; status: number }> {
  const order = sanitizeValueForPostgresJson(input.order) as RegistryMpRecruitmentOrder
  const id = String(order.id || '').trim()
  const sourceId = String(order.sourceMerchantOrderId || '').trim()
  if (!id || !sourceId) throw new Error('invalid_mp_order')
  await ensureMpRecruitmentOrderRowSchema()
  const body = canonicalMpOrderRowJson(order)
  const status = String(order.status || '').trim()
  const groupQr = String(sanitizeValueForPostgresJson(input.groupQr) || '').trim()
  try {
    const inserted = await withClient((client) =>
      client.query<{ id: string }>(
        `INSERT INTO mp_recruitment_order (id, source_merchant_order_id, status, body, group_qr)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (source_merchant_order_id) DO NOTHING
         RETURNING id`,
        [id, sourceId, status, body, groupQr],
      ),
    )
    if (inserted.rows[0]?.id) return { ok: true }
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code !== '23505') throw error
  }
  const existing = await withClient((client) =>
    client.query<{ id: string }>(
      `SELECT id FROM mp_recruitment_order WHERE source_merchant_order_id = $1 OR id = $2 LIMIT 1`,
      [sourceId, id],
    ),
  )
  const existingId = String(existing.rows[0]?.id || '').trim()
  if (existingId && existingId === id) return { ok: true }
  return {
    ok: false,
    error: 'duplicate_merchant_order',
    existingId,
    status: 409,
  }
}

export async function readMpRecruitmentOrderRowGroupQr(id: string): Promise<string> {
  const key = String(id || '').trim()
  if (!key || !readConnectionString()) return ''
  await ensureMpRecruitmentOrderRowSchema()
  const result = await withClient((client) =>
    client.query<{ group_qr: string | null }>(
      `SELECT group_qr FROM mp_recruitment_order WHERE id = $1 LIMIT 1`,
      [key],
    ),
  )
  return String(result.rows[0]?.group_qr || '').trim()
}

export async function readMpRecruitmentOrderRow(
  id: string,
): Promise<{ order: RegistryMpRecruitmentOrder; groupQr: string } | null> {
  const key = String(id || '').trim()
  if (!key) return null
  const rows = await listRows([key])
  return rows[0] || null
}

export async function readMpRecruitmentOrdersByIdsFromRows(ids: string[]): Promise<{
  orders: RegistryMpRecruitmentOrder[]
  groupQrByOrderId: Record<string, string>
}> {
  const keys = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))]
  if (!keys.length) return { orders: [], groupQrByOrderId: {} }
  const rows = await listRows(keys)
  const groupQrByOrderId: Record<string, string> = {}
  for (const row of rows) {
    const id = orderIdOf(row.order)
    if (id && row.groupQr) groupQrByOrderId[id] = row.groupQr
  }
  return { orders: rows.map((row) => row.order), groupQrByOrderId }
}

function formRelayFlags(order: RegistryMpRecruitmentOrder): {
  isGroupQr: boolean
  title: string
} {
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : {}
  const relay =
    meta.externalFormRelay && typeof meta.externalFormRelay === 'object'
      ? (meta.externalFormRelay as Record<string, unknown>)
      : {}
  const relayMode = String(relay.relayMode || '').trim()
  const sourcePlatform = String(relay.sourcePlatform || '').trim()
  return {
    isGroupQr: relayMode === 'group_qr' || sourcePlatform === 'group_qr',
    title: String(order.title || '').trim(),
  }
}

export async function readMpFormRelayGroupQrFromRow(id: string): Promise<
  | { found: false }
  | { found: true; isGroupQr: boolean; title: string; groupQr: string }
> {
  const row = await readMpRecruitmentOrderRow(id)
  if (!row) return { found: false }
  const flags = formRelayFlags(row.order)
  return { found: true, isGroupQr: flags.isGroupQr, title: flags.title, groupQr: row.groupQr }
}

export async function isMpOrderFormRelayGroupQrFromRow(id: string): Promise<boolean | null> {
  const row = await readMpRecruitmentOrderRow(id)
  if (!row) return null
  return formRelayFlags(row.order).isGroupQr
}

/** 群码只改这一行。订单不在新表时返回 false，调用方继续走旧注册表。 */
export async function patchMpRecruitmentOrderRowGroupQr(id: string, groupQr: string): Promise<boolean> {
  const key = String(id || '').trim()
  if (!key || !readConnectionString()) return false
  await ensureMpRecruitmentOrderRowSchema()
  const updated = await withClient((client) =>
    client.query(
      `UPDATE mp_recruitment_order
       SET group_qr = $2, updated_at = now()
       WHERE id = $1`,
      [key, String(groupQr || '').trim()],
    ),
  )
  return (updated.rowCount ?? 0) > 0
}

async function updateRowBody(id: string, order: RegistryMpRecruitmentOrder, groupQr: string | null): Promise<void> {
  const body = canonicalMpOrderRowJson(order)
  const status = String(order.status || '').trim()
  await withClient((client) =>
    groupQr === null
      ? client.query(
          `UPDATE mp_recruitment_order
           SET body = $2::jsonb, status = $3, updated_at = now()
           WHERE id = $1`,
          [id, body, status],
        )
      : client.query(
          `UPDATE mp_recruitment_order
           SET body = $2::jsonb, status = $3, group_qr = $4, updated_at = now()
           WHERE id = $1`,
          [id, body, status, groupQr],
        ),
  )
}

/**
 * 整表保存前：新表里的单写回各自的行，并从即将写入旧 JSON 的名单里拿掉。
 * 旧注册表里的单保持调用方原来的保存内容，不把新单抄进去。
 */
export async function peelRowOrdersBeforeSnapshotSave(
  data: RegistryFile,
  persist: RegistryFile,
): Promise<void> {
  const baseline = rowBaselineByFile.get(data) ?? null
  let tableIds: Set<string>
  try {
    tableIds = await listRowIds()
  } catch (error) {
    if (!baseline?.jsonById.size) return
    throw error
  }
  if (!tableIds.size && !baseline?.jsonById.size) return

  const live = Array.isArray(data.mpRecruitmentOrders) ? data.mpRecruitmentOrders : []
  const liveById = new Map<string, RegistryMpRecruitmentOrder>()
  for (const order of live) {
    const id = orderIdOf(order)
    if (id) liveById.set(id, order)
  }

  const tracked = new Set<string>([...tableIds, ...(baseline ? baseline.jsonById.keys() : [])])
  const toDelete: string[] = []
  for (const id of baseline?.jsonById.keys() ?? []) {
    const current = liveById.get(id)
    if (!current) {
      toDelete.push(id)
      continue
    }
    if (!tableIds.has(id)) continue
    const nextJson = canonicalMpOrderRowJson(current)
    const prevJson = baseline?.jsonById.get(id)
    const nextQr = readQr(current, data.mpGroupQrByOrderId)
    const prevQr = baseline?.qrById.get(id) ?? ''
    const bodyChanged = prevJson !== nextJson
    const qrChanged = nextQr !== prevQr
    if (!bodyChanged && !qrChanged) continue
    await updateRowBody(id, current, qrChanged ? nextQr : null)
  }
  if (toDelete.length) {
    await withClient((client) =>
      client.query(`DELETE FROM mp_recruitment_order WHERE id = ANY($1::text[])`, [toDelete]),
    )
  }

  const incoming = Array.isArray(persist.mpRecruitmentOrders) ? persist.mpRecruitmentOrders : []
  persist.mpRecruitmentOrders = incoming.filter((order) => {
    const id = orderIdOf(order)
    return !id || !tracked.has(id)
  })
  if (persist.mpGroupQrByOrderId && typeof persist.mpGroupQrByOrderId === 'object') {
    for (const id of tracked) delete persist.mpGroupQrByOrderId[id]
  }
}
