const api = require('./api.js')
const registryCache = require('./registryCache.js')
const prWorkflow = require('./prOrderWorkflowStage.js')

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
  const auth = require('./auth.js')
  const token = auth.readSessionToken()
  const headers = auth.authHeaders()
  const body = { id: mpOrderId }
  if (token) body.sessionToken = token
  return postJson(
    [
      '/api/meoo-ops-mp-recruitment-orders-delete',
      '/api/ops-sync/mp-recruitment-orders/delete',
    ],
    body,
    headers,
  ).then((res) => {
    registryCache.removeMpOrder(String(mpOrderId || '').trim())
    return res
  })
}

function patchMpRecruitmentOrder(body) {
  const id = String((body && body.id) || '').trim()
  if (!id) return Promise.reject(new Error('参数无效'))
  return postJson(
    [
      '/api/meoo-ops-mp-recruitment-orders-patch',
      '/api/ops-sync/mp-recruitment-orders/patch',
    ],
    body,
  ).then((res) => {
    if (body.order) registryCache.patchMpOrder(id, body.order)
    else registryCache.patchMpOrder(id, body)
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

function patchPrWorkflow(mp, patch, status) {
  if (!mp || !mp.id) return Promise.reject(new Error('参数无效'))
  return postJson(
    [
      '/api/meoo-ops-mp-recruitment-orders-patch',
      '/api/ops-sync/mp-recruitment-orders/patch',
    ],
    prWorkflow.buildPrWorkflowOrderPatch(mp, patch, status),
  ).then((res) => {
    registryCache.patchMpOrder(String(mp.id), {
      mpPublishMeta: Object.assign({}, mp.mpPublishMeta || {}, {
        prWorkflow: Object.assign({}, (mp.mpPublishMeta && mp.mpPublishMeta.prWorkflow) || {}, patch),
      }),
      ...(status ? { status } : {}),
    })
    return res
  })
}

module.exports = {
  updateMpRecruitmentOrder,
  deleteMpRecruitmentOrder,
  patchMpRecruitmentOrder,
  patchMpRecruitmentOrderStatus,
  patchSelectedApplicantIds,
  patchGroupQrImage,
  patchPrWorkflow,
}
