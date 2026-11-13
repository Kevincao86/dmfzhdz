/** 未登录发招募：暂存表单，登录后回到发单页自动提交 */

const STORAGE_KEY = 'meoo_publish_pending_after_login_v1'
const MAX_AGE_MS = 30 * 60 * 1000

function read() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    if (!raw) return null
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!o || !o.savedAt) return null
    if (Date.now() - Number(o.savedAt) > MAX_AGE_MS) {
      clear()
      return null
    }
    return o
  } catch {
    return null
  }
}

function clear() {
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch (_) {}
}

function saveFromPage(page) {
  const d = page.data || {}
  const payload = {
    savedAt: Date.now(),
    autoSubmit: true,
    step: d.step || 'form',
    recruitTarget: d.recruitTarget,
    recruitTargetLabel: d.recruitTargetLabel,
    isSupplierPublish: !!d.isSupplierPublish,
    recruitMode: d.recruitMode,
    recruitModeLabel: d.recruitModeLabel,
    form: d.form ? JSON.parse(JSON.stringify(d.form)) : {},
    signupDeadlineDate: d.signupDeadlineDate || '',
    signupDeadlineTime: d.signupDeadlineTime || '23:59',
    signupDeadlineDisplay: d.signupDeadlineDisplay || '',
    signupDeadlinePlaceholder: !!d.signupDeadlinePlaceholder,
    deliveryDeadlineDate: d.deliveryDeadlineDate || '',
    deliveryDeadlineTime: d.deliveryDeadlineTime || '18:00',
    showSignupDeadline: d.showSignupDeadline !== false,
    editMpId: d.editMpId || '',
    isEditMode: !!d.isEditMode,
    editLoadDone: !!d.editLoadDone,
  }
  try {
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(payload))
  } catch (_) {}
  return payload
}

function applyToPage(page, pending, done) {
  if (!pending) {
    if (typeof done === 'function') done()
    return
  }
  const patch = {
    step: pending.step || 'form',
    recruitTarget: pending.recruitTarget,
    recruitTargetLabel: pending.recruitTargetLabel,
    isSupplierPublish: pending.isSupplierPublish,
    recruitMode: pending.recruitMode,
    recruitModeLabel: pending.recruitModeLabel,
    form: pending.form || {},
    signupDeadlineDate: pending.signupDeadlineDate,
    signupDeadlineTime: pending.signupDeadlineTime,
    signupDeadlineDisplay: pending.signupDeadlineDisplay,
    signupDeadlinePlaceholder: pending.signupDeadlinePlaceholder,
    deliveryDeadlineDate: pending.deliveryDeadlineDate,
    deliveryDeadlineTime: pending.deliveryDeadlineTime,
    showSignupDeadline: pending.showSignupDeadline,
    editMpId: pending.editMpId,
    isEditMode: pending.isEditMode,
    editLoadDone: pending.editLoadDone,
    pickerView: '',
  }
  page.setData(patch, () => {
    if (pending.isSupplierPublish && typeof page.syncSupplierPublishGrids === 'function') {
      page.syncSupplierPublishGrids(pending.form)
    }
    if (typeof page.syncDisplayFields === 'function') page.syncDisplayFields()
    if (typeof page.syncCoverPreview === 'function') page.syncCoverPreview()
    if (typeof page.syncTabBarOverlay === 'function') page.syncTabBarOverlay()
    if (typeof done === 'function') done()
  })
}

module.exports = {
  STORAGE_KEY,
  read,
  clear,
  saveFromPage,
  applyToPage,
}
