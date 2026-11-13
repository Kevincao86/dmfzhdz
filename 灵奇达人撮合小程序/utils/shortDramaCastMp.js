/**
 * 短剧角色组。操作与网页端一致：新建、按参考图二选一、保存角色组、下次载入。
 * 存在本机，键名与网页 meta 相同，便于对照。
 */
const PACK_KEY = 'meoo-short-drama-cast-packs-v1'
const CURRENT_KEY = 'meoo-short-drama-cast-current-v1'
const MAX = 6
const PACK_KEEP = 12

function newId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function newMember(index) {
  return {
    id: newId(),
    name: `角色${index}`,
    desc: '',
    sourcePath: '',
    sourceDataUrl: '',
    previewPath: '',
    previewDataUrl: '',
    refMode: '',
    confirmed: false,
  }
}

function worthSaving(members) {
  return (members || []).some(
    (m) =>
      Boolean(m.previewPath || m.previewDataUrl || m.sourcePath || m.sourceDataUrl || String(m.desc || '').trim()) ||
      (Boolean(String(m.name || '').trim()) && !/^角色\d+$/.test(String(m.name).trim())),
  )
}

function readJson(key) {
  try {
    const raw = wx.getStorageSync(key)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (_) {
    return null
  }
}

function writeJson(key, value) {
  wx.setStorageSync(key, JSON.stringify(value))
}

function loadPacks() {
  const rows = readJson(PACK_KEY)
  return Array.isArray(rows) ? rows.filter((p) => p && p.id && Array.isArray(p.members)) : []
}

function savePacks(rows) {
  writeJson(PACK_KEY, (rows || []).slice(0, PACK_KEEP))
}

function loadCurrent() {
  const rows = readJson(CURRENT_KEY)
  return Array.isArray(rows) ? rows.slice(0, MAX) : []
}

function saveCurrent(members) {
  try {
    writeJson(CURRENT_KEY, (members || []).slice(0, MAX))
  } catch (_) {
    /* 图片过大时忽略自动保存 */
  }
}

module.exports = {
  MAX,
  newMember,
  worthSaving,
  loadPacks,
  savePacks,
  loadCurrent,
  saveCurrent,
}
