const api = require('./api.js')
const { merchantRequestAuth } = require('./merchantApi.js')

const CACHE_TTL_MS = 45000
let _cache = null
let _cacheAt = 0

function authOpts(extra) {
  const bearerToken = api.getBearerToken()
  return Object.assign({ bearerToken }, extra || {})
}

function invalidateRegistryCache() {
  _cache = null
  _cacheAt = 0
}

/**
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<any>} 完整注册表 JSON（含 recruitmentOrders）
 */
async function fetchRegistry(opts) {
  const force = Boolean(opts && opts.force)
  const now = Date.now()
  if (!force && _cache && now - _cacheAt < CACHE_TTL_MS) return _cache
  const data = await merchantRequestAuth('GET', '/api/ops-sync/registry', authOpts())
  _cache = data && typeof data === 'object' ? data : {}
  _cacheAt = now
  return _cache
}

/**
 * 与 Web `appendRecruitmentOrderToOps` 一致：追加一条招募订单到共享注册表。
 * @param {Record<string, unknown>} order RegistryRecruitmentOrder 形状
 */
async function appendRecruitmentOrder(order) {
  invalidateRegistryCache()
  return merchantRequestAuth('POST', '/api/ops-sync/recruitment-orders/append', authOpts({ data: { order } }))
}

async function setTalentPoolCandidates(candidates) {
  const paths = ['/api/meoo-ops-talent-pool-set', '/api/ops-sync/talent-pool/set']
  let lastErr = ''
  invalidateRegistryCache()
  for (const path of paths) {
    try {
      return await merchantRequestAuth('POST', path, authOpts({ data: { candidates } }))
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr || 'talent-pool/set 失败')
}

async function setRecruitmentScheduleRows(rows) {
  const paths = ['/api/meoo-ops-recruitment-schedule-set', '/api/ops-sync/recruitment-schedule/set']
  let lastErr = ''
  invalidateRegistryCache()
  for (const path of paths) {
    try {
      return await merchantRequestAuth('POST', path, authOpts({ data: { rows } }))
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr || 'schedule/set 失败')
}

async function setRecruitmentVideoSubmissions(videos) {
  invalidateRegistryCache()
  return merchantRequestAuth(
    'POST',
    '/api/ops-sync/recruitment-videos/set',
    authOpts({ data: { videos } }),
  )
}

module.exports = {
  fetchRegistry,
  invalidateRegistryCache,
  appendRecruitmentOrder,
  setTalentPoolCandidates,
  setRecruitmentScheduleRows,
  setRecruitmentVideoSubmissions,
}
