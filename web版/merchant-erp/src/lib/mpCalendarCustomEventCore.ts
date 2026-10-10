import { ownerFromMpAccount, type MpCalendarReminderAuth } from './mpCalendarReminderCore.js'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../../vite-plugins/merchantSupabaseAdminEnv.js'
import {
  createMpCalendarCustomEventAdmin,
  deleteCalendarCustomEvent,
  insertCalendarCustomEvent,
  listCalendarCustomEventsByOwner,
  updateCalendarCustomEvent,
  type MpCalendarCustomEventRow,
} from './mpCalendarCustomEventSupabase.js'

export { ownerFromMpAccount }
export type MpCalendarCustomEventAuth = MpCalendarReminderAuth

export type MpCalendarCustomEventBody = {
  action?: string
  id?: string
  title?: string
  eventDateKey?: string
  timeLabel?: string
  note?: string
}

const MAX_TITLE = 40
const MAX_NOTE = 200
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function eventErrorResponse(e: unknown): { status: number; data: Record<string, unknown> } {
  const msg = e instanceof Error ? e.message : String(e)
  const hint = /Could not find|PGRST205|schema cache|does not exist|42P01/i.test(msg)
    ? '轻量执行迁移 20260929120000_mp_calendar_custom_events.sql'
    : /fetch failed|ECONNREFUSED|8888/i.test(msg)
      ? 'ECS PostgREST 未响应：sudo systemctl restart meoo-postgrest'
      : undefined
  return {
    status: 500,
    data: {
      ok: false,
      error: 'calendar_custom_event_db_error',
      detail: msg.slice(0, 800),
      ...(hint ? { hint } : {}),
    },
  }
}

function normalizeTitle(raw: unknown): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_TITLE)
}

function normalizeNote(raw: unknown): string {
  return String(raw || '')
    .trim()
    .slice(0, MAX_NOTE)
}

function normalizeTimeLabel(raw: unknown): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  return TIME_RE.test(s) ? s : ''
}

function normalizeDateKey(raw: unknown): string {
  const s = String(raw || '').trim()
  const m = s.match(DATE_RE)
  if (!m) return ''
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return ''
  return `${m[1]}-${m[2]}-${m[3]}`
}

function rowToClient(row: MpCalendarCustomEventRow): Record<string, unknown> {
  return {
    id: row.id,
    ownerKey: row.owner_key,
    ownerRole: row.owner_role,
    title: row.title,
    eventDateKey: row.event_date_key,
    timeLabel: row.time_label,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function handleMpCalendarCustomEventBody(
  body: MpCalendarCustomEventBody,
  auth: MpCalendarCustomEventAuth,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    return {
      status: 503,
      data: {
        ok: false,
        error: 'supabase_admin_not_configured',
        missing: missingParts,
        hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
      },
    }
  }

  const action = String(body.action || 'list').trim()
  const sb = createMpCalendarCustomEventAdmin(supabaseUrl, serviceRole)

  try {
    if (action === 'list') {
      const rows = await listCalendarCustomEventsByOwner(sb, auth.ownerKey)
      return { status: 200, data: { ok: true, events: rows.map(rowToClient) } }
    }

    if (action === 'delete') {
      const id = String(body.id || '').trim()
      if (!UUID_RE.test(id)) return { status: 400, data: { ok: false, error: 'invalid_event_id' } }
      const deleted = await deleteCalendarCustomEvent(sb, auth.ownerKey, id)
      return { status: 200, data: { ok: true, deleted } }
    }

    if (action === 'create' || action === 'update') {
      const title = normalizeTitle(body.title)
      const eventDateKey = normalizeDateKey(body.eventDateKey)
      if (!title) return { status: 400, data: { ok: false, error: 'missing_title' } }
      if (!eventDateKey) return { status: 400, data: { ok: false, error: 'invalid_event_date' } }
      const timeRaw = String(body.timeLabel || '').trim()
      if (timeRaw && !TIME_RE.test(timeRaw)) {
        return { status: 400, data: { ok: false, error: 'invalid_time_label' } }
      }
      const write = {
        ownerKey: auth.ownerKey,
        ownerRole: auth.ownerRole,
        title,
        eventDateKey,
        timeLabel: normalizeTimeLabel(timeRaw),
        note: normalizeNote(body.note),
      }
      if (action === 'create') {
        const row = await insertCalendarCustomEvent(sb, write)
        return { status: 200, data: { ok: true, event: rowToClient(row) } }
      }
      const id = String(body.id || '').trim()
      if (!UUID_RE.test(id)) return { status: 400, data: { ok: false, error: 'invalid_event_id' } }
      const row = await updateCalendarCustomEvent(sb, auth.ownerKey, id, write)
      if (!row) return { status: 404, data: { ok: false, error: 'event_not_found' } }
      return { status: 200, data: { ok: true, event: rowToClient(row) } }
    }

    return { status: 400, data: { ok: false, error: 'invalid_action' } }
  } catch (e) {
    return eventErrorResponse(e)
  }
}
