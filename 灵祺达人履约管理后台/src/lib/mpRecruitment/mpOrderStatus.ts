/** 星选 Web / 小程序对齐：有效状态（含截止自动已完成） */
export const MP_STATUS_LABEL: Record<string, string> = {
  open: '招募中',
  collecting: '收集中',
  closed: '已停止',
  done: '已完成',
}

export const HALL_STATUS_FILTERS = ['全部', '招募中', '收集中', '已停止', '已完成'] as const

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
