const api = require('./api.js')
const auth = require('./auth.js')
const accountMemberSync = require('./accountMemberSync.js')
const applicationsStore = require('./applicationsStore.js')
const registryCache = require('./registryCache.js')
const { withTimeout } = require('./fetchTimeout.js')
const { normalizeHallPayload } = require('./hallRegistryParse.js')

/** 与云函数 registry 45s、客户端 cloudEcs 50s 对齐，减轻慢网误落缓存 */
const REGISTRY_FETCH_MS = 50000

function isRetryableRegistryErr(e) {
  const msg = String((e && e.message) || e || '')
  return /超时|timeout|reset|errcode:-101|cronet|cloud:callFunction|request:fail/i.test(msg)
}

function attachStaleMeta(data, ageMs, attempts) {
  return {
    ...data,
    _registryStale: true,
    _registryCacheAgeMs: ageMs,
    _registryFetchAttempts: attempts,
  }
}

function hasMpOrders(data) {
  const mp = data && data.mpRecruitmentOrders
  return Array.isArray(mp) && mp.length > 0
}
const HALL_GET = '/api/meoo-ops-mp-hall-registry'
const HALL_POST = '/api/meoo-ops-mp-auth'

function useCacheIfHallEmpty(data) {
  const mp = data && data.mpRecruitmentOrders
  if (Array.isArray(mp) && mp.length > 0) return data
  const cached = registryCache.load({ allowStale: true })
  const prevMp = cached && cached.data && cached.data.mpRecruitmentOrders
  if (Array.isArray(prevMp) && prevMp.length > 0) {
    console.warn('[mp] hall_registry 空响应，使用本地缓存', prevMp.length)
    return cached.data
  }
  return data
}

function collectIncludeMpOrderIds(extraIds) {
  const ids = new Set()
  for (const a of applicationsStore.readApplications()) {
    const id = String(a && a.mpOrderId ? a.mpOrderId : '').trim()
    if (id) ids.add(id)
  }
  for (const p of applicationsStore.readPublishedOrders()) {
    const id = String(p && p.mpOrderId ? p.mpOrderId : '').trim()
    if (id) ids.add(id)
  }
  for (const id of extraIds || []) {
    const s = String(id || '').trim()
    if (s) ids.add(s)
  }
  return [...ids].slice(0, 120)
}

async function fetchRegistryOnce(includeMpOrderIds) {
  try {
    const raw = await withTimeout(
      api.post(HALL_POST, { action: 'hall_registry', includeMpOrderIds }, registerAuthHeaders()),
      REGISTRY_FETCH_MS,
      '招募大厅',
    )
    return useCacheIfHallEmpty(normalizeHallPayload(raw))
  } catch (e) {
    console.warn('[mp] hall_registry POST failed', String(e.message || e).slice(0, 160))
    const raw = await withTimeout(api.get(HALL_GET), REGISTRY_FETCH_MS, '招募大厅')
    return useCacheIfHallEmpty(normalizeHallPayload(raw))
  }
}

async function fetchRegistryViaErpApi(opts) {
  const includeMpOrderIds = collectIncludeMpOrderIds(opts && opts.includeMpOrderIds)
  let lastErr
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const data = await fetchRegistryOnce(includeMpOrderIds)
      registryCache.save(data, attempt === 0 ? `${HALL_POST}:hall_registry` : `${HALL_GET}:retry`)
      return data
    } catch (e) {
      lastErr = e
      if (attempt === 0 && isRetryableRegistryErr(e)) {
        await new Promise((r) => setTimeout(r, 600))
        continue
      }
      break
    }
  }
  throw lastErr || new Error('hall_fetch_failed')
}

async function fetchRegistry(opts) {
  const attempts = []
  let lastErr
  try {
    const data = await fetchRegistryViaErpApi(opts)
    registryCache.save(data, 'erp-api:hall-registry')
    return data
  } catch (e) {
    lastErr = e
    attempts.push(`[erp-api] ${String(e && e.message ? e.message : e).slice(0, 200)}`)
    console.warn('[mp] fetchRegistry erp-api failed', attempts[attempts.length - 1])
  }

  const cached = registryCache.load({ allowStale: true })
  if (cached && cached.data && hasMpOrders(cached.data)) {
    console.warn('[mp] fetchRegistry 使用本地缓存', cached.ageMs)
    return attachStaleMeta(cached.data, cached.ageMs, attempts)
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

function registerAuthHeaders() {
  try {
    return auth.authHeaders()
  } catch (_) {
    return {}
  }
}

async function registerTalentMember(member) {
  const headers = registerAuthHeaders()
  const account = auth.readAccount()
  const payload = accountMemberSync.mergeMemberForCloudRegister(member, account)
  const paths = [
    '/api/meoo-ops-mp-talent-member-register',
    '/api/ops-sync/mp-talent-members/register',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { member: payload }, headers)
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('会员注册接口不可用')
}

async function registerPrUser(prUser) {
  const headers = registerAuthHeaders()
  const paths = [
    '/api/meoo-ops-mp-pr-user-register',
    '/api/ops-sync/mp-pr-users/register',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { prUser }, headers)
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
