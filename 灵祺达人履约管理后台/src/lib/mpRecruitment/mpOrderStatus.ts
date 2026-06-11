/** 星选 Web / 小程序对齐：有效状态（含报名截止 → 已截止） */
export const MP_STATUS_LABEL: Record<string, string> = {
  open: '招募中',
  collecting: '收集中',
  expired: '已截止',
  closed: '已停止',
  done: '已完成',
  deleted: '已删除',
}

export const HALL_STATUS_FILTERS = ['全部', '招募中/收集中', '招募中', '收集中', '已截止', '已停止', '已完成'] as const

export const HALL_DEFAULT_STATUS_FILTER = '招募中/收集中'

export function matchHallStatusFilter(statusLabelText: string, filter: string): boolean {
  if (!filter || filter === '全部') return true
  if (filter === HALL_DEFAULT_STATUS_FILTER) {
    /** 默认大厅：进行中 + 云剪已满仍展示；排除 PR 手动「已停止」与「已完成」 */
    return statusLabelText === '招募中' || statusLabelText === '收集中' || statusLabelText === '已收满'
  }
  return statusLabelText === filter
}

/** Tab 角标：统计分类内全部状态，不受状态筛选项影响 */
export function matchHallTabCountStatusFilter(_statusLabelText: string, _filter: string): boolean {
  return true
}

export function resolveEffectiveMpStatus(
  rawStatus: unknown,
  deadlineMs: number,
  nowMs: number = Date.now(),
): string {
  let raw = String(rawStatus || 'open').trim() || 'open'
  if (raw === 'pending_settlement') raw = 'done'
  if (raw === 'closed' || raw === 'done') return raw
  if (deadlineMs > 0 && nowMs >= deadlineMs && (raw === 'open' || raw === 'collecting')) return 'expired'
  return raw
}

export function statusLabel(status: string): string {
  return MP_STATUS_LABEL[status] || status
}

export function isMpOrderRecruiting(status: string | undefined): boolean {
  const s = status || 'open'
  return s === 'open' || s === 'collecting'
}
