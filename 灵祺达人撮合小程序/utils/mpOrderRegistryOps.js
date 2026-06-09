const api = require('./api.js')
const registryCache = require('./registryCache.js')

async function postJson(paths, body) {
  let lastErr
  for (const path of paths) {
    try {
      const data = await api.post(path, body)
      if (data && data.ok === false) {
        throw new Error(String(data.detail || data.error || '操作失败'))
      }
      return data
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('接口不可用')
}

function updateMpRecruitmentOrder(order) {
  return postJson(
    [
      '/api/meoo-ops-mp-recruitment-orders-patch',
      '/api/ops-sync/mp-recruitment-orders/patch',
    ],
    { id: order.id, order },
  )
}

function deleteMpRecruitmentOrder(mpOrderId) {
  return postJson(
    [
      '/api/meoo-ops-mp-recruitment-orders-delete',
      '/api/ops-sync/mp-recruitment-orders/delete',
    ],
    { id: mpOrderId },
  ).then((res) => {
    registryCache.removeMpOrder(String(mpOrderId || '').trim())
    return res
  })
}

function patchMpRecruitmentOrderStatus(mpOrderId, status) {
  const id = String(mpOrderId || '').trim()
  const s = String(status || '').trim()
  if (!id || !s) return Promise.reject(new Error('参数无效'))
  return postJson(
    [
      '/api/meoo-ops-mp-recruitment-orders-patch',
      '/api/ops-sync/mp-recruitment-orders/patch',
    ],
    { id, status: s },
  ).then((res) => {
    registryCache.patchMpOrder(id, { status: s })
    return res
  })
}

function patchSelectedApplicantIds(mpOrderId, selectedApplicantIds) {
  const id = String(mpOrderId || '').trim()
  const ids = Array.isArray(selectedApplicantIds) ? selectedApplicantIds : []
  if (!id) return Promise.reject(new Error('参数无效'))
  return postJson(
    [
      '/api/meoo-ops-mp-recruitment-orders-patch',
      '/api/ops-sync/mp-recruitment-orders/patch',
    ],
    { id, selectedApplicantIds: ids },
  )
}

function patchGroupQrImage(mpOrderId, groupQrImage) {
  const id = String(mpOrderId || '').trim()
  if (!id) return Promise.reject(new Error('参数无效'))
  return postJson(
    [
      '/api/meoo-ops-mp-recruitment-orders-patch',
      '/api/ops-sync/mp-recruitment-orders/patch',
    ],
    { id, groupQrImage: String(groupQrImage || '') },
  )
}

module.exports = {
  updateMpRecruitmentOrder,
  deleteMpRecruitmentOrder,
  patchMpRecruitmentOrderStatus,
  patchSelectedApplicantIds,
  patchGroupQrImage,
}
