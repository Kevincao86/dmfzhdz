const api = require('./api.js')
const config = require('./config.js')

const MP_SHARE_APP_NAME = String(config.MP_SHARE_APP_NAME || '灵祺星选').trim() || '灵祺星选'
const SHARE_PAGE = 'pages/subpack-pr/applicant-pick-share/applicant-pick-share'

function shareErrorMessage(data) {
  const err = String((data && data.error) || '').trim()
  if (err === 'applicant_pick_share_table_missing') return '分享功能未就绪，请联系运营'
  if (err === 'applicant_pick_share_db_permission') return '分享功能未就绪，请联系运营'
  if (err === 'order_not_found') return '订单不存在或已删除'
  if (err === 'share_link_invalid') return '分享链接已失效'
  if (err === 'applicant_ids_required') return '请先选择要分享的达人'
  if (err === 'supabase_admin_not_configured') return '服务暂不可用，请稍后再试'
  if (err === 'applicant_pick_share_failed') {
    const detail = String((data && data.detail) || '')
    return detail.slice(0, 28) || '分享链接生成失败'
  }
  return err || '分享链接生成失败'
}

function extractShareToken(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  if (/^ap_/.test(raw)) return raw
  const drMatch = raw.match(/\/applicants\/share\/(ap_[^/?#]+)/i)
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
  return api.tryPaths('POST', ['/api/meoo-mp-applicant-pick-share'], body)
}

function mapNoteRow(n) {
  return {
    id: String(n.id || ''),
    applicantId: String(n.applicantId || n.applicant_id || ''),
    visitorName: String(n.visitorName || n.visitor_name || '商家'),
    noteText: String(n.noteText || n.note_text || ''),
    updatedAt: String(n.updatedAt || n.updated_at || n.createdAt || '').slice(0, 16).replace('T', ' '),
  }
}

function groupNotesByApplicant(notes) {
  const map = {}
  for (const raw of notes || []) {
    const n = mapNoteRow(raw)
    if (!n.applicantId) continue
    map[n.applicantId] = n
  }
  return map
}

async function createShareLink(mpOrderId, applicantIds) {
  const ids = (applicantIds || []).map((x) => String(x || '').trim()).filter(Boolean)
  const data = await postShare({
    action: 'create',
    mpOrderId: String(mpOrderId || '').trim(),
    applicantIds: ids,
  })
  if (!data || !data.ok) throw new Error(shareErrorMessage(data))
  const token = String(data.token || extractShareToken(data.mpShareUrl || data.shareUrl) || '')
  const mpShareUrl = String(data.mpShareUrl || '').trim() || buildMpShareLink(token)
  return {
    token,
    applicantIds: Array.isArray(data.applicantIds) ? data.applicantIds : ids,
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
  if (!data || !data.ok) {
    return { notes: [], shareUrl: '', expiresAt: '', byApplicant: {}, token: '', applicantIds: [] }
  }
  const notes = Array.isArray(data.notes) ? data.notes.map(mapNoteRow) : []
  const token = String(data.token || extractShareToken(data.mpShareUrl || data.shareUrl) || '')
  const mpShareUrl = String(data.mpShareUrl || '').trim() || (token ? buildMpShareLink(token) : '')
  return {
    notes,
    token,
    applicantIds: Array.isArray(data.applicantIds) ? data.applicantIds : [],
    shareUrl: mpShareUrl,
    webShareUrl: data.shareUrl ? String(data.shareUrl) : '',
    expiresAt: data.expiresAt ? String(data.expiresAt) : '',
    byApplicant: groupNotesByApplicant(data.notes || notes),
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
    applicantIds: Array.isArray(data.applicantIds) ? data.applicantIds : [],
    talents: Array.isArray(data.talents) ? data.talents : [],
    notes: Array.isArray(data.notes) ? data.notes.map(mapNoteRow) : [],
  }
}

async function submitShareNote(input) {
  const token = extractShareToken(input && input.token)
  const applicantId = String((input && input.applicantId) || '').trim()
  const visitorName = String((input && input.visitorName) || '商家').trim().slice(0, 40) || '商家'
  const noteText = String((input && input.noteText) || '').trim().slice(0, 500)
  if (!token || !applicantId || !noteText) throw new Error('invalid_note')
  const data = await postShare({
    action: 'upsert_note',
    token,
    applicantId,
    visitorName,
    noteText,
  })
  if (!data || !data.ok) throw new Error(shareErrorMessage(data))
  return mapNoteRow(data.note || {})
}

module.exports = {
  buildMpShareLink,
  normalizeShareUrl,
  extractShareToken,
  createShareLink,
  revokeShareLink,
  fetchFeedback,
  fetchPublicShare,
  submitShareNote,
  groupNotesByApplicant,
  mapNoteRow,
}
