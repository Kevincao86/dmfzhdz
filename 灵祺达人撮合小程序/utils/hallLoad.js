const api = require('./api.js')
const { showDemoOrders } = require('./mpDemoMode.js')
const ops = require('./opsRegistryTalentMp.js')
const registryCache = require('./registryCache.js')
const listFilters = require('./recruitmentListFilters.js')
const hallFilters = require('./recruitmentHallFilters.js')
const orderCard = require('./recruitmentOrderCard.js')
const hallIdentity = require('./hallIdentityBuckets.js')
const userProfile = require('./userProfile.js')

/** 切 Tab 直接用这份内存，不挡渲染 */
const TAB_FRESH_MS = 5 * 60 * 1000

const mem = {
  hall: null,
  hallAt: 0,
  rec: null,
  recAt: 0,
  hallInflight: null,
  recInflight: null,
}

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

function remember(reg, recommendPool) {
  if (!reg) return
  const now = Date.now()
  if (recommendPool) {
    mem.rec = reg
    mem.recAt = now
  } else {
    mem.hall = reg
    mem.hallAt = now
  }
}

function peekRegistry(recommendPool) {
  const data = recommendPool ? mem.rec : mem.hall
  const at = recommendPool ? mem.recAt : mem.hallAt
  if (data && Date.now() - at < TAB_FRESH_MS) {
    return { data, fresh: true }
  }
  const disk = registryCache.load({ allowStale: true, recommendPool: !!recommendPool })
  if (disk && disk.data) {
    remember(disk.data, recommendPool)
    return { data: disk.data, fresh: disk.stale !== true }
  }
  return null
}

function warmupHallRegistry(opts) {
  const recommendPool = !!(opts && opts.includeRecommendPool)
  const existing = recommendPool ? mem.recInflight : mem.hallInflight
  if (existing) return existing
  const task = ops
    .fetchRegistry(opts || {})
    .then((reg) => {
      remember(reg, recommendPool)
      return reg
    })
    .finally(() => {
      if (recommendPool) mem.recInflight = null
      else mem.hallInflight = null
    })
  if (recommendPool) mem.recInflight = task
  else mem.hallInflight = task
  return task
}

async function resolveHallRegistry(opts) {
  const force = !!(opts && opts.force)
  const recommendPool = !!(opts && opts.includeRecommendPool)
  if (!force) {
    const hit = peekRegistry(recommendPool)
    if (hit && hit.fresh) return hit.data
    if (hit) {
      void warmupHallRegistry(opts)
      return hit.data
    }
  }
  return warmupHallRegistry(opts)
}

/**
 * @param {WechatMiniprogram.Page.Instance} page
 * @param {{ force?: boolean }} [opts]
 */
async function loadHallList(page, opts) {
  const force = !!(opts && opts.force)
  const seq = (page._hallLoadSeq = (page._hallLoadSeq || 0) + 1)
  const identity = userProfile.readIdentity()
  const hasRows = Array.isArray(page.data.displayRows) && page.data.displayRows.length > 0

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

  const applyRows = (reg) => {
    if (page._hallLoadSeq !== seq || !reg) return
    if (!force && page._lastHallRegistry === reg && hasRows && page._lastHallMappedIdentity === identity) {
      return
    }
    page._lastHallRegistry = reg
    page._lastHallMappedIdentity = identity
    page.setData({ loading: false, err: '', ...mapRegistryToRows(reg, identity) })
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

  const cached = peekRegistry(false)
  if (cached && cached.data) {
    applyRows(cached.data)
    if (!force && cached.fresh) return
    if (!force) {
      void warmupHallRegistry()
        .then((reg) => applyRows(reg))
        .catch(() => {})
      return
    }
  } else if (!hasRows) {
    page.setData({ loading: true, err: '' })
  }

  try {
    const reg = await resolveHallRegistry({ force })
    applyRows(reg)
  } catch (e) {
    if (page._hallLoadSeq !== seq) return
    const stale = peekRegistry(false)
    if (stale && stale.data) {
      applyRows(stale.data)
      return
    }
    finish({ err: errHint(e && e.message ? e.message : e) })
  }
}

module.exports = {
  loadHallList,
  mapRegistryToRows,
  warmupHallRegistry,
  resolveHallRegistry,
  peekRegistry,
}
