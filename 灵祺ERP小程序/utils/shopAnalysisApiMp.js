/**
 * 店铺分析 — 与 CS Web `meoo-shop-analysis-summary` / `meoo-shop-analysis-ai` 同源
 */
const api = require('./api.js')
const merchantApi = require('./merchantApi.js')
const { readPlatformToken } = require('./platformTokensMp.js')
const feat = require('./merchantFeatureApisMp.js')
const sessionSync = require('./merchantSessionSyncMp.js')

const MP_RECHARGE_POINTS_PER_YUAN = 40

/** 与 CS shopAnalysisAiPointsFromGross 一致 */
function shopAnalysisAiPointsFromGross(estimatedGrossYuan) {
  const gross = Math.max(0, Number(estimatedGrossYuan) || 0)
  if (gross <= 0) return 25
  const feeYuan = Math.min(3, Math.max(0.375, gross * 0.00002))
  return Math.max(15, Math.min(120, Math.ceil(feeYuan * MP_RECHARGE_POINTS_PER_YUAN)))
}

/** 与 CS marginPercentForFinancePlatform 对齐：按分析平台取毛利率 */
function marginPercentForPlatform(platform) {
  const m = feat.readMargins() || {}
  const p = String(platform || 'douyin').trim()
  if (p === 'meituan') return Number(m.meituan) || 0
  if (p === 'xhs' || p === 'xiaohongshu') return Number(m.xhs) || 0
  return Number(m.douyin) || 0
}

function shanghaiTodayYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function addDaysYmd(ymd, delta) {
  const ms = new Date(`${ymd}T12:00:00+08:00`).getTime() + delta * 86400000
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function defaultRange() {
  const end = shanghaiTodayYmd()
  return { startDate: addDaysYmd(end, -29), endDate: end }
}

function tenantIdHint() {
  try {
    return String(wx.getStorageSync(sessionSync.MEOO_ACTIVE_TENANT_ID) || '').trim()
  } catch (_) {
    return ''
  }
}

function eachShopSyncChunks(startYmd, endYmd) {
  const out = []
  let cur = startYmd
  let guard = 0
  while (cur <= endYmd && guard++ < 80) {
    const chunkEnd = addDaysYmd(cur, 2)
    const end = chunkEnd > endYmd ? endYmd : chunkEnd
    out.push({ start: cur, end })
    if (end >= endYmd) break
    cur = addDaysYmd(end, 1)
  }
  return out
}

function authHeadersExtra() {
  const h = {}
  const dy = readPlatformToken('douyin')
  if (dy) h['X-Meoo-Douyin-Token'] = dy
  return h
}

function isTransientWxFail(errMsg) {
  return /interrupted|timeout|超时|TIMED_OUT|timed\s*out|ECONNRESET|fail net/i.test(String(errMsg || ''))
}

function friendlyShopNetError(errMsg) {
  const em = String(errMsg || '网络异常')
  if (/interrupted/i.test(em)) {
    return '分析请求被中断（网络不稳定或微信长请求限制）。请再点一次「店铺分析」；若仍失败可缩短日期区间。'
  }
  if (/timeout|超时|TIMED_OUT|timed\s*out/i.test(em)) {
    return '分析超时，请稍后重试或缩短日期区间'
  }
  return em.replace(/^request:fail\s*/i, '') || '网络异常'
}

function requestShop(method, path, data, timeoutMs) {
  const token = api.getBearerToken && api.getBearerToken()
  if (!token) return Promise.reject(new Error('请先登录后再使用店铺分析'))
  const b = merchantApi.baseUrl()
  if (!b) return Promise.reject(new Error('请配置商家后台 API 地址'))
  const url = `${b}${path.startsWith('/') ? path : `/${path}`}`
  const timeout = Math.max(10000, Number(timeoutMs) || 60000)
  const maxTry = method === 'GET' ? 2 : 1

  const once = () =>
    new Promise((resolve, reject) => {
      wx.request({
        url,
        method,
        enableHttp2: false,
        enableQuic: false,
        enableCache: false,
        header: Object.assign(
          {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Meoo-Access-Token': token,
          },
          authHeadersExtra(),
        ),
        data:
          method === 'GET'
            ? undefined
            : Object.assign({ access_token: token, tenantId: tenantIdHint() }, data || {}),
        timeout,
        success(res) {
          const body = res.data || {}
          if (res.statusCode >= 200 && res.statusCode < 300 && body.ok !== false) {
            resolve(body)
            return
          }
          const raw = body.message || body.detail || body.error || `请求失败 ${res.statusCode}`
          const msg =
            raw === 'unauthorized' || raw === 'invalid_token' || raw === 'missing_token'
              ? '登录凭证无效，请退出后重新登录'
              : raw
          reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
        },
        fail(err) {
          reject(new Error((err && err.errMsg) || '网络异常'))
        },
      })
    })

  const run = (attempt) =>
    once().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e)
      if (attempt < maxTry && isTransientWxFail(msg)) {
        return new Promise((r) => {
          setTimeout(() => r(run(attempt + 1)), 600 * attempt)
        })
      }
      if (isTransientWxFail(msg)) return Promise.reject(new Error(friendlyShopNetError(msg)))
      return Promise.reject(e instanceof Error ? e : new Error(msg))
    })

  return run(1)
}

