const api = require('./api.js')

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
  if (!data || !data.ok) throw new Error((data && data.error) || '分享链接生成失败')
  return {
    token: String(data.token || ''),
    shareUrl: String(data.shareUrl || ''),
    expiresAt: String(data.expiresAt || ''),
  }
}

async function revokeShareLink(mpOrderId) {
  const data = await postShare({ action: 'revoke', mpOrderId: String(mpOrderId || '').trim() })
  if (!data || !data.ok) throw new Error((data && data.error) || '失效失败')
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
