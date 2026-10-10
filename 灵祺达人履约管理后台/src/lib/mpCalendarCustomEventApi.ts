import { mpApiFetchCandidates } from './mpApiBase'
import { formatMpApiErr } from './mpApiErrors'
import { getActiveRole, getToken } from './mpSession'

const PATH = '/api/meoo-ops-mp-calendar-custom-event'

export type MpCalendarCustomEvent = {
  id: string
  title: string
  eventDateKey: string
  timeLabel: string
  note: string
  updatedAt?: string
}

function readIdentity(): 'talent' | 'pr' {
  return getActiveRole() === 'pr' ? 'pr' : 'talent'
}

async function parseJsonRes(res: Response) {
  const text = await res.text()
  if (!text.trim()) throw new Error(`接口返回为空（HTTP ${res.status}）`)
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`接口返回非 JSON（HTTP ${res.status}）`)
  }
}

function mapApiError(data: Record<string, unknown>): Error {
  const code = String(data.error || '').trim()
  if (code === 'unauthorized' || code === 'invalid_session' || code === 'login_required') {
    return new Error('登录已过期，请重新登录')
  }
  if (code === 'calendar_custom_event_db_error') {
    return new Error('自定义事件尚未开通，请联系管理员')
  }
  if (code === 'missing_title') return new Error('请填写事件标题')
  if (code === 'invalid_event_date') return new Error('请选择有效日期')
  if (code === 'invalid_time_label') return new Error('时间格式应为 HH:mm')
  const detail = String(data.message || data.detail || data.hint || data.error || '').trim()
  return new Error(formatMpApiErr(new Error(code || 'api_error'), detail))
}

async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = getToken()
  if (!token) throw new Error('请先登录后再登记事件')

  const urls = mpApiFetchCandidates(PATH)
  let lastErr: unknown
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}`, 'X-Mp-Session': token } : {}),
        },
        body: JSON.stringify({
          ...body,
          sessionToken: token,
          token,
        }),
      })
      const data = await parseJsonRes(res)
      if (!res.ok || data.ok === false) throw mapApiError(data)
      return data
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(formatMpApiErr(lastErr, '自定义事件请求失败'))
}

function mapRow(raw: unknown): MpCalendarCustomEvent | null {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!row) return null
  const id = String(row.id || '').trim()
  const title = String(row.title || '').trim()
  const eventDateKey = String(row.eventDateKey || '').trim()
  if (!id || !title || !eventDateKey) return null
  return {
    id,
    title,
    eventDateKey,
    timeLabel: String(row.timeLabel || ''),
    note: String(row.note || ''),
    updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
  }
}

export async function listCalendarCustomEvents(): Promise<MpCalendarCustomEvent[]> {
  const data = await call({ action: 'list', identity: readIdentity() })
  const rows = data.events
  if (!Array.isArray(rows)) return []
  return rows.map(mapRow).filter((row): row is MpCalendarCustomEvent => !!row)
}

export async function saveCalendarCustomEvent(input: {
  id?: string
  title: string
  eventDateKey: string
  timeLabel?: string
  note?: string
}): Promise<string> {
  const id = String(input.id || '').trim()
  const data = await call({
    action: id ? 'update' : 'create',
    identity: readIdentity(),
    ...(id ? { id } : {}),
    title: input.title,
    eventDateKey: input.eventDateKey,
    timeLabel: input.timeLabel || '',
    note: input.note || '',
  })
  const event = data.event && typeof data.event === 'object' ? (data.event as Record<string, unknown>) : null
  return String(event?.id || id).trim()
}

export async function deleteCalendarCustomEvent(id: string): Promise<void> {
  await call({ action: 'delete', identity: readIdentity(), id })
}
