/**
 * 商单日历自定义登记事件（ECS PostgREST REST）
 */
import { PostgrestClient } from '@supabase/postgrest-js'

export type MpCalendarCustomEventDb = PostgrestClient

export type MpCalendarCustomEventRow = {
  id: string
  owner_key: string
  owner_role: string
  title: string
  event_date_key: string
  time_label: string
  note: string
  created_at: string
  updated_at: string
}

export type MpCalendarCustomEventWrite = {
  ownerKey: string
  ownerRole: string
  title: string
  eventDateKey: string
  timeLabel: string
  note: string
}

export function createMpCalendarCustomEventAdmin(url: string, serviceRole: string): MpCalendarCustomEventDb {
  const base = url.replace(/\/$/, '')
  return new PostgrestClient(`${base}/rest/v1`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  })
}

function rowFromWrite(input: MpCalendarCustomEventWrite): Record<string, unknown> {
  return {
    owner_key: input.ownerKey,
    owner_role: input.ownerRole,
    title: input.title,
    event_date_key: input.eventDateKey,
    time_label: input.timeLabel,
    note: input.note,
    updated_at: new Date().toISOString(),
  }
}

export async function listCalendarCustomEventsByOwner(
  sb: MpCalendarCustomEventDb,
  ownerKey: string,
): Promise<MpCalendarCustomEventRow[]> {
  const key = String(ownerKey || '').trim()
  if (!key) return []
  const { data, error } = await sb
    .from('mp_calendar_custom_events')
    .select('*')
    .eq('owner_key', key)
    .order('event_date_key', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as MpCalendarCustomEventRow[]
}

export async function insertCalendarCustomEvent(
  sb: MpCalendarCustomEventDb,
  input: MpCalendarCustomEventWrite,
): Promise<MpCalendarCustomEventRow> {
  const { data, error } = await sb
    .from('mp_calendar_custom_events')
    .insert(rowFromWrite(input))
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as MpCalendarCustomEventRow
}

export async function updateCalendarCustomEvent(
  sb: MpCalendarCustomEventDb,
  ownerKey: string,
  id: string,
  input: MpCalendarCustomEventWrite,
): Promise<MpCalendarCustomEventRow | null> {
  const key = String(ownerKey || '').trim()
  const eventId = String(id || '').trim()
  if (!key || !eventId) return null
  const { data, error } = await sb
    .from('mp_calendar_custom_events')
    .update(rowFromWrite(input))
    .eq('owner_key', key)
    .eq('id', eventId)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as MpCalendarCustomEventRow | null) ?? null
}

export async function deleteCalendarCustomEvent(
  sb: MpCalendarCustomEventDb,
  ownerKey: string,
  id: string,
): Promise<boolean> {
  const key = String(ownerKey || '').trim()
  const eventId = String(id || '').trim()
  if (!key || !eventId) return false
  const { data, error } = await sb
    .from('mp_calendar_custom_events')
    .delete()
    .eq('owner_key', key)
    .eq('id', eventId)
    .select('id')
  if (error) throw new Error(error.message)
  return Array.isArray(data) && data.length > 0
}
