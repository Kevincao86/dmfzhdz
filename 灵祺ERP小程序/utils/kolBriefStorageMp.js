const KEY_RECORDS = 'meoo_kol_brief_records_mp_v1'
const KEY_SELECTED = 'meoo_selected_brief_for_recruitment_mp_v1'

function readRecords() {
  try {
    const raw = wx.getStorageSync(KEY_RECORDS)
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(j) ? j : []
  } catch (_) {
    return []
  }
}

function writeRecords(list) {
  try {
    wx.setStorageSync(KEY_RECORDS, JSON.stringify(list.slice(0, 48)))
  } catch (_) {}
}

function appendRecord(rec) {
  const list = readRecords()
  list.unshift(rec)
  writeRecords(list)
}

function readSelectedBrief() {
  try {
    const raw = wx.getStorageSync(KEY_SELECTED)
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    return j && typeof j === 'object' ? j : null
  } catch (_) {
    return null
  }
}

function writeSelectedBrief(payload) {
  try {
    wx.setStorageSync(KEY_SELECTED, JSON.stringify(payload))
  } catch (_) {}
}

function clearSelectedBrief() {
  try {
    wx.removeStorageSync(KEY_SELECTED)
  } catch (_) {}
}

module.exports = {
  readRecords,
  appendRecord,
  readSelectedBrief,
  writeSelectedBrief,
  clearSelectedBrief,
}
