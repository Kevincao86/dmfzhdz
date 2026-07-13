import { mpApiFetchCandidates } from './mpApiBase'
import { formatMpApiErr } from './mpApiErrors'
import { getActiveRole, getToken } from './mpSession'

const PATH = '/api/meoo-ops-mp-calendar-reminder'

export type MpCalendarReminderLeadPreset = 'day8' | 'day_before_20' | 'days2_before'

export type MpCalendarReminder = {
  id: string
  eventId: string
  mpOrderId: string
  eventKind: string
  eventDateKey: string
  eventTitle: string
  storeName?: string
  leadPreset: MpCalendarReminderLeadPreset
  remindAt: string
  status: 'pending' | 'sent' | 'cancelled' | 'failed'
  channels?: string[]
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

function readIdentity(): 'talent' | 'pr' {
  return getActiveRole() === 'pr' ? 'pr' : 'talent'
}

function mapApiError(data: Record<string, unknown>): Error {
  const code = String(data.error || '').trim()
  if (code === 'unauthorized' || code === 'invalid_session' || code === 'login_required') {
    return new Error('登录已过期，请重新登录')
  }
  if (code === 'reminder_exists') {
    return new Error(String(data.message || '该提醒已设置'))
  }
  if (code === 'remind_at_in_past' || code === 'remind_at_past') {
    return new Error('提醒时间已过，请选择更早的提醒')
  }
  if (code === 'calendar_reminder_table_missing') {
    return new Error('日历提醒功能尚未开通，请联系管理员')
  }
  const detail = String(data.message || data.detail || data.hint || data.error || '').trim()
  return new Error(formatMpApiErr(new Error(code || 'api_error'), detail))
}

async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = getToken()
  if (!token) throw new Error('请先登录后再设置提醒')

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
  throw lastErr instanceof Error ? lastErr : new Error(formatMpApiErr(lastErr, '日历提醒请求失败'))
}

export async function listCalendarReminders(): Promise<MpCalendarReminder[]> {
  const data = await call({ action: 'list', identity: readIdentity() })
  const rows = data.reminders
  if (!Array.isArray(rows)) return []
  return rows.map((r) => {
    const row = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    return {
      id: String(row.id || ''),
      eventId: String(row.eventId || ''),
      mpOrderId: String(row.mpOrderId || ''),
      eventKind: String(row.eventKind || ''),
      eventDateKey: String(row.eventDateKey || ''),
      eventTitle: String(row.eventTitle || ''),
      storeName: row.storeName ? String(row.storeName) : undefined,
      leadPreset: String(row.leadPreset || 'day8') as MpCalendarReminderLeadPreset,
      remindAt: String(row.remindAt || ''),
      status: String(row.status || 'pending') as MpCalendarReminder['status'],
      channels: Array.isArray(row.channels) ? row.channels.map(String) : undefined,
    }
  })
}

export async function createCalendarReminder(input: {
  eventId: string
  mpOrderId: string
  eventKind: string
  eventDateKey: string
  eventTitle: string
  storeName?: string
  leadPreset: MpCalendarReminderLeadPreset
  remindAt: string
  channels?: string[]
}): Promise<void> {
  await call({
    action: 'create',
    identity: readIdentity(),
    eventId: input.eventId,
    mpOrderId: input.mpOrderId,
    eventKind: input.eventKind,
    eventDateKey: input.eventDateKey,
    eventTitle: input.eventTitle,
    storeName: input.storeName || '',
    leadPreset: input.leadPreset,
    remindAt: input.remindAt,
    channels: input.channels ?? ['subscribe', 'oa'],
  })
}

export async function cancelCalendarReminder(reminderId: string): Promise<void> {
  await call({ action: 'cancel', identity: readIdentity(), reminderId })
}