async function fetchShopAnalysisSummary(opts) {
  const range = defaultRange()
  const startDate = opts.startDate || range.startDate
  const endDate = opts.endDate || range.endDate
  const platform = opts.platform || 'douyin'
  const marginPercent =
    typeof opts.marginPercent === 'number' && Number.isFinite(opts.marginPercent)
      ? opts.marginPercent
      : marginPercentForPlatform(platform)
  const q = [
    `startDate=${encodeURIComponent(startDate)}`,
    `endDate=${encodeURIComponent(endDate)}`,
    `platform=${encodeURIComponent(platform)}`,
    `marginPercent=${encodeURIComponent(String(marginPercent || 0))}`,
  ]
  if (opts.poiId) q.push(`poiId=${encodeURIComponent(opts.poiId)}`)
  const tid = tenantIdHint()
  if (tid) q.push(`tenantId=${encodeURIComponent(tid)}`)
  let data = await requestShop('GET', `/api/meoo-shop-analysis-summary?${q.join('&')}`)
  const empty =
    !data.summary ||
    (Number(data.summary.orderCount) || 0) === 0 &&
      (Number(data.summary.salesAmountYuan) || 0) === 0
  if (empty && platform !== 'all') {
    const qAll = q.map((s) => (s.startsWith('platform=') ? 'platform=all' : s))
    try {
      const allData = await requestShop('GET', `/api/meoo-shop-analysis-summary?${qAll.join('&')}`)
      if (allData.summary && (Number(allData.summary.orderCount) || 0) > 0) data = allData
    } catch (_) {}
  }
  return {
    ok: true,
    startDate,
    endDate,
    summary: data.summary || null,
    adviceFacts: data.adviceFacts || '',
  }
}

async function fetchShopAnalysisAi(opts) {
  const range = defaultRange()
  const platform = opts.platform || 'douyin'
  const marginPercent =
    typeof opts.marginPercent === 'number' && Number.isFinite(opts.marginPercent)
      ? opts.marginPercent
      : marginPercentForPlatform(platform)
  const body = {
    startDate: opts.startDate || range.startDate,
    endDate: opts.endDate || range.endDate,
    platform,
    marginPercent: marginPercent || 0,
  }
  if (opts.poiId) body.poiId = opts.poiId
  const tid = tenantIdHint()
  if (tid) body.tenantId = tid
  const data = await requestShop('POST', '/api/meoo-shop-analysis-ai', body, 180000)
  return {
    ok: true,
    summary: data.summary || null,
    adviceFacts: data.adviceFacts || '',
    aiReport: data.aiReport || '',
    aiSections: Array.isArray(data.aiSections) ? data.aiSections : [],
    reviewDigest: data.reviewDigest || null,
    modelUsed: data.modelUsed || '',
    pointsCharged: Number(data.pointsCharged) || 0,
    aiFailed: Boolean(data.aiFailed),
    message: data.message || '',
  }
}

async function syncMerchantOrders(opts) {
  const range = defaultRange()
  const startDate = opts.startDate || range.startDate
  const endDate = opts.endDate || range.endDate
  const dy = readPlatformToken('douyin')
  if (!dy) {
    return { ok: false, message: '尚未同步到来客令牌，请下拉刷新后再试', pulled: 0, upserted: 0 }
  }
  const chunks = eachShopSyncChunks(startDate, endDate)
  let pulled = 0
  let upserted = 0
  const warnings = []
  for (const week of chunks) {
    try {
      const data = await requestShop(
        'POST',
        '/api/meoo-merchant-orders-sync',
        {
          startDate: week.start,
          endDate: week.end,
          douyinToken: dy,
          tenantId: tenantIdHint(),
        },
        120000,
      )
      pulled += Number(data.pulled) || 0
      upserted += Number(data.upserted) || 0
      if (Array.isArray(data.warnings)) {
        for (const w of data.warnings) if (w && !warnings.includes(w)) warnings.push(w)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!warnings.includes(msg)) warnings.push(msg)
    }
  }
  return { ok: true, pulled, upserted, warnings }
}

module.exports = {
  defaultRange,
  shopAnalysisAiPointsFromGross,
  fetchShopAnalysisSummary,
  fetchShopAnalysisAi,
  syncMerchantOrders,
}
