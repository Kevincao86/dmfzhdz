import type {
  TenantAnnouncementCategory,
  TenantAnnouncementPriority,
} from '../../api/_lib/tenantAnnouncementsCore'

export type OpsAnnouncementRow = {
  id: string
  category: TenantAnnouncementCategory
  priority: TenantAnnouncementPriority
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
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(text || '{}') as Record<string, unknown>
  } catch {
    return {
      ok: false,
      error: 'list_failed',
      detail: text.slice(0, 200) || `HTTP ${res.status}`,
      hint: res.status === 404 ? '接口未部署，请重新部署商家管理后台' : undefined,
    }
  }
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      error: String(data.error ?? 'list_failed'),
      detail: typeof data.detail === 'string' ? data.detail : undefined,
      hint:
        (typeof data.hint === 'string' ? data.hint : undefined) ??
        (data.error === 'migration_required'
          ? '请在 Supabase 执行迁移 20260522100000_tenant_announcements.sql'
          : undefined),
    }
  }
  return { ok: true, rows: Array.isArray(data.rows) ? (data.rows as OpsAnnouncementRow[]) : [] }
}

export async function sendOpsAnnouncement(payload: {
  category: TenantAnnouncementCategory
  priority?: TenantAnnouncementPriority
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
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(text || '{}') as Record<string, unknown>
  } catch {
    return {
      ok: false,
      error: 'send_failed',
      detail: text.slice(0, 200) || `HTTP ${res.status}`,
      hint: res.status === 404 ? '接口未部署，请重新部署商家管理后台' : undefined,
    }
  }
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      error: String(data.error ?? 'send_failed'),
      detail: typeof data.detail === 'string' ? data.detail : undefined,
      hint:
        (typeof data.hint === 'string' ? data.hint : undefined) ??
        (data.error === 'migration_required'
          ? '请在 Supabase 执行迁移 20260522100000_tenant_announcements.sql'
          : undefined),
    }
  }
  return {
    ok: true,
    announcementId: String(data.announcementId ?? ''),
    recipientCount: Number(data.recipientCount) || 0,
  }
}
