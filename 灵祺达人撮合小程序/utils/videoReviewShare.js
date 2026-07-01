const api = require('./api.js')
const config = require('./config.js')

const MP_SHARE_APP_NAME = String(config.MP_SHARE_APP_NAME || '灵祺星选').trim() || '灵祺星选'
const SHARE_PAGE = 'pages/subpack-pr/video-review-share/video-review-share'

function shareErrorMessage(data) {
  const err = String((data && data.error) || '').trim()
  if (err === 'video_review_share_table_missing') return '分享功能未就绪，请联系运营'
  if (err === 'video_review_share_db_permission') return '分享功能未就绪，请联系运营'
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

function extractShareToken(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  if (/^vr_/.test(raw)) return raw
  const drMatch = raw.match(/\/share\/(vr_[^/?#]+)/i)
  if (drMatch) return drMatch[1]
  const qMatch = raw.match(/[?&]token=([^&]+)/i)
  if (qMatch) {
    try {
      return decodeURIComponent(qMatch[1])
    } catch (_) {
      return qMatch[1]
    }
  }
  return ''
}

/** 微信群可粘贴的 #小程序:// 短链，直达审片分享页 */
function buildMpShareLink(token) {
  const t = extractShareToken(token)
  if (!t) return ''
  const pagePath = `${SHARE_PAGE}?token=${encodeURIComponent(t)}`
  return `#小程序://${MP_SHARE_APP_NAME}/${pagePath}`
}

function normalizeShareUrl(tokenOrUrl) {
  const token = extractShareToken(tokenOrUrl)
  return token ? buildMpShareLink(token) : String(tokenOrUrl || '').trim()
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
  const token = String(data.token || extractShareToken(data.mpShareUrl || data.shareUrl) || '')
  const mpShareUrl = String(data.mpShareUrl || '').trim() || buildMpShareLink(token)
  return {
    token,
    shareUrl: mpShareUrl,
    webShareUrl: String(data.shareUrl || '').trim(),
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
  if (!data || !data.ok) return { annotations: [], shareUrl: '', expiresAt: '', byApplicant: {}, token: '' }
  const annotations = Array.isArray(data.annotations) ? data.annotations : []
  const token = String(data.token || extractShareToken(data.mpShareUrl || data.shareUrl) || '')
  const mpShareUrl = String(data.mpShareUrl || '').trim() || (token ? buildMpShareLink(token) : '')
  return {
    annotations,
    token,
    shareUrl: mpShareUrl,
    webShareUrl: data.shareUrl ? String(data.shareUrl) : '',
    expiresAt: data.expiresAt ? String(data.expiresAt) : '',
    byApplicant: groupFeedbackByApplicant(annotations),
  }
}

async function fetchPublicShare(token) {
  const t = extractShareToken(token)
  if (!t) throw new Error('share_link_invalid')
  const data = await postShare({ action: 'public_get', token: t })
  if (!data || !data.ok) throw new Error(shareErrorMessage(data))
  return {
    mpOrderId: String(data.mpOrderId || ''),
    title: String(data.title || ''),
    expiresAt: String(data.expiresAt || ''),
    videos: Array.isArray(data.videos) ? data.videos : [],
    annotations: Array.isArray(data.annotations) ? data.annotations : [],
  }
}

async function submitShareComment(input) {
  const token = extractShareToken(input && input.token)
  const applicantId = String((input && input.applicantId) || '').trim()
  const visitorName = String((input && input.visitorName) || '访客').trim().slice(0, 40) || '访客'
  const commentText = String((input && input.commentText) || '').trim().slice(0, 500)
  if (!token || !applicantId || !commentText) throw new Error('invalid_annotation')
  const data = await postShare({
    action: 'add_annotation',
    token,
    applicantId,
    visitorName,
    commentText,
  })
  if (!data || !data.ok) throw new Error(shareErrorMessage(data))
  return data.annotation
}

module.exports = {
  buildMpShareLink,
  normalizeShareUrl,
  extractShareToken,
  createShareLink,
  revokeShareLink,
  fetchFeedback,
  fetchPublicShare,
  submitShareComment,
  groupFeedbackByApplicant,
  formatTimeLabel,
}
