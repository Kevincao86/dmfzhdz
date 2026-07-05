const INVITE_HOUR_OPTIONS = [
  { id: 24, label: '24 小时' },
  { id: 48, label: '48 小时' },
  { id: 72, label: '72 小时' },
  { id: 168, label: '7 天' },
]

const RECRUIT_CHANNELS = [
  { id: 'open', label: '普通招募', sub: '公开大厅曝光，达人主动报名', iconGlyph: '📣' },
  { id: 'targeted', label: '定向邀约', sub: '从达人库点名，邀约确认后入选', iconGlyph: '🎯' },
]

function readMeta(mp) {
  const meta = mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  return meta
}

function isTargetedOrder(mp) {
  return readMeta(mp).recruitScope === 'targeted'
}

function readInvites(mp) {
  const meta = readMeta(mp)
  return Array.isArray(meta.targetedInvites) ? meta.targetedInvites : []
}

function inviteStats(mp) {
  const list = readInvites(mp)
  return {
    invited: list.filter((i) => i && i.status !== 'cancelled').length,
    accepted: list.filter((i) => i && i.status === 'accepted').length,
    rejected: list.filter((i) => i && i.status === 'rejected').length,
    pending: list.filter((i) => i && i.status === 'pending').length,
    expired: list.filter((i) => i && i.status === 'expired').length,
  }
}

function statusLabel(status) {
  const map = {
    pending: '待响应',
    accepted: '已同意',
    rejected: '已拒绝',
    expired: '已过期',
    cancelled: '已取消',
  }
  return map[status] || status || '—'
}

module.exports = {
  INVITE_HOUR_OPTIONS,
  RECRUIT_CHANNELS,
  isTargetedOrder,
  readInvites,
  inviteStats,
  statusLabel,
}
