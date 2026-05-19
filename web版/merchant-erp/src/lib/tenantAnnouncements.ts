import type { SupabaseClient } from '@supabase/supabase-js'

export type TenantAnnouncementCategory = 'subscription_expiring' | 'platform_change'

export const ANNOUNCEMENT_CATEGORY_ZH: Record<TenantAnnouncementCategory, string> = {
  subscription_expiring: '套餐即将结束',
  platform_change: '平台改动',
}

export type TenantAnnouncementInboxItem = {
  deliveryId: string
  announcementId: string
  category: TenantAnnouncementCategory
  title: string
  body: string
  readAt: string | null
  deliveredAt: string
  announcedAt: string
}

function parseCategory(raw: unknown): TenantAnnouncementCategory {
  if (raw === 'subscription_expiring' || raw === 'platform_change') return raw
  return 'platform_change'
}

function isMissingAnnouncementTables(msg: string): boolean {
  return /tenant_announcements|tenant_announcement_deliveries|does not exist|Could not find|schema cache/i.test(
    msg,
  )
}

/** 当前租户公告收件箱（未迁移时返回空列表） */
export async function fetchTenantAnnouncementInbox(
  supabase: SupabaseClient,
  tenantId: string,
  limit = 40,
): Promise<{ ok: true; items: TenantAnnouncementInboxItem[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('tenant_announcement_deliveries')
    .select(
      `
      id,
      read_at,
      created_at,
      announcement_id,
      tenant_announcements (
        id,
        category,
        title,
        body,
        created_at
      )
    `,
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (isMissingAnnouncementTables(error.message)) {
      return { ok: true, items: [] }
    }
    return { ok: false, error: error.message }
  }

  const items: TenantAnnouncementInboxItem[] = []
  for (const row of data ?? []) {
    const ann = row.tenant_announcements as
      | {
          id?: string
          category?: unknown
          title?: string
          body?: string
          created_at?: string
        }
      | {
          id?: string
          category?: unknown
          title?: string
          body?: string
          created_at?: string
        }[]
      | null

    const a = Array.isArray(ann) ? ann[0] : ann
    if (!a?.id) continue

    items.push({
      deliveryId: String(row.id),
      announcementId: String(a.id),
      category: parseCategory(a.category),
      title: String(a.title ?? ''),
      body: String(a.body ?? ''),
      readAt: typeof row.read_at === 'string' ? row.read_at : null,
      deliveredAt: String(row.created_at ?? ''),
      announcedAt: String(a.created_at ?? row.created_at ?? ''),
    })
  }

  return { ok: true, items }
}

export async function markTenantAnnouncementRead(
  supabase: SupabaseClient,
  deliveryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('tenant_announcement_deliveries')
    .update({ read_at: new Date().toISOString() })
    .eq('id', deliveryId)
    .is('read_at', null)

  if (error) {
    if (isMissingAnnouncementTables(error.message)) return { ok: true }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function markAllTenantAnnouncementsRead(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('tenant_announcement_deliveries')
    .update({ read_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .is('read_at', null)

  if (error) {
    if (isMissingAnnouncementTables(error.message)) return { ok: true }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
