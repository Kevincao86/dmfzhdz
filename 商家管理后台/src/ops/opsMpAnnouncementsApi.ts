import { fetchOpsErpApi } from '../lib/opsErpApiBase.js'
import type { MpOpsAnnouncementTargetFilter } from '../meooRegistryShared/mpOpsAnnouncementFilters'

export type OpsMpAnnouncementRow = {
  id: string
  title: string
  body: string
  showHomePopup: boolean
  targetFilter: MpOpsAnnouncementTargetFilter
  recipientCount: number
  createdAt: string
  createdBy: string | null
}

async function parseJson(res: Response) {
  const text = await res.text()
  try {
    return { data: JSON.parse(text || '{}') as Record<string, unknown>, text, status: res.status }
  } catch {
    return { data: {} as Record<string, unknown>, text, status: res.status }
  }
}

export async function fetchOpsMpAnnouncements(): Promise<
  | { ok: true; rows: OpsMpAnnouncementRow[] }
  | { ok: false; error: string; detail?: string; hint?: string }
> {
  const res = await fetchOpsErpApi('/api/meoo-ops-mp-announcement-list')
  const { data, text, status } = await parseJson(res)
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      error: String(data.error ?? 'list_failed'),
      detail: typeof data.detail === 'string' ? data.detail : text.slice(0, 200),
      hint: status === 404 ? '接口未部署，请 ECS 部署 auth-api 后重试' : undefined,
    }
  }
  return { ok: true, rows: Array.isArray(data.rows) ? (data.rows as OpsMpAnnouncementRow[]) : [] }
}

export async function sendOpsMpAnnouncement(payload: {
  title: string
  body: string
  showHomePopup?: boolean
  targetFilter: MpOpsAnnouncementTargetFilter
  createdBy?: string | null
}): Promise<
  | { ok: true; announcementId: string; recipientCount: number }
  | { ok: false; error: string; detail?: string; hint?: string }
> {
  const res = await fetchOpsErpApi('/api/meoo-ops-mp-announcement-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const { data, text, status } = await parseJson(res)
  if (!res.ok || data.ok === false) {
    const err = String(data.error ?? 'send_failed')
    return {
      ok: false,
      error: err,
      detail: typeof data.detail === 'string' ? data.detail : text.slice(0, 200),
      hint:
        err === 'no_recipients'
          ? '没有命中任何达人，请调整筛选条件或勾选达人'
          : status === 404
            ? '接口未部署，请 ECS 部署 auth-api 后重试'
            : undefined,
    }
  }
  return {
    ok: true,
    announcementId: String(data.announcementId ?? ''),
    recipientCount: Number(data.recipientCount) || 0,
  }
}
