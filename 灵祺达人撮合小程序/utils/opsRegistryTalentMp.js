const api = require('./api.js')
const registryCache = require('./registryCache.js')
const { withTimeout } = require('./fetchTimeout.js')
const { normalizeHallPayload } = require('./hallRegistryParse.js')

const REGISTRY_FETCH_MS = 20000
const HALL_GET = '/api/meoo-ops-mp-hall-registry'
const HALL_POST = '/api/meoo-ops-mp-auth'

async function fetchRegistryViaErpApi() {
  let lastErr
  try {
    const raw = await withTimeout(
      api.post(HALL_POST, { action: 'hall_registry' }),
      REGISTRY_FETCH_MS,
      '招募大厅',
    )
    const data = normalizeHallPayload(raw)
    registryCache.save(data, `${HALL_POST}:hall_registry`)
    return data
  } catch (e) {
    lastErr = e
    console.warn('[mp] hall_registry POST failed', String(e.message || e).slice(0, 160))
  }
  try {
    const raw = await withTimeout(api.get(HALL_GET), REGISTRY_FETCH_MS, '招募大厅')
    const data = normalizeHallPayload(raw)
    registryCache.save(data, HALL_GET)
    return data
  } catch (e2) {
    const msg = String(e2 && e2.message ? e2.message : e2)
    throw lastErr || e2 || new Error(msg || 'hall_fetch_failed')
  }
}

async function fetchRegistry() {
  const attempts = []
  let lastErr
  try {
    const data = await fetchRegistryViaErpApi()
    registryCache.save(data, 'erp-api:hall-registry')
    return data
  } catch (e) {
    lastErr = e
    attempts.push(`[erp-api] ${String(e && e.message ? e.message : e).slice(0, 200)}`)
    console.warn('[mp] fetchRegistry erp-api failed', attempts[attempts.length - 1])
  }

  const cached = registryCache.load({ allowStale: true })
  if (cached && cached.data) {
    const err = new Error('已使用本地缓存')
    err.fromCache = true
    err.cachedData = cached.data
    err.attempts = attempts
    throw err
  }
  const err = lastErr || new Error('无法拉取招募大厅数据')
  err.attempts = attempts
  throw err
}

async function applyToMpOrder(mpOrderId, applicant) {
  const paths = [
    '/api/meoo-ops-mp-recruitment-orders-apply',
    '/api/ops-sync/mp-recruitment-orders/apply',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { mpOrderId, applicant })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('报名接口不可用')
}

async function registerTalentMember(member) {
  const paths = [
    '/api/meoo-ops-mp-talent-member-register',
    '/api/ops-sync/mp-talent-members/register',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { member })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('会员注册接口不可用')
}

async function registerPrUser(prUser) {
  const paths = [
    '/api/meoo-ops-mp-pr-user-register',
    '/api/ops-sync/mp-pr-users/register',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { prUser })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('PR 注册接口不可用')
}

async function submitIceDouyin(mpOrderId, applicantId, douyinPublishUrl) {
  const paths = [
    '/api/meoo-ops-mp-recruitment-ice-submit',
    '/api/ops-sync/mp-recruitment-orders/ice-submit',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { mpOrderId, applicantId, douyinPublishUrl })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('云剪回传接口不可用')
}

async function confirmIceTask(mpOrderId, applicantId, action) {
  const paths = [
    '/api/meoo-ops-mp-recruitment-ice-confirm',
    '/api/ops-sync/mp-recruitment-orders/ice-confirm',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { mpOrderId, applicantId, action })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('云剪确认接口不可用')
}

async function appendMpRecruitmentOrder(order) {
  const paths = [
    '/api/meoo-ops-mp-recruitment-orders-append',
    '/api/ops-sync/mp-recruitment-orders/append',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { order })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('发单接口不可用')
}

async function appendTalentInbox(entries) {
  const paths = [
    '/api/meoo-ops-mp-talent-inbox-append',
    '/api/ops-sync/mp-talent-inbox/append',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { entries })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('站内信接口不可用')
}

module.exports = {
  fetchRegistry,
  applyToMpOrder,
  registerTalentMember,
  registerPrUser,
  submitIceDouyin,
  confirmIceTask,
  appendMpRecruitmentOrder,
  appendTalentInbox,
}
