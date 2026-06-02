const { merchantRequest } = require('./merchantApi.js')
const registryCache = require('./registryCache.js')
const registryCs = require('./registryCsGateway.js')

/** 某条路径失败时是否尝试下一条（404、网络 reset、超时等） */
function isRetryableRegistryError(msg) {
  return /404|not_found|reset|errcode:-101|cronet|timeout|超时|request:fail|download:fail|网络异常|registry_rest/i.test(
    String(msg || ''),
  )
}

async function fetchRegistryViaErpApi() {
  const paths = [
    '/api/meoo-ops-mp-hall-registry',
    '/api/meoo-ops-sync-registry',
    '/api/ops-sync/registry',
  ]
  let lastErr
  for (const path of paths) {
    try {
      const data = await merchantRequest('GET', path)
      registryCache.save(data, path)
      return data
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!isRetryableRegistryError(msg)) throw e
      console.warn('[mp] fetchRegistry erp-api retry next path after:', path, msg.slice(0, 120))
    }
  }
  throw lastErr || new Error('erp-api 无法拉取招募大厅')
}

async function fetchRegistry() {
  const attempts = []

  // 1) 直连 ECS erp-api（config.release MERCHANT_API_BASE_URL）
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

  // 2) Vercel cs 网关（服务端 node:https 代拉 ECS，规避手机对根域 reset）
  try {
    const data = await registryCs.fetchHallRegistryViaCsGateway()
    registryCache.save(data, 'cs:meoo-ops-mp-hall-registry')
    return data
  } catch (e) {
    attempts.push(`[cs] ${String(e && e.message ? e.message : e).slice(0, 200)}`)
    console.warn('[mp] fetchRegistry cs gateway failed', attempts[attempts.length - 1])
  }

  const cached = registryCache.load({ allowStale: true })
  if (cached && cached.data) {
    const when = registryCache.formatSavedAt(cached.savedAt)
    const ageHint = registryCache.formatAgeHint(cached.ageMs)
    const err = new Error(
      cached.stale
        ? `网络暂不可用，已使用 ${when}（${ageHint}）的离线缓存，数据可能不是最新`
        : `网络暂不可用，已使用 ${when} 的缓存数据`,
    )
    err.fromCache = true
    err.cacheStale = Boolean(cached.stale)
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
      return await merchantRequest('POST', path, { mpOrderId, applicant })
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
      return await merchantRequest('POST', path, { member })
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
      return await merchantRequest('POST', path, { prUser })
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
      return await merchantRequest('POST', path, { mpOrderId, applicantId, douyinPublishUrl })
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
      return await merchantRequest('POST', path, { mpOrderId, applicantId, action })
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
      return await merchantRequest('POST', path, { order })
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
      return await merchantRequest('POST', path, { entries })
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
