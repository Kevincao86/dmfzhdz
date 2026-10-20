/**
 * 报名快路径：只锁这一张招募单。
 * 新单已在 mp_recruitment_order，直接改这一行。
 * 还在整份注册表里的旧单，第一次报名时挪进这一行，并把它从注册表数组里拿掉。
 * 同一张单的并发报名按单号排队；不同的单互不等待。达人库补写另起事务，不挡报名返回。
 */
import pg from 'pg'
import type {
  RegistryFile,
  RegistryMpPrUser,
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
} from './opsRegistryTypes.js'
import { applyToMpRecruitmentOrderInSnapshot } from './mpRecruitmentApplyCore.js'
import {
  canonicalMpOrderRowJson,
  ensureMpRecruitmentOrderRowSchema,
} from './mpRecruitmentOrderRowStore.js'
import { upsertTalentLibraryFromApplicant } from './talentLibraryUpsert.js'

const { Pool } = pg

const PR_USERS_CACHE_MS = 8_000
const LIBRARY_FLUSH_MS = 400

export type FastApplyOutcome =
  | { handled: false }
  | { handled: true; status: number; body: Record<string, unknown> }

type ApplyInput = {
  mpOrderId: string
  applicant: RegistryMpRecruitmentApplicant
  workIdentity?: string | null
  claimSlotCount?: number | null
  preferredVisitDate?: string
}

type LibraryTouch = {
  platform: string
  applicant: RegistryMpRecruitmentApplicant
  mpOrderId: string
  merchantOrderNo: string
}

let pool: pg.Pool | null = null
let prUsersCache: { at: number; users: RegistryMpPrUser[] } | null = null
let prUsersInflight: Promise<RegistryMpPrUser[]> | null = null
const libraryPending: LibraryTouch[] = []
let libraryTimer: ReturnType<typeof setTimeout> | null = null
let libraryFlushing = false

function readConnectionString(): string | null {
  const direct = String(process.env.MEOO_DATABASE_URL || process.env.DATABASE_URL || '').trim()
  if (direct) return direct
  const password = String(process.env.POSTGRES_PASSWORD || '').trim()
  if (!password) return null
  return `postgres://postgres:${encodeURIComponent(password)}@127.0.0.1:5433/postgres?sslmode=disable`
}

function getPool(): pg.Pool | null {
  const cs = readConnectionString()
  if (!cs) return null
  if (!pool) {
    pool = new Pool({
      connectionString: cs,
      max: 12,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000,
    })
  }
  return pool
}

function parseOrder(raw: unknown): RegistryMpRecruitmentOrder | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = String((raw as { id?: string }).id || '').trim()
  if (!id) return null
  return raw as RegistryMpRecruitmentOrder
}

function sideQr(order: RegistryMpRecruitmentOrder, fromMap: string): string {
  const mapped = String(fromMap || '').trim()
  if (mapped) return mapped
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : null
  return String(order.groupQrImage || meta?.groupQrImage || '').trim()
}

function busy(message: string): FastApplyOutcome {
  return {
    handled: true,
    status: 503,
    body: { ok: false, error: 'apply_busy', message },
  }
}

function isBusyError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /timeout|too many clients|remaining connection slots|Connection terminated/i.test(msg)
}

async function loadPrUsers(db: pg.Pool): Promise<RegistryMpPrUser[]> {
  if (prUsersCache && Date.now() - prUsersCache.at < PR_USERS_CACHE_MS) return prUsersCache.users
  if (prUsersInflight) return prUsersInflight
  const task = (async () => {
    const result = await db.query<{ users: unknown }>(
      `SELECT COALESCE(registry->'mpPrUsers', '[]'::jsonb) AS users
       FROM ops_registry_snapshot WHERE id = 1`,
    )
    const raw = result.rows[0]?.users
    const users = Array.isArray(raw) ? (raw as RegistryMpPrUser[]) : []
    prUsersCache = { at: Date.now(), users }
    return users
  })()
  prUsersInflight = task
  try {
    return await task
  } finally {
    if (prUsersInflight === task) prUsersInflight = null
  }
}

function scheduleLibraryFlush(): void {
  if (libraryTimer) clearTimeout(libraryTimer)
  libraryTimer = setTimeout(() => {
    libraryTimer = null
    void flushTalentLibrary()
  }, LIBRARY_FLUSH_MS)
}

function enqueueTalentLibrary(touch: LibraryTouch): void {
  if (!String(touch.applicant.platformAccount || '').trim()) return
  libraryPending.push(touch)
  scheduleLibraryFlush()
}

