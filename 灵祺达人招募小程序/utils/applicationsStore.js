const STORAGE_KEY = 'meoo_my_applications_v1'
const PUBLISH_KEY = 'meoo_my_published_orders_v1'

function readApplications() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function addApplication(entry) {
  const list = readApplications()
  list.unshift({
    appliedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    ...entry,
  })
  wx.setStorageSync(STORAGE_KEY, JSON.stringify(list.slice(0, 80)))
}

function readPublishedOrders() {
  try {
    const raw = wx.getStorageSync(PUBLISH_KEY)
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function addPublishedOrder(entry) {
  const list = readPublishedOrders()
  list.unshift({
    publishedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    ...entry,
  })
  writePublishedOrders(list)
}

function writePublishedOrders(list) {
  wx.setStorageSync(PUBLISH_KEY, JSON.stringify((list || []).slice(0, 80)))
}

function removePublishedOrder(mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id) return
  const list = readPublishedOrders().filter((item) => item && item.mpOrderId !== id)
  writePublishedOrders(list)
}

function updatePublishedOrderTitle(mpOrderId, title) {
  const id = String(mpOrderId || '').trim()
  if (!id) return
  const list = readPublishedOrders().map((item) =>
    item && item.mpOrderId === id ? { ...item, title: title || item.title } : item,
  )
  writePublishedOrders(list)
}

module.exports = {
  readApplications,
  addApplication,
  readPublishedOrders,
  addPublishedOrder,
  removePublishedOrder,
  updatePublishedOrderTitle,
}
