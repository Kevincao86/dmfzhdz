import type { MpAccountRow } from './mpAccountAuth.js'
import {
  cancelCalendarReminder,
  createMpCalendarReminderAdmin,
  insertCalendarReminder,
  listCalendarRemindersByOwner,
  listDueCalendarReminders,
  markCalendarReminderFailed,
  markCalendarReminderSent,
  type MpCalendarReminderRow,
} from './mpCalendarReminderSupabase.js'
import { notifyCalendarReminderSubscribe } from './mpSubscribeMessageSend.js'
import { sendWechatOaCalendarReminderTemplate } from './mpWechatOfficialAccountSend.js'
import { oaOpenIdForTalentMember } from './mpWechatOaBindingCore.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../../vite-plugins/merchantSupabaseAdminEnv.js'

export type MpCalendarReminderLeadPreset = 'day8' | 'day_before_20' | 'days2_before'

export type MpCalendarReminderBody = {
  action?: string
  eventId?: string
  eventKind?: string
  eventDateKey?: string
  eventTitle?: string
  storeName?: string
  mpOrderId?: string
  leadPreset?: string
  channels?: string[]
  reminderId?: string
}

export type MpCalendarReminderAuth = {
  ownerKey: string
  ownerRole: 'pr' | 'talent'
  wxOpenId: string
}

const LEAD_PRESETS = new Set<MpCalendarReminderLeadPreset>(['day8', 'day_before_20', 'days2_before'])

function reminderErrorResponse(e: unknown): { status: number; data: Record<string, unknown> } {
  const msg = e instanceof Error ? e.message : String(e)
  const hint = /Could not find|PGRST205|schema cache|does not exist|42P01/i.test(msg)
    ? '轻量执行迁移 20260709120000_mp_calendar_reminders.sql'
    : /fetch failed|ECONNREFUSED|8888/i.test(msg)
      ? 'ECS PostgREST 未响应：sudo systemctl restart meoo-postgrest'
      : undefined
  return {
    status: 500,
    data: {
      ok: false,
      error: 'calendar_reminder_db_error',
      detail: msg.slice(0, 800),
      ...(hint ? { hint } : {}),
    },
  }
}

export function ownerFromMpAccount(account: MpAccountRow): MpCalendarReminderAuth | null {
  const role = account.active_role === 'pr' ? 'pr' : 'talent'
  if (role === 'pr') {
    const ownerKey = String(account.registry_pr_id || account.lingqi_pr_id || '').trim()
    if (!ownerKey) return null
    return {
      ownerKey,
      ownerRole: 'pr',
      wxOpenId: String(account.openid || '').trim(),
    }
  }
  const ownerKey = String(account.registry_member_id || account.lingqi_talent_id || '').trim()
  if (!ownerKey) return null
  return {
    ownerKey,
    ownerRole: 'talent',
    wxOpenId: String(account.openid || '').trim(),
  }
}

/** 根据事件日与提前预设计算 remind_at（本地日历日 08:00 / 前一日 20:00 / 前两日 08:00） */
export function computeRemindAtIso(eventDateKey: string, leadPreset: MpCalendarReminderLeadPreset): string {
  const m = String(eventDateKey || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) throw new Error('invalid_event_date_key')
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  let dt: Date
  if (leadPreset === 'day8') {
    dt = new Date(y, mo, d, 8, 0, 0, 0)
  } else if (leadPreset === 'day_before_20') {
    dt = new Date(y, mo, d - 1, 20, 0, 0, 0)
  } else if (leadPreset === 'days2_before') {
    dt = new Date(y, mo, d - 2, 20, 0, 0, 0)
  } else {
    throw new Error('invalid_lead_preset')
  }
  if (!Number.isFinite(dt.getTime())) throw new Error('invalid_remind_at')
  return dt.toISOString()
}

function normalizeChannels(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map((c) => String(c || '').trim()).filter(Boolean) : []
  const out = new Set<string>()
  for (const c of list) {
    if (c === 'subscribe' || c === 'oa' || c === 'both') out.add(c === 'both' ? 'subscribe' : c)
    if (c === 'both') out.add('oa')
  }
  if (!out.size) out.add('subscribe')
  return [...out]
}

function rowToClient(row: MpCalendarReminderRow): Record<string, unknown> {
  return {
    id: row.id,
    ownerKey: row.owner_key,
    ownerRole: row.owner_role,
    mpOrderId: row.mp_order_id,
    eventId: row.event_id,
    eventKind: row.event_kind,
    eventDateKey: row.event_date_key,
    eventTitle: row.event_title,
    storeName: row.store_name,
    leadPreset: row.lead_preset,
    remindAt: row.remind_at,
    status: row.status,
    channels: Array.isArray(row.channels) ? row.channels : [],
    sentAt: row.sent_at,
    lastError: row.last_error,
    createdAt: row.created_at,
  }
}

function parseChannels(row: MpCalendarReminderRow): string[] {
  const raw = row.channels
  if (Array.isArray(raw)) return raw.map(String)
  return ['subscribe']
}

