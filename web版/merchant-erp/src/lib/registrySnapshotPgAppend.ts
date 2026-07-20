/**
 * 小程序招募单 append：直连 Postgres jsonb prepend，避免整表 PATCH 触发 PGRST102。
 * ECS auth-api 使用 127.0.0.1:5433 + POSTGRES_PASSWORD / MEOO_DATABASE_URL。
 */
import pg from 'pg'
import type { RegistryMpRecruitmentOrder, RegistrySnapshot } from './opsRegistryTypes.js'
import {
  MAX_GROUP_QR_PERSIST_LEN,
  normalizeMpRecruitmentOrderForRegistryPersist,
  sanitizeValueForPostgresJson,
  stripOrderInlineImagesForPersist,
} from './mpRecruitmentRegistryPersist.js'

const { Client } = pg

export function readRegistryPgConnectionString(): string | null {
  const direct = String(process.env.MEOO_DATABASE_URL || process.env.DATABASE_URL || '').trim()
  if (direct) return direct
  const password = String(process.env.POSTGRES_PASSWORD || '').trim()
  if (!password) return null
  return `postgres://postgres:${encodeURIComponent(password)}@127.0.0.1:5433/postgres?sslmode=disable`
}

function readGroupQrFromOrder(order: RegistryMpRecruitmentOrder): string {
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : null
  return String(order.groupQrImage || meta?.groupQrImage || '').trim()
}

/** 写入 DB 的单条订单：群码仅存 side map，订单体不含大段 base64 */
export function prepareMpOrderForPgAppend(order: RegistryMpRecruitmentOrder): {
  order: RegistryMpRecruitmentOrder
  groupQrByOrderId: Record<string, string>
} {
  const normalized = normalizeMpRecruitmentOrderForRegistryPersist({ ...order })
  const id = String(normalized.id || '').trim()
  const qr = readGroupQrFromOrder(normalized)
  const groupQrByOrderId: Record<string, string> = {}
  if (qr && id) {
    if (qr.length > MAX_GROUP_QR_PERSIST_LEN) {
      throw new Error('group_qr_too_large')
    }
    groupQrByOrderId[id] = qr
  }
  const next: RegistryMpRecruitmentOrder = stripOrderInlineImagesForPersist(normalized)
  if (next.groupQrImage) delete next.groupQrImage
  const metaRaw = next.mpPublishMeta
  if (metaRaw && typeof metaRaw === 'object') {
    const meta = { ...(metaRaw as Record<string, unknown>) }
    delete meta.groupQrImage
    next.mpPublishMeta = Object.keys(meta).length ? meta : undefined
  }
  const sanitizedOrder = sanitizeValueForPostgresJson(next) as RegistryMpRecruitmentOrder
  const sanitizedQrMap: Record<string, string> = {}
  for (const [orderId, qrVal] of Object.entries(groupQrByOrderId)) {
    sanitizedQrMap[orderId] = String(sanitizeValueForPostgresJson(qrVal) || '').trim()
  }
  return { order: sanitizedOrder, groupQrByOrderId: sanitizedQrMap }
}

export async function appendMpRecruitmentOrderViaPg(
  order: RegistryMpRecruitmentOrder,
): Promise<
  { ok: true; groupQrSaved: boolean } | { ok: false; error: string; status: number; existingId?: string }
