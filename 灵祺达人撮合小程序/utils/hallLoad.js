/**
 * 首页招募大厅加载：统一结束 loading，避免未捕获异常导致一直转圈
 */
const api = require('./api.js')
const { showDemoOrders } = require('./mpDemoMode.js')
const ops = require('./opsRegistryTalentMp.js')
const registryCache = require('./registryCache.js')
const listFilters = require('./recruitmentListFilters.js')
const hallFilters = require('./recruitmentHallFilters.js')
const orderCard = require('./recruitmentOrderCard.js')

const LOAD_MS = 22000
const WATCHDOG_MS = 14000

function errHint(msg) {
  const m = String(msg || '')
  if (/timeout|超时|云函数超时/i.test(m)) return '加载超时，请下拉刷新'
  if (/url not in domain list|合法域名/i.test(m)) return '网络配置异常，请联系管理员'
  if (/reset|errcode:-101|cronet|cloud:callFunction/i.test(m)) return '网络不稳定，请下拉刷新'
  if (/云开发未就绪|MP_CLOUD_ENV/i.test(m)) return '云开发未配置，请检查 MP_CLOUD_ENV'
  return m.slice(0, 120) || '加载失败，请下拉刷新'
}

function mapRegistryToRows(reg) {
  const mpList = Array.isArray(reg && reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const openList = mpList.filter((o) => o && (o.status === 'open' || o.status === 'collecting'))
  const mapped = []
  for (const mp of openList) {
    try {
      mapped.push(orderCard.mapMpOrderRow(mp, reg))
    } catch (e) {
      console.warn('[hallLoad] skip bad order', mp && mp.id, e)
    }
  }
  const iceRows = mapped.filter((r) => r.isIce)
  const urgentRows = mapped.filter((r) => r.urgent && !r.isIce)
  const hallNonIce = mapped.filter((r) => !r.isIce)
  const normalRows = listFilters.mergeHallDisplayRows(hallNonIce, {
    allowDemo: showDemoOrders(),
  })
  return {
    normalRows,
    urgentRows,
    iceRows,
    cityFilters: hallFilters.buildCityFilterOptions(mapped),
    todayCount: openList.length,
  }
}

/**
 * @param {WechatMiniprogram.Page.Instance} page
 */
async function loadHallList(page) {
  const seq = (page._hallLoadSeq = (page._hallLoadSeq || 0) + 1)
  let watchdog = null

  const stopWatchdog = () => {
    if (watchdog) {
      clearTimeout(watchdog)
      watchdog = null
    }
  }

  const finish = (patch) => {
    if (page._hallLoadSeq !== seq) return
    stopWatchdog()
    const base = {
      loading: false,
      unconfigured: false,
      err: '',
      normalRows: [],
      urgentRows: [],
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

  const hadRows =
    (page.data.normalRows && page.data.normalRows.length) ||
    (page.data.displayRows && page.data.displayRows.length)
  page.setData({ loading: true, err: '' })

  const offline = registryCache.load({ allowStale: true })
  const offlineMp = offline && offline.data && offline.data.mpRecruitmentOrders
  let showedOffline = false
  if (offline && offline.data && Array.isArray(offlineMp) && offlineMp.length > 0) {
    showedOffline = true
    try {
      applyRows(mapRegistryToRows(offline.data))
    } catch (_) {
      showedOffline = false
    }
  }

  watchdog = setTimeout(() => {
    if (page._hallLoadSeq !== seq) return
    if (!page.data.loading) return
    const stale = registryCache.load({ allowStale: true })
    if (stale && stale.data && (stale.data.mpRecruitmentOrders || []).length) {
      try {
        applyRows({ ...mapRegistryToRows(stale.data), err: '加载较慢，已显示缓存' })
        return
      } catch (_) {}
    }
    if (hadRows || showedOffline) {
      applyRows({ err: '加载超时，请下拉刷新' })
      return
    }
    finish({ err: '加载超时，请下拉刷新' })
  }, WATCHDOG_MS)

  try {
    let reg
    try {
      reg = await Promise.race([
        ops.fetchRegistry(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`招募大厅超时（${LOAD_MS / 1000}s）`)), LOAD_MS),
        ),
      ])
    } catch (e) {
      if (e && e.fromCache && e.cachedData) {
        reg = e.cachedData
      } else {
        throw e
      }
    }
    if (page._hallLoadSeq !== seq) return
    applyRows(mapRegistryToRows(reg))
  } catch (e) {
    if (page._hallLoadSeq !== seq) return
    if (showedOffline || hadRows) {
      applyRows({ err: errHint(e && e.message ? e.message : e) || '刷新失败，请下拉重试' })
      return
    }
    const stale = registryCache.load({ allowStale: true })
    if (stale && stale.data && (stale.data.mpRecruitmentOrders || []).length) {
      try {
        applyRows({ ...mapRegistryToRows(stale.data), err: '网络不稳定，已显示缓存' })
        return
      } catch (_) {}
    }
    finish({ err: errHint(e && e.message ? e.message : e) })
  }
}

module.exports = { loadHallList, mapRegistryToRows, WATCHDOG_MS }
