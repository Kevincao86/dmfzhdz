/**
 * 商单自定义标签（ECS PostgREST REST）
 */
import { PostgrestClient } from '@supabase/postgrest-js'

export type MpOrderCustomLabelDb = PostgrestClient

export type MpOrderCustomLabelRow = {
  id: string
  owner_key: string
  owner_role: string
  mp_order_id: string
  label_text: string
  color: string
  created_at: string
  updated_at: string
}

export type MpOrderCustomLabelUpsert = {
  ownerKey: string
  ownerRole: string
  mpOrderId: string
  labelText: string
  color: string
}

export function createMpOrderCustomLabelAdmin(url: string, serviceRole: string): MpOrderCustomLabelDb {
  const base = url.replace(/\/$/, '')
  return new PostgrestClient(`${base}/rest/v1`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  })
}

function rowFromUpsert(input: MpOrderCustomLabelUpsert): Record<string, unknown> {
  const now = new Date().toISOString()
  return {
    owner_key: input.ownerKey,
    owner_role: input.ownerRole,
    mp_order_id: input.mpOrderId,
    label_text: input.labelText,
    color: input.color,
    updated_at: now,
  }
}

export async function upsertOrderCustomLabel(
  sb: MpOrderCustomLabelDb,
  input: MpOrderCustomLabelUpsert,
): Promise<MpOrderCustomLabelRow> {
  const { data, error } = await sb
    .from('mp_order_custom_labels')
    .upsert(rowFromUpsert(input), { onConflict: 'owner_key,mp_order_id' })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as MpOrderCustomLabelRow
}

export async function listOrderCustomLabelsByOwner(
  sb: MpOrderCustomLabelDb,
  ownerKey: string,
): Promise<MpOrderCustomLabelRow[]> {
  const key = String(ownerKey || '').trim()
  if (!key) return []
  const { data, error } = await sb
    .from('mp_order_custom_labels')
    .select('*')
    .eq('owner_key', key)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as MpOrderCustomLabelRow[]
}

export async function deleteOrderCustomLabel(
  sb: MpOrderCustomLabelDb,
  ownerKey: string,
  mpOrderId: string,
): Promise<boolean> {
  const key = String(ownerKey || '').trim()
  const orderId = String(mpOrderId || '').trim()
  if (!key || !orderId) return false
  const { data, error } = await sb
    .from('mp_order_custom_labels')
    .delete()
    .eq('owner_key', key)
    .eq('mp_order_id', orderId)
    .select('id')
  if (error) throw new Error(error.message)
  return Array.isArray(data) && data.length > 0
}