async function sendOneDueReminder(
  row: MpCalendarReminderRow,
  resolveOaOpenId: (ownerKey: string, ownerRole: string) => string,
): Promise<{ sent: boolean; error?: string }> {
  const channels = parseChannels(row)
  const wantSubscribe = channels.includes('subscribe')
  const wantOa = channels.includes('oa')
  const payload = {
    eventTitle: row.event_title,
    storeName: row.store_name,
    eventDateKey: row.event_date_key,
    eventKind: row.event_kind,
    mpOrderId: row.mp_order_id,
  }
  const errors: string[] = []
  let sent = false

  if (wantOa) {
    const oaOpenId = resolveOaOpenId(row.owner_key, row.owner_role)
    if (oaOpenId) {
      try {
        await sendWechatOaCalendarReminderTemplate({ oaOpenId, ...payload })
        sent = true
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
  }

  if (wantSubscribe) {
    const wxOpenId = String(row.wx_open_id || '').trim()
    if (wxOpenId) {
      try {
        await notifyCalendarReminderSubscribe({ openId: wxOpenId, ...payload })
        sent = true
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    } else if (!sent) {
      errors.push('no_wx_open_id')
    }
  }

  if (sent) return { sent: true }
  return { sent: false, error: errors.join('; ') || 'no_channel' }
}

export async function handleMpCalendarReminderBody(
  body: MpCalendarReminderBody,
  auth: MpCalendarReminderAuth,
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
  const sb = createMpCalendarReminderAdmin(supabaseUrl, serviceRole)

  try {
    if (action === 'list') {
      const rows = await listCalendarRemindersByOwner(sb, auth.ownerKey, {
        status: ['pending', 'sent'],
      })
      return { status: 200, data: { ok: true, reminders: rows.map(rowToClient) } }
    }

    if (action === 'cancel') {
      const reminderId = String(body.reminderId || '').trim()
      if (!reminderId) {
        return { status: 400, data: { ok: false, error: 'missing_reminder_id' } }
      }
      const cancelled = await cancelCalendarReminder(sb, auth.ownerKey, reminderId)
      if (!cancelled) {
        return { status: 404, data: { ok: false, error: 'reminder_not_found_or_not_pending' } }
      }
      return { status: 200, data: { ok: true, cancelled: true } }
    }

    if (action === 'create') {
      const eventId = String(body.eventId || '').trim()
      const eventKind = String(body.eventKind || '').trim()
      const eventDateKey = String(body.eventDateKey || '').trim()
      const eventTitle = String(body.eventTitle || '').trim()
      const mpOrderId = String(body.mpOrderId || '').trim()
      const leadPresetRaw = String(body.leadPreset || '').trim() as MpCalendarReminderLeadPreset
      if (!eventId || !eventKind || !eventDateKey || !eventTitle || !mpOrderId) {
        return { status: 400, data: { ok: false, error: 'missing_event_fields' } }
      }
      if (!LEAD_PRESETS.has(leadPresetRaw)) {
        return { status: 400, data: { ok: false, error: 'invalid_lead_preset' } }
      }
      const remindAt = computeRemindAtIso(eventDateKey, leadPresetRaw)
      if (new Date(remindAt).getTime() <= Date.now()) {
        return { status: 400, data: { ok: false, error: 'remind_at_in_past' } }
      }
      const row = await insertCalendarReminder(sb, {
        ownerKey: auth.ownerKey,
        ownerRole: auth.ownerRole,
        wxOpenId: auth.wxOpenId,
        mpOrderId,
        eventId,
        eventKind,
        eventDateKey,
        eventTitle,
        storeName: String(body.storeName || '').trim(),
        leadPreset: leadPresetRaw,
        remindAt,
        channels: normalizeChannels(body.channels),
      })
      return { status: 200, data: { ok: true, reminder: rowToClient(row) } }
    }

    return { status: 400, data: { ok: false, error: 'invalid_action' } }
  } catch (e) {
    return reminderErrorResponse(e)
  }
}

/** auth-api 定时扫描：到点推送订阅消息 + 服务号模板 */
export async function processDueCalendarReminders(): Promise<{
  processed: number
  sent: number
  failed: number
}> {
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) return { processed: 0, sent: 0, failed: 0 }

  const sb = createMpCalendarReminderAdmin(supabaseUrl, serviceRole)
  let due: MpCalendarReminderRow[]
  try {
    due = await listDueCalendarReminders(sb)
  } catch (e) {
    console.warn('[calendar-reminder] list due failed', e instanceof Error ? e.message : e)
    return { processed: 0, sent: 0, failed: 0 }
  }
  if (!due.length) return { processed: 0, sent: 0, failed: 0 }

  let registry: Awaited<ReturnType<ReturnType<typeof createRegistrySnapshotIoFetch>['load']>> | null = null
  const resolveOaOpenId = (ownerKey: string, ownerRole: string): string => {
    if (ownerRole !== 'talent' || !registry) return ''
    return oaOpenIdForTalentMember(registry, ownerKey)
  }

  const needsOa = due.some((r) => parseChannels(r).includes('oa'))
  if (needsOa) {
    try {
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      registry = await io.load()
    } catch (e) {
      console.warn('[calendar-reminder] registry load for oa failed', e instanceof Error ? e.message : e)
    }
  }

  let sent = 0
  let failed = 0
  for (const row of due) {
    try {
      const result = await sendOneDueReminder(row, resolveOaOpenId)
      if (result.sent) {
        await markCalendarReminderSent(sb, row.id)
        sent += 1
      } else {
        await markCalendarReminderFailed(sb, row.id, result.error || 'send_failed')
        failed += 1
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      try {
        await markCalendarReminderFailed(sb, row.id, msg)
      } catch {
        /* ignore mark failure */
      }
      failed += 1
      console.warn('[calendar-reminder] send failed', row.id, msg.slice(0, 200))
    }
  }

  return { processed: due.length, sent, failed }
}
