import { mpApiFetchCandidates } from './mpApiBase'
import { formatMpApiErr } from './mpApiErrors'
import { getActiveRole, getToken } from './mpSession'

const PATH = '/api/meoo-ops-mp-order-custom-label'

export type OrderLabelColor = 'violet' | 'emerald' | 'orange' | 'red' | 'blue' | 'pink' | 'slate'

export type MpOrderCustomLabel = {
  id: string
  mpOrderId: string
  labelText: string
  color: OrderLabelColor
  updatedAt?: string
}

export const ORDER_LABEL_PRESETS: Array<{ text: string; color: OrderLabelColor }> = [
  { text: '重点', color: 'red' },
  { text: '加急', color: 'orange' },
  { text: '待沟通', color: 'violet' },
  { text: '需改期', color: 'pink' },
  { text: '高佣金', color: 'emerald' },
  { text: '同城', color: 'blue' },
  { text: '远程', color: 'slate' },
  { text: '已完成', color: 'slate' },
]

export function orderLabelBadgeClass(color: OrderLabelColor): string {
  if (color === 'emerald') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (color === 'orange') return 'bg-orange-50 text-orange-700 border-orange-200'
  if (color === 'red') return 'bg-red-50 text-red-700 border-red-200'
  if (color === 'blue') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (color === 'pink') return 'bg-pink-50 text-pink-700 border-pink-200'
  if (color === 'slate') return 'bg-slate-100 text-slate-600 border-slate-200'
  return 'bg-violet-50 text-violet-700 border-violet-200'
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
  if (code === 'order_label_db_error') {
    return new Error('标签功能尚未开通，请联系管理员')
  }
  const detail = String(data.message || data.detail || data.hint || data.error || '').trim()
  return new Error(formatMpApiErr(new Error(code || 'api_error'), detail))
}

async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = getToken()
  if (!token) throw new Error('请先登录后再设置标签')

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
  throw lastErr instanceof Error ? lastErr : new Error(formatMpApiErr(lastErr, '商单标签请求失败'))
}

export async function listOrderCustomLabels(): Promise<MpOrderCustomLabel[]> {
  const data = await call({ action: 'list', identity: readIdentity() })
  const rows = data.labels
  if (!Array.isArray(rows)) return []
  return rows.map((r) => {
    const row = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    return {
      id: String(row.id || ''),
      mpOrderId: String(row.mpOrderId || ''),
      labelText: String(row.labelText || ''),
      color: (String(row.color || 'violet') as OrderLabelColor) || 'violet',
      updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
    }
  })
}

export async function upsertOrderCustomLabel(input: {
  mpOrderId: string
  labelText: string
  color: OrderLabelColor
}): Promise<void> {
  await call({
    action: 'upsert',
    identity: readIdentity(),
    mpOrderId: input.mpOrderId,
    labelText: input.labelText,
    color: input.color,
  })
}

export async function deleteOrderCustomLabel(mpOrderId: string): Promise<void> {
  await call({ action: 'delete', identity: readIdentity(), mpOrderId })
}

export function labelsByOrderId(labels: MpOrderCustomLabel[]): Map<string, MpOrderCustomLabel> {
  const map = new Map<string, MpOrderCustomLabel>()
  for (const row of labels) {
    const id = String(row.mpOrderId || '').trim()
    if (id) map.set(id, row)
  }
  return map
}
