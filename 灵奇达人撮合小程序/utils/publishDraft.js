/** 发招募草稿箱（与星选 Web publishDraft / meoo_publish_wizard_drafts_v1 对齐） */
const scope = require('./mpAccountLocalScope.js')

const DRAFTS_KEY = 'meoo_publish_wizard_drafts_v1'

function draftsStorageKey() {
  return scope.scopedStorageKey(DRAFTS_KEY)
}

function readRawList() {
  try {
    const raw = wx.getStorageSync(draftsStorageKey())
    if (!raw) return []
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(list)) return []
    return list.filter((d) => d && typeof d === 'object' && d.form)
  } catch (_) {
    return []
  }
}

function listPublishDrafts() {
  return readRawList().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
}

function deletePublishDraft(id) {
  const key = String(id || '').trim()
  if (!key) return
  const next = readRawList().filter((d) => d && d.id !== key)
  try {
    wx.setStorageSync(draftsStorageKey(), next)
  } catch (_) {
    /* ignore */
  }
}

function draftDisplayTitle(draft) {
  const t = String((draft && draft.form && draft.form.title) || '').trim()
  return t || '未命名招募'
}

function formatDraftSavedAt(savedAt) {
  if (!savedAt) return '—'
  try {
    return new Date(savedAt).toLocaleString('zh-CN', { hour12: false })
  } catch (_) {
    return '—'
  }
}

function deliveryWindowLabel(code) {
  const c = String(code || '').trim()
  if (c === 'urgent') return '急单'
  if (c === 'normal') return '普通'
  if (c === 'flexible') return '灵活'
  return c || '普通'
}

module.exports = {
  listPublishDrafts,
  deletePublishDraft,
  draftDisplayTitle,
  formatDraftSavedAt,
  deliveryWindowLabel,
}
