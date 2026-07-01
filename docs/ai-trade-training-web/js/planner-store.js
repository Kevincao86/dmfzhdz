/**
 * 方案规划器 — 按协作房间隔离的本地缓存
 */
(function (global) {
  const STORAGE_ROOM = 'planner_collab_room_v1'

  function roomPrefix() {
    const r = String(localStorage.getItem(STORAGE_ROOM) || '')
      .trim()
      .toUpperCase()
    return r ? `${r}_` : ''
  }

  function storageKey(name) {
    return `planner_${roomPrefix()}${name}`
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return fallback
      return JSON.parse(raw)
    } catch {
      return fallback
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
  }

  function loadEntries() {
    const v = readJson(storageKey('role_entries_v1'), [])
    return Array.isArray(v) ? v : []
  }

  function saveEntries(entries) {
    writeJson(storageKey('role_entries_v1'), entries)
  }

  function loadDesign() {
    return readJson(storageKey('design_result_v1'), null)
  }

  function saveDesign(design) {
    if (design) writeJson(storageKey('design_result_v1'), design)
    else localStorage.removeItem(storageKey('design_result_v1'))
  }

  function loadMockups() {
    const v = readJson(storageKey('mockups_v1'), [])
    return Array.isArray(v) ? v : []
  }

  function saveMockups(mockups) {
    writeJson(storageKey('mockups_v1'), mockups)
  }

  function loadProductType() {
    return localStorage.getItem(storageKey('product_type_v1')) || 'miniprogram'
  }

  function saveProductType(type) {
    localStorage.setItem(storageKey('product_type_v1'), type)
  }

  function clearAll() {
    saveEntries([])
    saveDesign(null)
    saveMockups([])
  }

  global.PlannerStore = {
    loadEntries,
    saveEntries,
    loadDesign,
    saveDesign,
    loadMockups,
    saveMockups,
    loadProductType,
    saveProductType,
    clearAll,
  }
})(typeof window !== 'undefined' ? window : globalThis)
