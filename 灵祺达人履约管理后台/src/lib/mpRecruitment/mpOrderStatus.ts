/** 星选 Web / 小程序对齐：有效状态（含截止自动已完成） */
export const MP_STATUS_LABEL: Record<string, string> = {
  open: '招募中',
  collecting: '收集中',
  closed: '已停止',
  done: '已完成',
}

export const HALL_STATUS_FILTERS = ['全部', '招募中/收集中', '招募中', '收集中', '已停止', '已完成'] as const

export const HALL_DEFAULT_STATUS_FILTER = '招募中/收集中'

export function matchHallStatusFilter(statusLabelText: string, filter: string): boolean {
  if (!filter || filter === '全部') return true
  if (filter === HALL_DEFAULT_STATUS_FILTER) {
    return statusLabelText === '招募中' || statusLabelText === '收集中'
  }
  return statusLabelText === filter
}

export function resolveEffectiveMpStatus(
  rawStatus: unknown,
  deadlineMs: number,
  nowMs: number = Date.now(),
): string {
  let raw = String(rawStatus || 'open').trim() || 'open'
  if (raw === 'pending_settlement') raw = 'closed'
  if (raw === 'closed' || raw === 'done') return raw
  if (deadlineMs > 0 && nowMs >= deadlineMs) return 'done'
  return raw
}

export function statusLabel(status: string): string {
  return MP_STATUS_LABEL[status] || status
}

export function isMpOrderRecruiting(status: string | undefined): boolean {
  const s = status || 'open'
  return s === 'open' || s === 'collecting'
}