> {
  const cs = readRegistryPgConnectionString()
  if (!cs) return { ok: false, error: 'pg_not_configured', status: 503 }

  const sid = String(order.sourceMerchantOrderId || '').trim()
  if (!sid || !order.id) return { ok: false, error: 'invalid_mp_order', status: 400 }

  let prepared: ReturnType<typeof prepareMpOrderForPgAppend>
  try {
    prepared = prepareMpOrderForPgAppend(order)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'group_qr_too_large') {
      return { ok: false, error: 'group_qr_too_large', status: 400 }
    }
    throw e
  }

  const client = new Client({ connectionString: cs })
  await client.connect()
  try {
    const dup = await client.query<{ existing_id: string | null }>(
      `SELECT o->>'id' AS existing_id
       FROM ops_registry_snapshot s,
            LATERAL jsonb_array_elements(COALESCE(s.registry->'mpRecruitmentOrders', '[]'::jsonb)) o
       WHERE s.id = 1 AND o->>'sourceMerchantOrderId' = $1
       LIMIT 1`,
      [sid],
    )
    const existingId = String(dup.rows[0]?.existing_id || '').trim()
    if (existingId) {
      return { ok: false, error: 'duplicate_merchant_order', status: 409, existingId }
    }

    await client.query('BEGIN')

    await client.query(
      `UPDATE ops_registry_snapshot
       SET registry = jsonb_set(
         COALESCE(registry, '{}'::jsonb),
         '{mpRecruitmentOrders}',
         jsonb_build_array($1::jsonb) || COALESCE(registry->'mpRecruitmentOrders', '[]'::jsonb),
         true
       ),
       updated_at = now()
       WHERE id = 1`,
      [JSON.stringify(prepared.order)],
    )

    await client.query(
      `UPDATE ops_registry_snapshot
       SET registry = jsonb_set(
         registry,
         '{mpRecruitmentOrders}',
         COALESCE(
           (
             SELECT jsonb_agg(elem ORDER BY ord DESC)
             FROM (
               SELECT elem, ord
               FROM jsonb_array_elements(registry->'mpRecruitmentOrders') WITH ORDINALITY t(elem, ord)
               ORDER BY ord
               LIMIT 200
             ) sub
           ),
           '[]'::jsonb
         ),
         true
       ),
       updated_at = now()
       WHERE id = 1`,
    )

    for (const [orderId, qr] of Object.entries(prepared.groupQrByOrderId)) {
      await client.query(
        `UPDATE ops_registry_snapshot
         SET registry = jsonb_set(
           COALESCE(registry, '{}'::jsonb),
           '{mpGroupQrByOrderId}',
           COALESCE(registry->'mpGroupQrByOrderId', '{}'::jsonb) || jsonb_build_object($1::text, $2::text),
           true
         ),
         updated_at = now()
         WHERE id = 1`,
        [orderId, qr],
      )
    }

    await client.query('COMMIT')

    const groupQrSaved = Object.keys(prepared.groupQrByOrderId).length > 0
    if (groupQrSaved) {
      const verify = await client.query<{ qr: string | null }>(
        `SELECT registry->'mpGroupQrByOrderId'->>$1 AS qr
         FROM ops_registry_snapshot WHERE id = 1`,
        [String(prepared.order.id || '').trim()],
      )
      if (!String(verify.rows[0]?.qr || '').trim()) {
        throw new Error('group_qr_not_persisted')
      }
    }

    return { ok: true, groupQrSaved }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    await client.end()
  }
}

