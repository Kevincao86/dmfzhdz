const api = require('./api.js')

function shareErrorMessage(data) {
  const err = String((data && data.error) || '').trim()
  if (err === 'video_review_share_table_missing') return '分享功能未就绪，请联系运营'
  if (err === 'order_not_found') return '订单不存在或已删除'
  if (err === 'share_link_invalid') return '分享链接已失效'
  if (err === 'supabase_admin_not_configured') return '服务暂不可用，请稍后再试'
  if (err === 'video_review_share_failed') {
    const detail = String((data && data.detail) || '')
    if (/WebSocket|transport: ws/i.test(detail)) return '服务升级中，请稍后再试'
    return detail.slice(0, 28) || '分享链接生成失败'
  }
  return err || '分享链接生成失败'
}

async function postShare(body) {
  return api.tryPaths('POST', ['/api/meoo-mp-video-review-share'], body)
}

function formatTimeLabel(sec) {
  const n = Number(sec)
  if (!Number.isFinite(n) || n < 0) return ''
  const m = Math.floor(n / 60)
  const s = Math.floor(n % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function groupFeedbackByApplicant(annotations) {
  const map = {}
  for (const a of annotations || []) {
    const id = String(a.applicantId || '')
    if (!id) continue
    if (!map[id]) map[id] = []
    map[id].push({
      id: String(a.id || ''),
      visitorName: String(a.visitorName || '访客'),
      commentText: String(a.commentText || ''),
      frameTimeLabel: a.frameTimeSec != null ? formatTimeLabel(a.frameTimeSec) : '',
      createdAt: String(a.createdAt || '').slice(0, 16).replace('T', ' '),
    })
  }
  return map
}

async function createShareLink(mpOrderId) {
  const data = await postShare({ action: 'create', mpOrderId: String(mpOrderId || '').trim() })
  if (!data || !data.ok) throw new Error(shareErrorMessage(data))
  return {
    token: String(data.token || ''),
    shareUrl: String(data.shareUrl || ''),
    expiresAt: String(data.expiresAt || ''),
  }
}

async function revokeShareLink(mpOrderId) {
  const data = await postShare({ action: 'revoke', mpOrderId: String(mpOrderId || '').trim() })
  if (!data || !data.ok) throw new Error(shareErrorMessage(data))
  return true
}

async function fetchFeedback(mpOrderId) {
  const data = await postShare({ action: 'list_feedback', mpOrderId: String(mpOrderId || '').trim() })
  if (!data || !data.ok) return { annotations: [], shareUrl: '', expiresAt: '', byApplicant: {} }
  const annotations = Array.isArray(data.annotations) ? data.annotations : []
  return {
    annotations,
    shareUrl: data.shareUrl ? String(data.shareUrl) : '',
    expiresAt: data.expiresAt ? String(data.expiresAt) : '',
    byApplicant: groupFeedbackByApplicant(annotations),
  }
}

module.exports = {
  createShareLink,
  revokeShareLink,
  fetchFeedback,
  groupFeedbackByApplicant,
  formatTimeLabel,
}