async function flushTalentLibrary(): Promise<void> {
  if (libraryFlushing) return
  const batch = libraryPending.splice(0)
  if (!batch.length) return
  const db = getPool()
  if (!db) return
  libraryFlushing = true
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT id FROM ops_registry_snapshot WHERE id = 1 FOR UPDATE`)
    const cur = await client.query<{ lib: unknown; members: unknown }>(
      `SELECT registry->'talentLibraryEntries' AS lib,
              registry->'mpTalentMembers' AS members
       FROM ops_registry_snapshot WHERE id = 1`,
    )
    const data = {
      talentLibraryEntries: Array.isArray(cur.rows[0]?.lib) ? cur.rows[0].lib : [],
      mpTalentMembers: Array.isArray(cur.rows[0]?.members) ? cur.rows[0].members : [],
    } as RegistryFile
    const beforeLib = JSON.stringify(data.talentLibraryEntries)
    const beforeMembers = JSON.stringify(data.mpTalentMembers)
    for (const touch of batch) {
      upsertTalentLibraryFromApplicant(data, touch)
    }
    const libChanged = JSON.stringify(data.talentLibraryEntries) !== beforeLib
    const membersChanged = JSON.stringify(data.mpTalentMembers) !== beforeMembers
    if (libChanged) {
      await client.query(
        `UPDATE ops_registry_snapshot
         SET registry = jsonb_set(registry, '{talentLibraryEntries}', $1::jsonb, true)
         WHERE id = 1`,
        [JSON.stringify(data.talentLibraryEntries ?? [])],
      )
    }
    if (membersChanged) {
      await client.query(
        `UPDATE ops_registry_snapshot
         SET registry = jsonb_set(registry, '{mpTalentMembers}', $1::jsonb, true)
         WHERE id = 1`,
        [JSON.stringify(data.mpTalentMembers ?? [])],
      )
    }
    if (libChanged || membersChanged) {
      await client.query(`UPDATE ops_registry_snapshot SET updated_at = now() WHERE id = 1`)
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[mpRecruitmentApplyFast] talent library flush failed:', msg.slice(0, 240))
  } finally {
    client.release()
    libraryFlushing = false
    if (libraryPending.length) scheduleLibraryFlush()
  }
}

const EXTRACT_ORDER_SQL = `
SELECT o AS order,
       COALESCE(s.registry->'mpGroupQrByOrderId'->> $1, '') AS group_qr
FROM ops_registry_snapshot s,
     LATERAL jsonb_array_elements(COALESCE(s.registry->'mpRecruitmentOrders', '[]'::jsonb)) o
WHERE s.id = 1 AND o->>'id' = $1
LIMIT 1`

const REMOVE_ORDER_SQL = `
UPDATE ops_registry_snapshot
SET registry = jsonb_set(
      registry,
      '{mpRecruitmentOrders}',
      COALESCE(
        (
          SELECT jsonb_agg(t.o ORDER BY t.ordinality)
          FROM jsonb_array_elements(COALESCE(registry->'mpRecruitmentOrders', '[]'::jsonb))
            WITH ORDINALITY AS t(o, ordinality)
          WHERE t.o->>'id' IS DISTINCT FROM $1
        ),
        '[]'::jsonb
      ),
      true
    ),
    updated_at = now()
WHERE id = 1`

export async function tryApplyMpRecruitmentOrderFast(
  input: ApplyInput,
  attempt = 0,
): Promise<FastApplyOutcome> {
  const db = getPool()
  if (!db) return { handled: false }
  const mpOrderId = String(input.mpOrderId || '').trim()
  if (!mpOrderId) return { handled: false }

  let client: pg.PoolClient | null = null
  try {
    await ensureMpRecruitmentOrderRowSchema()
    const prUsers = await loadPrUsers(db)
    client = await db.connect()
    await client.query('BEGIN')
    await client.query(`SET LOCAL statement_timeout = '12s'`)
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [mpOrderId])

    const locked = await client.query<{
      body: unknown
      group_qr: string | null
      source_merchant_order_id: string | null
    }>(
      `SELECT body, group_qr, source_merchant_order_id
       FROM mp_recruitment_order WHERE id = $1 FOR UPDATE`,
      [mpOrderId],
    )

    let order = parseOrder(locked.rows[0]?.body)
    let groupQr = String(locked.rows[0]?.group_qr || '').trim()
    let sourceId = String(locked.rows[0]?.source_merchant_order_id || '').trim()
    let migrate = false

    if (!order) {
      const extracted = await client.query<{ order: unknown; group_qr: string | null }>(EXTRACT_ORDER_SQL, [
        mpOrderId,
      ])
      if (!extracted.rows[0]?.order) {
        await client.query('ROLLBACK')
        return { handled: true, status: 404, body: { ok: false, error: 'not_found' } }
      }
      await client.query(`SELECT id FROM ops_registry_snapshot WHERE id = 1 FOR UPDATE`)
      const again = await client.query<{
        body: unknown
        group_qr: string | null
        source_merchant_order_id: string | null
      }>(
        `SELECT body, group_qr, source_merchant_order_id
         FROM mp_recruitment_order WHERE id = $1 FOR UPDATE`,
        [mpOrderId],
      )
      order = parseOrder(again.rows[0]?.body)
      if (order) {
        groupQr = String(again.rows[0]?.group_qr || '').trim()
        sourceId = String(again.rows[0]?.source_merchant_order_id || '').trim()
      } else {
        const fresh = await client.query<{ order: unknown; group_qr: string | null }>(EXTRACT_ORDER_SQL, [
          mpOrderId,
        ])
        order = parseOrder(fresh.rows[0]?.order)
        if (!order) {
          await client.query('ROLLBACK')
          return { handled: true, status: 404, body: { ok: false, error: 'not_found' } }
        }
        groupQr = sideQr(order, String(fresh.rows[0]?.group_qr || ''))
        sourceId = String(order.sourceMerchantOrderId || '').trim()
        migrate = true
      }
    }

    if (migrate && !sourceId) {
      await client.query('ROLLBACK')
      return { handled: false }
    }

    const file = {
      mpRecruitmentOrders: [order],
      mpPrUsers: prUsers,
      talentLibraryEntries: [],
      mpTalentMembers: [],
    } as unknown as RegistryFile
    const result = applyToMpRecruitmentOrderInSnapshot(
      file,
      mpOrderId,
      input.applicant,
      input.workIdentity,
      input.claimSlotCount,
      { preferredVisitDate: input.preferredVisitDate },
    )
    if (!result.ok) {
      await client.query('ROLLBACK')
      return {
        handled: true,
        status: result.status,
        body: {
          ok: false,
          error: result.error,
          code: result.code,
          message: result.message,
        },
      }
    }

    const next =
      result.data.mpRecruitmentOrders?.find((row) => String(row.id || '').trim() === mpOrderId) || order
    const bodyJson = canonicalMpOrderRowJson(next)
    const status = String(next.status || '').trim()
    if (migrate) {
      await client.query(
        `INSERT INTO mp_recruitment_order (id, source_merchant_order_id, status, body, group_qr)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [mpOrderId, sourceId, status, bodyJson, groupQr],
      )
      const before = await client.query<{ n: number }>(
        `SELECT jsonb_array_length(COALESCE(registry->'mpRecruitmentOrders', '[]'::jsonb))::int AS n
         FROM ops_registry_snapshot WHERE id = 1`,
      )
      const matches = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n
         FROM ops_registry_snapshot s,
              jsonb_array_elements(COALESCE(s.registry->'mpRecruitmentOrders', '[]'::jsonb)) o
         WHERE s.id = 1 AND o->>'id' = $1`,
        [mpOrderId],
      )
      await client.query(REMOVE_ORDER_SQL, [mpOrderId])
      const after = await client.query<{ n: number }>(
        `SELECT jsonb_array_length(COALESCE(registry->'mpRecruitmentOrders', '[]'::jsonb))::int AS n
         FROM ops_registry_snapshot WHERE id = 1`,
      )
      const beforeN = Number(before.rows[0]?.n || 0)
      const matchN = Number(matches.rows[0]?.n || 0)
      const afterN = Number(after.rows[0]?.n || 0)
      if (matchN < 1 || afterN !== beforeN - matchN) {
        throw new Error('apply_snapshot_remove_mismatch')
      }
    } else {
      await client.query(
        `UPDATE mp_recruitment_order
         SET body = $2::jsonb, status = $3, updated_at = now()
         WHERE id = $1`,
        [mpOrderId, bodyJson, status],
      )
    }
    await client.query('COMMIT')
    enqueueTalentLibrary({
      platform: String(next.platform || '抖音'),
      applicant: input.applicant,
      mpOrderId,
      merchantOrderNo: String(next.sourceMerchantOrderId || sourceId || ''),
    })
    return { handled: true, status: 200, body: result.body }
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => undefined)
    if (isBusyError(error)) return busy('报名人数较多，请稍后再试')
    const code = (error as { code?: string }).code
    if (code === '23505' && attempt < 1) {
      return tryApplyMpRecruitmentOrderFast(input, attempt + 1)
    }
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[mpRecruitmentApplyFast] rejected:', msg.slice(0, 240))
    return busy('报名没有写上，请再试一次')
  } finally {
    client?.release()
  }
}
