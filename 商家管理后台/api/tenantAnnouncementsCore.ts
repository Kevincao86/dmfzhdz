/** 运营公告推送：创建公告 + 批量投递 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type TenantAnnouncementCategory = 'subscription_expiring' | 'platform_change'

export const ANNOUNCEMENT_CATEGORY_ZH: Record<TenantAnnouncementCategory, string> = {
  subscription_expiring: '套餐即将结束预警',
  platform_change: '平台改动预警',
}

export function parseAnnouncementCategory(raw: unknown): TenantAnnouncementCategory | null {
  if (raw === 'subscription_expiring' || raw === 'platform_change') return raw
  return null
}

export type SendTenantAnnouncementInput = {
  category: TenantAnnouncementCategory
  title: string
  body: string
  targetAll: boolean
  tenantIds: string[]
  createdBy?: string | null
}

export type SendTenantAnnouncementResult =
  | { ok: true; announcementId: string; recipientCount: number }
  | { ok: false; error: string; detail?: string }

function isMissingTableError(msg: string): boolean {
  return /tenant_announcements|tenant_announcement_deliveries|does not exist|Could not find|schema cache/i.test(
    msg,
  )
}

export async function sendTenantAnnouncement(
  admin: SupabaseClient,
  input: SendTenantAnnouncementInput,
): Promise<SendTenantAnnouncementResult> {
  const title = String(input.title ?? '').trim()
  const body = String(input.body ?? '').trim()
  if (!title) return { ok: false, error: 'title_required' }
  if (!body) return { ok: false, error: 'body_required' }

  let tenantIds = input.targetAll
    ? []
    : [...new Set(input.tenantIds.map((id) => String(id).trim()).filter(Boolean))]

  if (!input.targetAll && tenantIds.length === 0) {
    return { ok: false, error: 'tenant_ids_required' }
  }

  if (input.targetAll) {
    const tr = await admin.from('tenants').select('id').order('created_at', { ascending: false })
    if (tr.error) {
      if (isMissingTableError(tr.error.message)) {
        return { ok: false, error: 'migration_required', detail: tr.error.message }
      }
      return { ok: false, error: 'tenants_list_failed', detail: tr.error.message }
    }
    tenantIds = (tr.data ?? [])
      .map((r) => (typeof r.id === 'string' ? r.id : ''))
      .filter(Boolean)
    if (tenantIds.length === 0) return { ok: false, error: 'no_tenants' }
  }

  const ins = await admin
    .from('tenant_announcements')
    .insert({
      category: input.category,
      title,
      body,
      target_all: input.targetAll,
      recipient_count: tenantIds.length,
      created_by: input.createdBy ?? null,
    })
    .select('id')
    .single()

  if (ins.error || !ins.data?.id) {
    if (ins.error && isMissingTableError(ins.error.message)) {
      return { ok: false, error: 'migration_required', detail: ins.error.message }
    }
    return { ok: false, error: 'announcement_insert_failed', detail: ins.error?.message }
  }

  const announcementId = String(ins.data.id)
  const deliveries = tenantIds.map((tenant_id) => ({
    announcement_id: announcementId,
    tenant_id,
  }))

  const batchSize = 200
  for (let i = 0; i < deliveries.length; i += batchSize) {
    const chunk = deliveries.slice(i, i + batchSize)
    const dr = await admin.from('tenant_announcement_deliveries').insert(chunk)
    if (dr.error) {
      return { ok: false, error: 'delivery_insert_failed', detail: dr.error.message }
    }
  }

  return { ok: true, announcementId, recipientCount: tenantIds.length }
}

export type OpsAnnouncementListRow = {
  id: string
  category: TenantAnnouncementCategory
  title: string
  body: string
  target_all: boolean
  recipient_count: number
  created_at: string
  created_by: string | null
}

export async function listTenantAnnouncementsForOps(
  admin: SupabaseClient,
  limit = 50,
): Promise<{ ok: true; rows: OpsAnnouncementListRow[] } | { ok: false; error: string; detail?: string }> {
  const res = await admin
    .from('tenant_announcements')
    .select('id, category, title, body, target_all, recipient_count, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (res.error) {
    if (isMissingTableError(res.error.message)) {
      return { ok: false, error: 'migration_required', detail: res.error.message }
    }
    return { ok: false, error: 'list_failed', detail: res.error.message }
  }

  const rows = (res.data ?? []).map((r) => ({
    id: String(r.id ?? ''),
    category: (parseAnnouncementCategory(r.category) ?? 'platform_change') as TenantAnnouncementCategory,
    title: String(r.title ?? ''),
    body: String(r.body ?? ''),
    target_all: Boolean(r.target_all),
    recipient_count: Number(r.recipient_count) || 0,
    created_at: String(r.created_at ?? ''),
    created_by: typeof r.created_by === 'string' ? r.created_by : null,
  }))

  return { ok: true, rows }
}