/** 仅补写/更新群码 side map（PR 补传群二维码；避免整表 PATCH） */
export async function patchMpGroupQrViaPg(
  mpOrderId: string,
  groupQrImage: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const cs = readRegistryPgConnectionString()
  if (!cs) return { ok: false, error: 'pg_not_configured', status: 503 }

  const id = String(mpOrderId || '').trim()
  const qr = String(sanitizeValueForPostgresJson(groupQrImage) || '').trim()
  if (!id) return { ok: false, error: 'invalid_mp_order', status: 400 }
  if (qr.length > MAX_GROUP_QR_PERSIST_LEN) {
    return { ok: false, error: 'group_qr_too_large', status: 400 }
  }

  const client = new Client({ connectionString: cs })
  await client.connect()
  try {
    const found = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM ops_registry_snapshot s,
              LATERAL jsonb_array_elements(COALESCE(s.registry->'mpRecruitmentOrders', '[]'::jsonb)) o
         WHERE s.id = 1 AND o->>'id' = $1
       ) AS exists`,
      [id],
    )
    if (!found.rows[0]?.exists) {
      return { ok: false, error: 'not_found', status: 404 }
    }

    if (!qr) {
      await client.query(
        `UPDATE ops_registry_snapshot
         SET registry = COALESCE(registry, '{}'::jsonb) #- ARRAY['mpGroupQrByOrderId', $1::text],
             updated_at = now()
         WHERE id = 1`,
        [id],
      )
      return { ok: true }
    }

    await client.query(
      `UPDATE ops_registry_snapshot
       SET registry = jsonb_set(
         COALESCE(registry, '{}'::jsonb),
         '{mpGroupQrByOrderId}',
         COALESCE(registry->'mpGroupQrByOrderId', '{}'::jsonb) || jsonb_build_object($1::text, $2::text),
         true
       ),
       updated_at = now()
       WHERE id = 1`,
      [id, qr],
    )
    return { ok: true }
  } finally {
    await client.end()
  }
}

/** 通知/保存前：把 PG side map 合并进内存快照（normalize 历史遗漏或 PG 直写后尚未 reload 时兜底） */
export async function hydrateMpGroupQrSideMapInSnapshot(
  data: RegistrySnapshot,
  orderIds: string[],
): Promise<void> {
  const snap = data as RegistrySnapshot & { mpGroupQrByOrderId?: Record<string, string> }
  if (!snap.mpGroupQrByOrderId || typeof snap.mpGroupQrByOrderId !== 'object') {
    snap.mpGroupQrByOrderId = {}
  }
  for (const raw of orderIds) {
    const id = String(raw || '').trim()
    if (!id || String(snap.mpGroupQrByOrderId[id] || '').trim()) continue
    const pg = await readMpGroupQrSideMapViaPg(id)
    if (pg.ok) snap.mpGroupQrByOrderId[id] = pg.groupQrImage
  }
}

/** PR/普通发单：PG 直读 side map 群码（通知/校验绕开 PostgREST 缓存与大厅切片） */
export async function readMpGroupQrSideMapViaPg(
  mpOrderId: string,
): Promise<{ ok: true; groupQrImage: string } | { ok: false; error: string; status: number }> {
  const cs = readRegistryPgConnectionString()
  if (!cs) return { ok: false, error: 'pg_not_configured', status: 503 }

  const id = String(mpOrderId || '').trim()
  if (!id) return { ok: false, error: 'invalid_mp_order', status: 400 }

  const client = new Client({ connectionString: cs })
  await client.connect()
  try {
    const row = await client.query<{ qr: string | null }>(
      `SELECT COALESCE(s.registry->'mpGroupQrByOrderId'->>$1, '') AS qr
       FROM ops_registry_snapshot s
       WHERE s.id = 1
       LIMIT 1`,
      [id],
    )
    const qr = String(row.rows[0]?.qr || '').trim()
    if (!qr) return { ok: false, error: 'group_qr_missing', status: 404 }
    return { ok: true, groupQrImage: qr }
  } finally {
    await client.end()
  }
}

/**
 * 商单详情快路径：PG 只返回指定 id 的订单 + 对应群码 + mpPrUsers，
 * 避免 PostgREST 整列拉 mpRecruitmentOrders（1MB+）导致详情进页超时。
 */
export async function readMpRecruitmentOrdersByIdsViaPg(
  mpOrderIds: string[],
): Promise<
  | {
      ok: true
      orders: RegistryMpRecruitmentOrder[]
      mpPrUsers: unknown[]
      groupQrByOrderId: Record<string, string>
    }
  | { ok: false; error: string }
> {
  const cs = readRegistryPgConnectionString()
  if (!cs) return { ok: false, error: 'pg_not_configured' }

  const ids = [...new Set(mpOrderIds.map((id) => String(id || '').trim()).filter(Boolean))].slice(
    0,
    120,
  )
  if (!ids.length) {
    return { ok: true, orders: [], mpPrUsers: [], groupQrByOrderId: {} }
  }

  const client = new Client({ connectionString: cs })
  await client.connect()
  try {
    const row = await client.query<{
      orders: unknown
      mp_pr_users: unknown
      group_qr: unknown
    }>(
      `SELECT
         COALESCE(
           (
             SELECT jsonb_agg(o ORDER BY ord.ordinality)
             FROM jsonb_array_elements(COALESCE(s.registry->'mpRecruitmentOrders', '[]'::jsonb))
               WITH ORDINALITY AS ord(o, ordinality)
             WHERE o->>'id' = ANY($1::text[])
           ),
           '[]'::jsonb
         ) AS orders,
         COALESCE(s.registry->'mpPrUsers', '[]'::jsonb) AS mp_pr_users,
         COALESCE(
           (
             SELECT jsonb_object_agg(e.key, e.value)
             FROM jsonb_each(COALESCE(s.registry->'mpGroupQrByOrderId', '{}'::jsonb)) e
             WHERE e.key = ANY($1::text[])
           ),
           '{}'::jsonb
         ) AS group_qr
       FROM ops_registry_snapshot s
       WHERE s.id = 1
       LIMIT 1`,
      [ids],
    )
    const hit = row.rows[0]
    if (!hit) return { ok: false, error: 'snapshot_missing' }

    const ordersRaw = hit.orders
    const orders = Array.isArray(ordersRaw)
      ? (ordersRaw as RegistryMpRecruitmentOrder[])
      : typeof ordersRaw === 'string'
        ? (() => {
            try {
              const parsed = JSON.parse(ordersRaw) as unknown
              return Array.isArray(parsed) ? (parsed as RegistryMpRecruitmentOrder[]) : []
            } catch {
              return []
            }
          })()
        : []

    const prRaw = hit.mp_pr_users
    const mpPrUsers = Array.isArray(prRaw)
      ? prRaw
      : typeof prRaw === 'string'
        ? (() => {
            try {
              const parsed = JSON.parse(prRaw) as unknown
              return Array.isArray(parsed) ? parsed : []
            } catch {
              return []
            }
          })()
        : []

    const qrRaw = hit.group_qr
    let groupQrByOrderId: Record<string, string> = {}
    if (qrRaw && typeof qrRaw === 'object' && !Array.isArray(qrRaw)) {
      for (const [k, v] of Object.entries(qrRaw as Record<string, unknown>)) {
        const key = String(k || '').trim()
        const val = String(v || '').trim()
        if (key && val) groupQrByOrderId[key] = val
      }
    } else if (typeof qrRaw === 'string' && qrRaw.trim()) {
      try {
        const parsed = JSON.parse(qrRaw) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            const key = String(k || '').trim()
            const val = String(v || '').trim()
            if (key && val) groupQrByOrderId[key] = val
          }
        }
      } catch {
        groupQrByOrderId = {}
      }
    }

    return { ok: true, orders, mpPrUsers, groupQrByOrderId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg.slice(0, 240) }
  } finally {
    await client.end()
  }
}

/** 达人扫码进群：PG 直读 side map（绕过大厅切片/缓存，仅 group_qr 转发单） */
export async function readMpFormRelayGroupQrViaPg(
  mpOrderId: string,
): Promise<
  | { ok: true; mpOrderId: string; title: string; groupQrImage: string }
  | { ok: false; error: string; status: number }
> {
  const cs = readRegistryPgConnectionString()
  if (!cs) return { ok: false, error: 'pg_not_configured', status: 503 }

  const id = String(mpOrderId || '').trim()
  if (!id) return { ok: false, error: 'invalid_mp_order', status: 400 }

  const client = new Client({ connectionString: cs })
  await client.connect()
  try {
    const row = await client.query<{
      title: string | null
      relay_mode: string | null
      source_platform: string | null
      qr: string | null
    }>(
      `SELECT
         o->>'title' AS title,
         o->'mpPublishMeta'->'externalFormRelay'->>'relayMode' AS relay_mode,
         o->'mpPublishMeta'->'externalFormRelay'->>'sourcePlatform' AS source_platform,
         COALESCE(s.registry->'mpGroupQrByOrderId'->>$1, '') AS qr
       FROM ops_registry_snapshot s,
            LATERAL jsonb_array_elements(COALESCE(s.registry->'mpRecruitmentOrders', '[]'::jsonb)) o
       WHERE s.id = 1 AND o->>'id' = $1
       LIMIT 1`,
      [id],
    )
    const hit = row.rows[0]
    if (!hit) return { ok: false, error: 'not_found', status: 404 }

    const relayMode = String(hit.relay_mode || '').trim()
    const sourcePlatform = String(hit.source_platform || '').trim()
    const isGroupQr = relayMode === 'group_qr' || sourcePlatform === 'group_qr'
    if (!isGroupQr) return { ok: false, error: 'not_group_qr_relay', status: 404 }

    const qr = String(hit.qr || '').trim()
    if (!qr) return { ok: false, error: 'group_qr_missing', status: 404 }

    return {
      ok: true,
      mpOrderId: id,
      title: String(hit.title || '').trim(),
      groupQrImage: qr,
    }
  } finally {
    await client.end()
  }
}

/** 是否转发代收·二维码加群单（PR 普通发单群码返回 false） */
export async function isMpOrderFormRelayGroupQrRelayViaPg(
  mpOrderId: string,
): Promise<boolean | null> {
  const cs = readRegistryPgConnectionString()
  if (!cs) return null

  const id = String(mpOrderId || '').trim()
  if (!id) return null

  const client = new Client({ connectionString: cs })
  await client.connect()
  try {
    const row = await client.query<{ relay_mode: string | null; source_platform: string | null }>(
      `SELECT
         o->'mpPublishMeta'->'externalFormRelay'->>'relayMode' AS relay_mode,
         o->'mpPublishMeta'->'externalFormRelay'->>'sourcePlatform' AS source_platform
       FROM ops_registry_snapshot s,
            LATERAL jsonb_array_elements(COALESCE(s.registry->'mpRecruitmentOrders', '[]'::jsonb)) o
       WHERE s.id = 1 AND o->>'id' = $1
       LIMIT 1`,
      [id],
    )
    const hit = row.rows[0]
    if (!hit) return null
    const relayMode = String(hit.relay_mode || '').trim()
    const sourcePlatform = String(hit.source_platform || '').trim()
    return relayMode === 'group_qr' || sourcePlatform === 'group_qr'
  } finally {
    await client.end()
  }
}
