import type { TenantAnnouncementCategory } from '../../api/tenantAnnouncementsCore'

export type OpsAnnouncementRow = {
  id: string
  category: TenantAnnouncementCategory
  title: string
  body: string
  target_all: boolean
  recipient_count: number
  created_at: string
  created_by: string | null
}

export async function fetchOpsAnnouncements(): Promise<
  | { ok: true; rows: OpsAnnouncementRow[] }
  | { ok: false; error: string; detail?: string; hint?: string }
> {
  const res = await fetch('/api/meoo-tenant-announcements-list')
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      error: String(data.error ?? 'list_failed'),
      detail: typeof data.detail === 'string' ? data.detail : undefined,
      hint:
        data.error === 'migration_required'
          ? '请在 Supabase 执行迁移 20260522100000_tenant_announcements.sql'
          : typeof data.hint === 'string'
            ? data.hint
            : undefined,
    }
  }
  return { ok: true, rows: Array.isArray(data.rows) ? (data.rows as OpsAnnouncementRow[]) : [] }
}

export async function sendOpsAnnouncement(payload: {
  category: TenantAnnouncementCategory
  title: string
  body: string
  targetAll: boolean
  tenantIds: string[]
}): Promise<
  | { ok: true; announcementId: string; recipientCount: number }
  | { ok: false; error: string; detail?: string; hint?: string }
> {
  const res = await fetch('/api/meoo-tenant-announcements-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      error: String(data.error ?? 'send_failed'),
      detail: typeof data.detail === 'string' ? data.detail : undefined,
      hint:
        data.error === 'migration_required'
          ? '请在 Supabase 执行迁移 20260522100000_tenant_announcements.sql'
          : undefined,
    }
  }
  return {
    ok: true,
    announcementId: String(data.announcementId ?? ''),
    recipientCount: Number(data.recipientCount) || 0,
  }
}
