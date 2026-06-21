const userProfile = require('./userProfile.js')
const participant = require('./participant.js')

const KEY_PREFIX = 'meoo_pr_talent_favorites_v1_'

function storageKey() {
  if (userProfile.readIdentity() !== 'pr') return ''
  const pr = userProfile.readPrProfile() || userProfile.emptyPrProfile()
  return `${KEY_PREFIX}${participant.prParticipantKey(pr)}`
}

function readIdSet() {
  const key = storageKey()
  if (!key) return new Set()
  try {
    const raw = wx.getStorageSync(key)
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return new Set((Array.isArray(arr) ? arr : []).map(String))
  } catch {
    return new Set()
  }
}

function writeIdSet(set) {
  const key = storageKey()
  if (!key) return
  wx.setStorageSync(key, JSON.stringify([...set]))
  try {
    require('./mpAccountClientSync.js').schedulePush()
  } catch (_) {}
}

function isFavorite(talentId) {
  return readIdSet().has(String(talentId))
}

function toggleFavorite(talentId) {
  const id = String(talentId || '')
  if (!id || id === 'mock-preview') return false
  const set = readIdSet()
  if (set.has(id)) set.delete(id)
  else set.add(id)
  writeIdSet(set)
  return set.has(id)
}

function applyFavoriteIdsFromSync(ids) {
  if (!Array.isArray(ids)) return
  const key = storageKey()
  if (!key) return
  wx.setStorageSync(key, JSON.stringify([...new Set(ids.map(String))].slice(0, 500)))
}

module.exports = {
  readIdSet,
  isFavorite,
  toggleFavorite,
  applyFavoriteIdsFromSync,
}
