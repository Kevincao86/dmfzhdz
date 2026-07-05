export const INVITE_HOUR_OPTIONS = [
  { id: 24, label: '24 小时' },
  { id: 48, label: '48 小时' },
  { id: 72, label: '72 小时' },
  { id: 168, label: '7 天' },
] as const

export const RECRUIT_CHANNELS = [
  { id: 'open', label: '普通招募', sub: '公开大厅曝光，达人主动报名', iconGlyph: '📣' },
  { id: 'targeted', label: '定向邀约', sub: '从达人库点名，邀约确认后入选', iconGlyph: '🎯' },
] as const

export type TargetedInvite = {
  id?: string
  talentMemberId?: string
  status?: string
  rejectReason?: string
  invitedAt?: string
  respondedAt?: string
  talentName?: string
}

function readMeta(mp: Record<string, unknown> | null | undefined) {
  const meta = mp?.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  return meta as Record<string, unknown>
}

export function isTargetedOrder(mp: Record<string, unknown> | null | undefined) {
  return readMeta(mp).recruitScope === 'targeted'
}

export function readInvites(mp: Record<string, unknown> | null | undefined): TargetedInvite[] {
  const meta = readMeta(mp)
  return Array.isArray(meta.targetedInvites) ? (meta.targetedInvites as TargetedInvite[]) : []
}

export function inviteStats(mp: Record<string, unknown> | null | undefined) {
  const list = readInvites(mp)
  return {
    invited: list.filter((i) => i && i.status !== 'cancelled').length,
    accepted: list.filter((i) => i && i.status === 'accepted').length,
    rejected: list.filter((i) => i && i.status === 'rejected').length,
    pending: list.filter((i) => i && i.status === 'pending').length,
    expired: list.filter((i) => i && i.status === 'expired').length,
  }
}

export function buildInviteProgressLabel(mp: Record<string, unknown> | null | undefined) {
  const stats = inviteStats(mp)
  return `邀约 ${stats.invited} · 同意 ${stats.accepted}`
}

export function findInviteForMember(mp: Record<string, unknown> | null | undefined, talentMemberId: string) {
  const mid = String(talentMemberId || '').trim()
  if (!mid) return null
  return readInvites(mp).find((i) => i && String(i.talentMemberId) === mid) || null
}

export function isInviteDeadlinePassed(mp: Record<string, unknown> | null | undefined) {
  const meta = readMeta(mp)
  const dl = String(meta.inviteDeadline || '').trim()
  if (!dl) return false
  const t = new Date(dl.replace(/-/g, '/')).getTime()
  return Number.isFinite(t) && Date.now() > t
}

export function isTargetedInvitePhaseFinalized(mp: Record<string, unknown> | null | undefined) {
  if (!isTargetedOrder(mp)) return false
  const meta = readMeta(mp)
  const wf = meta.prWorkflow && typeof meta.prWorkflow === 'object' ? (meta.prWorkflow as Record<string, unknown>) : {}
  if (String(wf.targetedInviteFinalizedAt || meta.targetedInviteFinalizedAt || '').trim()) return true
  return String(wf.stage || '') === 'pending_schedule'
}

export function isTargetedInvitePhaseEnded(mp: Record<string, unknown> | null | undefined) {
  if (!isTargetedOrder(mp)) return false
  if (isTargetedInvitePhaseFinalized(mp)) return true
  const stats = inviteStats(mp)
  if (!stats.invited || stats.accepted === 0) return false
  if (stats.pending === 0) return true
  return isInviteDeadlinePassed(mp)
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '待响应',
    accepted: '已同意',
    rejected: '已拒绝',
    expired: '已过期',
    cancelled: '已取消',
  }
  return map[status] || status || '—'
}
