/**
 * 首页招募大厅加载：优先轻量 ECS，失败才用本地缓存
 */
const api = require('./api.js')
const { showDemoOrders } = require('./mpDemoMode.js')
const ops = require('./opsRegistryTalentMp.js')
const registryCache = require('./registryCache.js')
const listFilters = require('./recruitmentListFilters.js')
const hallFilters = require('./recruitmentHallFilters.js')
const orderCard = require('./recruitmentOrderCard.js')
const hallIdentity = require('./hallIdentityBuckets.js')
const userProfile = require('./userProfile.js')

function errHint(msg) {
  const m = String(msg || '')
  if (/timeout|超时|云函数超时/i.test(m)) return '加载超时，请下拉刷新'
  if (/url not in domain list|合法域名/i.test(m)) return '网络配置异常，请联系管理员'
  if (/reset|errcode:-101|cronet|cloud:callFunction|500|cloud_proxy/i.test(m)) {
    return '无法连接轻量服务器，请下拉刷新'
  }
  if (/云开发未就绪|MP_CLOUD_ENV/i.test(m)) return '云开发未配置，请检查 MP_CLOUD_ENV'
  if (/1048576|response size exceeded/i.test(m)) return '大厅数据过大，请稍后下拉刷新'
  return m.slice(0, 120) || '加载失败，请下拉刷新'
}

function mapRegistryToRows(reg, identity) {
  const workIdentity = identity || userProfile.readIdentity()
  let mapped = []
  try {
    mapped = orderCard.loadAllOrderRows(reg)
  } catch (e) {
    console.warn('[hallLoad] loadAllOrderRows failed', e)
  }
  const buckets = hallIdentity.bucketOrdersForIdentity(mapped, workIdentity, {
    allowDemo: showDemoOrders(),
  })
  const identityPool = mapped.filter((r) => hallIdentity.orderMatchesIdentity(r, workIdentity))
  const todayCount = identityPool.filter((r) => r && r.isPublishedToday).length
  return {
    ...buckets,
    workIdentity,
    cityFilters: hallFilters.buildCityFilterOptions(identityPool),
    todayCount,
  }
}

/**
 * @param {WechatMiniprogram.Page.Instance} page
 */
async function loadHallList(page) {
  const seq = (page._hallLoadSeq = (page._hallLoadSeq || 0) + 1)

  const finish = (patch) => {
    if (page._hallLoadSeq !== seq) return
    const base = {
      loading: false,
      unconfigured: false,
      err: '',
      normalRows: [],
      urgentRows: [],
      shootRows: [],
      editRows: [],
      iceRows: [],
      displayRows: [],
    }
    page.setData({ ...base, ...patch })
    if (typeof page.applyFilters === 'function') page.applyFilters()
  }

  const applyRows = (patch) => {
    if (page._hallLoadSeq !== seq) return
    page.setData({ loading: false, err: '', ...patch })
    if (typeof page.applyFilters === 'function') page.applyFilters()
  }

  if (!api.hasApi()) {
    const demo = showDemoOrders() ? listFilters.mergeHallDisplayRows([], { allowDemo: true }) : []
    finish({
      unconfigured: true,
      normalRows: demo,
      cityFilters: hallFilters.buildCityFilterOptions(demo),
      err: demo.length ? '' : '未连接后台',
    })
    return
  }

  page.setData({ loading: true, err: '' })

  const cached = registryCache.load({ allowStale: true })
  if (cached && cached.data && (cached.data.mpRecruitmentOrders || []).length) {
    try {
      page._lastHallRegistry = cached.data
      applyRows(mapRegistryToRows(cached.data))
    } catch (e) {
      console.warn('[hallLoad] stale cache render failed', e)
    }
  }

  try {
    const reg = await ops.fetchRegistry()
    if (page._hallLoadSeq !== seq) return
    page._lastHallRegistry = reg
    applyRows(mapRegistryToRows(reg))
  } catch (e) {
    if (page._hallLoadSeq !== seq) return
    const stale = registryCache.load({ allowStale: true })
    if (stale && stale.data && (stale.data.mpRecruitmentOrders || []).length) {
      try {
        applyRows(mapRegistryToRows(stale.data))
        return
      } catch (_) {}
    }
    finish({ err: errHint(e && e.message ? e.message : e) })
  }
}

module.exports = { loadHallList, mapRegistryToRows }
