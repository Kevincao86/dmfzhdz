/**
 * 方案规划器 — 本地状态持久化（录入页 / 汇总页共享）
 */
(function (global) {
  const KEYS = {
    entries: 'planner_role_entries_v1',
    design: 'planner_design_result_v1',
    mockups: 'planner_mockups_v1',
    productType: 'planner_product_type_v1',
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
    const v = readJson(KEYS.entries, [])
    return Array.isArray(v) ? v : []
  }

  function saveEntries(entries) {
    writeJson(KEYS.entries, entries)
  }

  function loadDesign() {
    return readJson(KEYS.design, null)
  }

  function saveDesign(design) {
    if (design) writeJson(KEYS.design, design)
    else localStorage.removeItem(KEYS.design)
  }

  function loadMockups() {
    const v = readJson(KEYS.mockups, [])
    return Array.isArray(v) ? v : []
  }

  function saveMockups(mockups) {
    writeJson(KEYS.mockups, mockups)
  }

  function loadProductType() {
    return localStorage.getItem(KEYS.productType) || 'miniprogram'
  }

  function saveProductType(type) {
    localStorage.setItem(KEYS.productType, type)
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
