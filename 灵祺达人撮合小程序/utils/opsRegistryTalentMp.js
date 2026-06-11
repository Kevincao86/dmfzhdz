const api = require('./api.js')
const auth = require('./auth.js')
const userProfile = require('./userProfile.js')
const accountMemberSync = require('./accountMemberSync.js')
const applicationsStore = require('./applicationsStore.js')
const registryCache = require('./registryCache.js')
const { normalizeHallPayload } = require('./hallRegistryParse.js')

function isRetryableRegistryErr(e) {
  const msg = String((e && e.message) || e || '')
  return /超时|timeout|reset|errcode:-101|cronet|cloud:callFunction|request:fail|cloud_proxy/i.test(msg)
}

function hasMpOrders(data) {
  const mp = data && data.mpRecruitmentOrders
  return Array.isArray(mp) && mp.length > 0
}

function findMpOrderInRegistry(reg, mpOrderId) {
  const id = String(mpOrderId || '').trim()
  if (!id || !reg) return null
  const list = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  return list.find((o) => o && String(o.id) === id) || null
}

function resolveIncludeMpOrderIds(opts) {
  const explicit = []
  for (const id of (opts && opts.includeMpOrderIds) || []) {
    const s = String(id || '').trim()
    if (s) explicit.push(s)
  }
  if (opts && (opts.includeLocalContext || opts.includePrOwned)) {
    return collectIncludeMpOrderIds(explicit)
  }
  return [...new Set(explicit)].slice(0, 120)
}

function registryRequestKey(opts) {
  const ids = resolveIncludeMpOrderIds(opts)
  const prOwned = opts && opts.includePrOwned ? 'pr' : ''
  const ctx = opts && opts.includeLocalContext ? 'ctx' : ''
  const recommend = opts && opts.includeRecommendPool ? 'recommend' : ''
  if (ids.length) return `inc:${ids.slice().sort().join(',')}${ctx ? ':ctx' : ''}`
  if (prOwned) return 'pr-owned'
  if (recommend) return 'recommend-pool'
  return ctx ? 'hall-ctx' : 'hall'
}

/** 仅合并同一时刻的并行请求，不跳过轻量拉取 */
const inflightByKey = new Map()

const HALL_GET = '/api/meoo-ops-mp-hall-registry'
const HALL_POST = '/api/meoo-ops-mp-auth'

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

/**
 * 拉取大厅注册表。
 * 优先 GET：mpErpProxy 对 GET 有多路上游重试；POST 为单次（避免 wx code 重试），不宜放首位。
 * 超时仅由 cloudEcs（50s）一层控制，避免双层 withTimeout 误杀。
 */
async function fetchRegistryOnce(opts) {
  const includeMpOrderIds = resolveIncludeMpOrderIds(opts)
  const includePrOwned = !!(opts && opts.includePrOwned)
  const includeRecommendPool = !!(opts && opts.includeRecommendPool)
  let lastErr
  if (!includePrOwned && !includeMpOrderIds.length && !(opts && opts.includeLocalContext)) {
    try {
      const hallPath = includeRecommendPool ? `${HALL_GET}?includeRecommendPool=1` : HALL_GET
      const raw = await api.get(hallPath)
      return normalizeHallPayload(raw)
    } catch (e) {
      lastErr = e
      console.warn('[mp] hall_registry GET failed', String(e.message || e).slice(0, 200))
    }
  }
  try {
    const body = { action: 'hall_registry', includeMpOrderIds }
    if (includePrOwned) {
      body.includePrOwned = true
      const acc = auth.readAccount()
      const pr = userProfile.readPrProfile()
      body.lingqiPrId = String((acc && acc.lingqiPrId) || (pr && pr.lingqiPrId) || '').trim()
      body.registryPrId = String(
        (acc && (acc.registryPrId || acc.registryMemberId)) || (pr && pr.id) || '',
      ).trim()
    }
    if (includeRecommendPool) body.includeRecommendPool = true
    const raw = await api.post(HALL_POST, body, registerAuthHeaders())
    return normalizeHallPayload(raw)
  } catch (e2) {
    const msg = String(e2 && e2.message ? e2.message : e2)
    console.warn('[mp] hall_registry POST failed', msg.slice(0, 200))
    throw lastErr || e2 || new Error(msg || 'hall_fetch_failed')
  }
}

async function fetchRegistryViaErpApi(opts) {
  let lastErr
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const data = await fetchRegistryOnce(opts)
      registryCache.save(data, attempt === 0 ? HALL_GET : `${HALL_POST}:retry`)
      return data
    } catch (e) {
      lastErr = e
      if (attempt === 0 && isRetryableRegistryErr(e)) {
        await new Promise((r) => setTimeout(r, 400))
        continue
      }
      break
    }
  }
  throw lastErr || new Error('hall_fetch_failed')
}

function readRegistryCache() {
  const cached = registryCache.load({ allowStale: true })
  return cached && cached.data ? cached.data : null
}

async function fetchRegistryFromServer(opts) {
  const data = await fetchRegistryViaErpApi(opts)
  registryCache.save(data, 'erp-api:hall-registry')
  return data
}

/**
 * 始终优先请求轻量 ECS；仅当云函数/接口彻底失败时才回退本地缓存。
 * 并行重复请求合并为一次，避免打爆云函数。
 */
async function fetchRegistry(opts) {
  const key = registryRequestKey(opts)
  const pending = inflightByKey.get(key)
  if (pending) return pending

  const task = (async () => {
    try {
      return await fetchRegistryFromServer(opts)
    } catch (e) {
      console.warn('[mp] fetchRegistry server failed', String(e && e.message ? e.message : e).slice(0, 240))
      const cached = readRegistryCache()
      if (cached && hasMpOrders(cached)) {
        console.warn('[mp] fetchRegistry use cache after server fail')
        return cached
      }
      throw e
    }
  })().finally(() => {
    if (inflightByKey.get(key) === task) inflightByKey.delete(key)
  })
  inflightByKey.set(key, task)
  return task
}

async function applyToMpOrder(mpOrderId, applicant, workIdentity, claimSlotCount) {
  const paths = [
    '/api/meoo-ops-mp-recruitment-orders-apply',
    '/api/ops-sync/mp-recruitment-orders/apply',
  ]
  const body = { mpOrderId, applicant }
  const wid = String(workIdentity || '').trim()
  if (wid) body.workIdentity = wid
  if (claimSlotCount != null) {
    const n = Number.parseInt(String(claimSlotCount), 10)
    if (Number.isFinite(n) && n > 0) body.claimSlotCount = n
  }
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, body)
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('报名接口不可用')
}

async function submitEditDeliverLinks(mpOrderId, applicantId, deliverText) {
  const paths = [
    '/api/meoo-ops-mp-recruitment-edit-deliver-submit',
    '/api/ops-sync/mp-recruitment-edit-deliver-submit',
  ]
  let lastErr
  for (const path of paths) {
    try {
      return await api.post(path, { mpOrderId, applicantId, deliverText })
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('成片回传接口不可用')
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
  findMpOrderInRegistry,
  readRegistryCache,
  applyToMpOrder,
  submitEditDeliverLinks,
  registerTalentMember,
  registerPrUser,
  submitIceDouyin,
  confirmIceTask,
  appendMpRecruitmentOrder,
  appendTalentInbox,
}
