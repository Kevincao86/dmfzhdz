/**
 * 商单日历提醒（ECS PostgREST REST，无 Realtime）
 */
import { PostgrestClient } from '@supabase/postgrest-js'

export type MpCalendarReminderDb = PostgrestClient

export type MpCalendarReminderStatus = 'pending' | 'sent' | 'cancelled' | 'failed'

export type MpCalendarReminderRow = {
  id: string
  owner_key: string
  owner_role: string
  wx_open_id: string | null
  mp_order_id: string
  event_id: string
  event_kind: string
  event_date_key: string
  event_title: string
  store_name: string
  lead_preset: string
  remind_at: string
  status: MpCalendarReminderStatus
  channels: string[] | null
  sent_at: string | null
  last_error: string | null
  created_at: string
}

export type MpCalendarReminderInsert = {
  ownerKey: string
  ownerRole: string
  wxOpenId?: string
  mpOrderId: string
  eventId: string
  eventKind: string
  eventDateKey: string
  eventTitle: string
  storeName?: string
  leadPreset: string
  remindAt: string
  channels?: string[]
}

/** 连 ECS PostgREST（/rest/v1） */
export function createMpCalendarReminderAdmin(url: string, serviceRole: string): MpCalendarReminderDb {
  const base = url.replace(/\/$/, '')
  return new PostgrestClient(`${base}/rest/v1`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  })
}

function rowFromInsert(input: MpCalendarReminderInsert): Record<string, unknown> {
  const channels = Array.isArray(input.channels)
    ? input.channels.map((c) => String(c || '').trim()).filter(Boolean)
    : ['subscribe']
  return {
    owner_key: input.ownerKey,
    owner_role: input.ownerRole,
    wx_open_id: String(input.wxOpenId || '').trim() || null,
    mp_order_id: input.mpOrderId,
    event_id: input.eventId,
    event_kind: input.eventKind,
    event_date_key: input.eventDateKey,
    event_title: String(input.eventTitle || '').trim(),
    store_name: String(input.storeName || '').trim(),
    lead_preset: input.leadPreset,
    remind_at: input.remindAt,
    status: 'pending',
    channels,
    sent_at: null,
    last_error: null,
  }
}

export async function insertCalendarReminder(
  sb: MpCalendarReminderDb,
  input: MpCalendarReminderInsert,
): Promise<MpCalendarReminderRow> {
  const { data, error } = await sb
    .from('mp_calendar_reminders')
    .upsert(rowFromInsert(input), { onConflict: 'owner_key,event_id,lead_preset' })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as MpCalendarReminderRow
}

export async function listCalendarRemindersByOwner(
  sb: MpCalendarReminderDb,
  ownerKey: string,
  opts?: { status?: MpCalendarReminderStatus | MpCalendarReminderStatus[] },
): Promise<MpCalendarReminderRow[]> {
  const key = String(ownerKey || '').trim()
  if (!key) return []
  let q = sb
    .from('mp_calendar_reminders')
    .select('*')
    .eq('owner_key', key)
    .order('remind_at', { ascending: true })
  const st = opts?.status
  if (Array.isArray(st) && st.length) {
    q = q.in('status', st)
  } else if (typeof st === 'string' && st) {
    q = q.eq('status', st)
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as MpCalendarReminderRow[]
}

export async function cancelCalendarReminder(
  sb: MpCalendarReminderDb,
  ownerKey: string,
  reminderId: string,
): Promise<boolean> {
  const id = String(reminderId || '').trim()
  const key = String(ownerKey || '').trim()
  if (!id || !key) return false
  const { data, error } = await sb
    .from('mp_calendar_reminders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('owner_key', key)
    .eq('status', 'pending')
    .select('id')
  if (error) throw new Error(error.message)
  return Array.isArray(data) && data.length > 0
}

export async function listDueCalendarReminders(
  sb: MpCalendarReminderDb,
  limit = 50,
): Promise<MpCalendarReminderRow[]> {
  const now = new Date().toISOString()
  const { data, error } = await sb
    .from('mp_calendar_reminders')
    .select('*')
    .eq('status', 'pending')
    .lte('remind_at', now)
    .order('remind_at', { ascending: true })
    .limit(Math.max(1, Math.min(200, limit)))
  if (error) throw new Error(error.message)
  return (data ?? []) as MpCalendarReminderRow[]
}

export async function markCalendarReminderSent(sb: MpCalendarReminderDb, id: string): Promise<void> {
  const rid = String(id || '').trim()
  if (!rid) return
  const { error } = await sb
    .from('mp_calendar_reminders')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', rid)
  if (error) throw new Error(error.message)
}

export async function markCalendarReminderFailed(
  sb: MpCalendarReminderDb,
  id: string,
  lastError: string,
): Promise<void> {
  const rid = String(id || '').trim()
  if (!rid) return
  const { error } = await sb
    .from('mp_calendar_reminders')
    .update({
      status: 'failed',
      last_error: String(lastError || 'send_failed').slice(0, 500),
    })
    .eq('id', rid)
  if (error) throw new Error(error.message)
}
