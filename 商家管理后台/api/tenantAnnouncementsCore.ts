/** 运营公告推送：PostgREST fetch（与 meoo-supabase-tenants-list 一致，避免 Vercel 上 supabase-js 崩溃） */

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

function serviceRoleHeaders(serviceKey: string, prefer?: string): Record<string, string> {
  const h: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (prefer) h.Prefer = prefer
  return h
}

function isMissingTableError(msg: string): boolean {
  return /tenant_announcements|tenant_announcement_deliveries|does not exist|Could not find|schema cache/i.test(
    msg,
  )
}

async function fetchTenantIds(supabaseUrl: string, serviceKey: string): Promise<
  | { ok: true; ids: string[] }
  | { ok: false; error: string; detail?: string }
> {
  const base = supabaseUrl.replace(/\/$/, '')
  const url = `${base}/rest/v1/tenants?select=id&order=created_at.desc`
  const r = await fetch(url, { headers: serviceRoleHeaders(serviceKey) })
  const text = await r.text()
  if (!r.ok) {
    return { ok: false, error: 'tenants_list_failed', detail: text.slice(0, 400) }
  }
  try {
    const rows = JSON.parse(text || '[]') as { id?: string }[]
    const ids = rows.map((x) => String(x.id ?? '')).filter(Boolean)
    return { ok: true, ids }
  } catch {
    return { ok: false, error: 'tenants_list_failed', detail: text.slice(0, 400) }
  }
}

export async function sendTenantAnnouncement(
  supabaseUrl: string,
  serviceKey: string,
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
    const tr = await fetchTenantIds(supabaseUrl, serviceKey)
    if (!tr.ok) return tr
    tenantIds = tr.ids
    if (tenantIds.length === 0) return { ok: false, error: 'no_tenants' }
  }

  const base = supabaseUrl.replace(/\/$/, '')
  const insUrl = `${base}/rest/v1/tenant_announcements`
  const insRes = await fetch(insUrl, {
    method: 'POST',
    headers: serviceRoleHeaders(serviceKey, 'return=representation'),
    body: JSON.stringify({
      category: input.category,
      title,
      body,
      target_all: input.targetAll,
      recipient_count: tenantIds.length,
      created_by: input.createdBy ?? null,
    }),
  })
  const insText = await insRes.text()
  if (!insRes.ok) {
    if (isMissingTableError(insText)) {
      return { ok: false, error: 'migration_required', detail: insText.slice(0, 400) }
    }
    return { ok: false, error: 'announcement_insert_failed', detail: insText.slice(0, 400) }
  }

  let announcementId = ''
  try {
    const parsed = JSON.parse(insText || '[]') as { id?: string }[] | { id?: string }
    const row = Array.isArray(parsed) ? parsed[0] : parsed
    announcementId = String(row?.id ?? '')
  } catch {
    return { ok: false, error: 'announcement_insert_failed', detail: insText.slice(0, 400) }
  }
  if (!announcementId) {
    return { ok: false, error: 'announcement_insert_failed', detail: 'no id returned' }
  }

  const deliveries = tenantIds.map((tenant_id) => ({
    announcement_id: announcementId,
    tenant_id,
  }))

  const delUrl = `${base}/rest/v1/tenant_announcement_deliveries`
  const batchSize = 200
  for (let i = 0; i < deliveries.length; i += batchSize) {
    const chunk = deliveries.slice(i, i + batchSize)
    const dr = await fetch(delUrl, {
      method: 'POST',
      headers: serviceRoleHeaders(serviceKey),
      body: JSON.stringify(chunk),
    })
    const dtext = await dr.text()
    if (!dr.ok) {
      if (isMissingTableError(dtext)) {
        return { ok: false, error: 'migration_required', detail: dtext.slice(0, 400) }
      }
      return { ok: false, error: 'delivery_insert_failed', detail: dtext.slice(0, 400) }
    }
  }

  return { ok: true, announcementId, recipientCount: tenantIds.length }
}

export async function listTenantAnnouncementsForOps(
  supabaseUrl: string,
  serviceKey: string,
  limit = 50,
): Promise<{ ok: true; rows: OpsAnnouncementListRow[] } | { ok: false; error: string; detail?: string }> {
  const base = supabaseUrl.replace(/\/$/, '')
  const url = `${base}/rest/v1/tenant_announcements?select=id,category,title,body,target_all,recipient_count,created_at,created_by&order=created_at.desc&limit=${limit}`
  const r = await fetch(url, { headers: serviceRoleHeaders(serviceKey) })
  const text = await r.text()
  if (!r.ok) {
    if (isMissingTableError(text)) {
      return { ok: false, error: 'migration_required', detail: text.slice(0, 400) }
    }
    return { ok: false, error: 'list_failed', detail: text.slice(0, 400) }
  }
  try {
    const data = JSON.parse(text || '[]') as Record<string, unknown>[]
    const rows = data.map((row) => ({
      id: String(row.id ?? ''),
      category: (parseAnnouncementCategory(row.category) ?? 'platform_change') as TenantAnnouncementCategory,
      title: String(row.title ?? ''),
      body: String(row.body ?? ''),
      target_all: Boolean(row.target_all),
      recipient_count: Number(row.recipient_count) || 0,
      created_at: String(row.created_at ?? ''),
      created_by: typeof row.created_by === 'string' ? row.created_by : null,
    }))
    return { ok: true, rows }
  } catch {
    return { ok: false, error: 'list_failed', detail: text.slice(0, 400) }
  }
}
